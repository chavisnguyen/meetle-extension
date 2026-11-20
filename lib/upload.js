// Drive resumable upload: every piece but the last must be a multiple of 256 KiB.
export const STEP = 32 * 256 * 1024; // 8 MiB

export function ranges(size, step = STEP) {
  const out = [];
  for (let s = 0; s < size; s += step) out.push([s, Math.min(s + step, size) - 1]);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Asks Drive how much it already has (after a failed piece), so we resume instead of restarting.
async function received(url, size) {
  const r = await fetch(url, { method: 'PUT', headers: { 'Content-Range': `bytes */${size}` } });
  if (r.status === 200 || r.status === 201) return size;
  const m = /bytes=0-(\d+)/.exec(r.headers.get('Range') || '');
  return m ? Number(m[1]) + 1 : 0;
}

// Resolves with Drive's file resource ({id,...}) once the last piece is in.
export async function uploadBlob(url, blob, onProgress = () => {}) {
  const size = blob.size;
  let offset = 0;
  let fails = 0;
  while (offset < size) {
    const end = Math.min(offset + STEP, size);
    try {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${size}` },
        body: blob.slice(offset, end),
      });
      if (r.status === 200 || r.status === 201) { onProgress(1); return await r.json(); }
      if (r.status !== 308) throw new Error(`Drive answered ${r.status}`);
      offset = end;
      fails = 0;
      onProgress(offset / size);
    } catch (e) {
      if (++fails > 6) throw e;
      await sleep(2000 * fails);
      offset = await received(url, size).catch(() => offset);
    }
  }
}
