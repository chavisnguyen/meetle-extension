import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ranges, STEP, uploadBlob } from "./upload";

afterEach(() => vi.unstubAllGlobals());

describe("ranges", () => {
  it("cuts into pieces and ends on the last byte", () => {
    expect(ranges(10, 4)).toEqual([
      [0, 3],
      [4, 7],
      [8, 9],
    ]);
    expect(ranges(8, 4)).toEqual([
      [0, 3],
      [4, 7],
    ]);
  });
  it("keeps every piece a multiple of 256 KiB, as Drive requires", () => {
    expect(STEP % (256 * 1024)).toBe(0);
  });
});

describe("uploadBlob", () => {
  const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  it("sends the file in order and resolves with Drive's file", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      seen.push((init.headers as Record<string, string>)["Content-Range"]);
      return seen.length < 2 ? reply(308) : reply(200, { id: "file1" });
    });
    const file = await uploadBlob("u", new Blob([new Uint8Array(STEP + 5)]));
    expect(file.id).toBe("file1");
    expect(seen).toEqual([
      `bytes 0-${STEP - 1}/${STEP + 5}`,
      `bytes ${STEP}-${STEP + 4}/${STEP + 5}`,
    ]);
  });

  it("resumes from what Drive already has after a failed piece", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      const range = (init.headers as Record<string, string>)["Content-Range"];
      calls.push(range);
      if (calls.length === 1) throw new Error("network down");
      if (range.startsWith("bytes */")) return reply(308, {}, { Range: "bytes=0-9" }); // Drive has the first 10 bytes
      return reply(200, { id: "file2" });
    });
    const p = uploadBlob("u", new Blob([new Uint8Array(30)]));
    await vi.runAllTimersAsync();
    expect((await p).id).toBe("file2");
    expect(calls).toEqual(["bytes 0-29/30", "bytes */30", "bytes 10-29/30"]);
    vi.useRealTimers();
  });

  it("gives up after repeated failures", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", async () => {
      throw new Error("down");
    });
    const p = uploadBlob("u", new Blob([new Uint8Array(5)]));
    const assertion = expect(p).rejects.toThrow("down");
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });
});
