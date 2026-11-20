// Drive resumable upload: every piece but the last must be a multiple of 256 KiB.
export const STEP = 32 * 256 * 1024; // 8 MiB

export function ranges(size: number, step = STEP): [number, number][] {
  const out: [number, number][] = [];
  for (let s = 0; s < size; s += step) out.push([s, Math.min(s + step, size) - 1]);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const done = (status: number) => status === 200 || status === 201;

export interface DriveFile {
  id: string;
}

// Asks Drive how much it already has (after a failed piece), so we resume instead of restarting.
// A finished upload answers with the file itself.
async function received(url: string, size: number): Promise<number | DriveFile> {
  const r = await fetch(url, { method: "PUT", headers: { "Content-Range": `bytes */${size}` } });
  if (done(r.status)) return (await r.json()) as DriveFile;
  const m = /bytes=0-(\d+)/.exec(r.headers.get("Range") ?? "");
  return m ? Number(m[1]) + 1 : 0;
}

// Resolves with Drive's file resource ({id,...}) once the last piece is in.
export async function uploadBlob(
  url: string,
  blob: Blob,
  onProgress: (p: number) => void = () => {},
): Promise<DriveFile> {
  const size = blob.size;
  let offset = 0;
  let fails = 0;
  while (offset < size) {
    const end = Math.min(offset + STEP, size);
    try {
      const r = await fetch(url, {
        method: "PUT",
        headers: { "Content-Range": `bytes ${offset}-${end - 1}/${size}` },
        body: blob.slice(offset, end),
      });
      if (done(r.status)) {
        onProgress(1);
        return (await r.json()) as DriveFile;
      }
      if (r.status !== 308) throw new Error(`Drive answered ${r.status}`);
      offset = end;
      fails = 0;
      onProgress(offset / size);
    } catch (e) {
      if (++fails > 6) throw e;
      await sleep(2000 * fails);
      const got = await received(url, size).catch(() => offset);
      if (typeof got !== "number") return got;
      offset = got;
    }
  }
  throw new Error("Drive did not confirm the upload");
}
