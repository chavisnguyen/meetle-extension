// End to end, no Google: the built extension runs in a real Chromium against a fake API and a fake Drive on this machine.
// Covers what a unit test cannot: MediaRecorder -> IndexedDB -> the API's calls -> the Drive resumable PUTs, and the
// recovery of a recording a crash left behind. NOT covered: tabCapture (it needs a toolbar click) and real Meet.
//   pnpm e2e        (builds first; needs `playwright install chromium` once)
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { chromium, type BrowserContext } from "playwright";

const PASSWORD = "p".repeat(32);
const MEET = "https://meet.google.com/abc-defg-hij";

// --- the fake API + Drive -----------------------------------------------------------------------------------------
let base = "";
const drive = { bytes: 0, head: Buffer.alloc(0) as Buffer, done: false };
const completed: { path: string; body: Record<string, unknown> }[] = [];
const resetRun = () => {
  drive.bytes = 0;
  drive.head = Buffer.alloc(0) as Buffer;
  drive.done = false;
  completed.length = 0;
};

const read = (req: IncomingMessage) =>
  new Promise<Buffer>((res) => {
    const parts: Buffer[] = [];
    req.on("data", (c: Buffer) => parts.push(c));
    req.on("end", () => res(Buffer.concat(parts)));
  });

const server = createServer(async (req, res) => {
  const body = await read(req);
  const send = (status: number, json: unknown = {}, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(json));
  };
  const path = req.url ?? "";
  if (path.startsWith("/drive/")) {
    // the pre-authorised upload URL: no password on it, like Drive's
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(String(req.headers["content-range"]));
    if (!m) return send(308);
    if (Number(m[1]) === 0) drive.head = body.subarray(0, 4);
    drive.bytes += body.length;
    if (Number(m[2]) + 1 === Number(m[3])) {
      drive.done = true;
      return send(200, { id: "file123456" });
    }
    return send(308, {}, { Range: `bytes=0-${m[2]}` });
  }
  if (req.headers.authorization !== `Bearer ${PASSWORD}`)
    return send(401, { error: "unauthorized" });
  if (path === "/extension/uploads") {
    const sent = JSON.parse(body.toString()) as Record<string, unknown>;
    assert.equal(sent.meetUrl, MEET);
    assert.equal(sent.mimeType, "video/webm");
    assert.equal(sent.sessionId, "ses_picked");
    assert.ok(Number(sent.size) > 0);
    return send(200, {
      sessionId: "ses_picked",
      folderId: "folder12345",
      uploadUrl: `${base}/drive/up`,
    });
  }
  if (path === "/extension/sessions/ses_picked/complete") {
    completed.push({ path, body: JSON.parse(body.toString()) as Record<string, unknown> });
    return send(200, { status: "completed" });
  }
  send(404);
});

// --- driving the extension ----------------------------------------------------------------------------------------
async function launch() {
  const dist = new URL("../dist", import.meta.url).pathname;
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  return { context, id: new URL(worker.url()).host };
}

/** The extension's own recording page, which is what the background's offscreen document is. */
const startRecording = async (context: BrowserContext, id: string) => {
  const offscreen = await context.newPage();
  await offscreen.goto(`chrome-extension://${id}/offscreen.html`);
  const popup = await context.newPage(); // any extension page can message the offscreen one
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.evaluate(
    ([apiBase, token, meetUrl]) =>
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "start",
        streamId: "",
        meetUrl,
        sessionId: "ses_picked",
        cfg: { apiBase, token },
        fake: true,
      }),
    [base, PASSWORD, MEET],
  );
  return { offscreen, popup };
};

const until = async (what: string, ok: () => boolean, ms = 30_000) => {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
};

const checkUploaded = () => {
  assert.ok(drive.done, "Drive got the last piece");
  assert.ok(drive.bytes > 5_000, `a real recording reached Drive (${drive.bytes} bytes)`);
  assert.deepEqual([...drive.head], [0x1a, 0x45, 0xdf, 0xa3], "it is a WebM file (EBML header)");
  assert.equal(completed.length, 1, "the API was told once");
  assert.equal(completed[0].body.fileId, "file123456");
  assert.equal(completed[0].body.folderId, "folder12345");
  assert.ok(Number(completed[0].body.durationSeconds) >= 5, "duration comes from the recording");
};

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://localhost:${(server.address() as { port: number }).port}`;

  // 1. record, stop, upload
  let { context, id } = await launch();
  let { popup } = await startRecording(context, id);
  await new Promise((r) => setTimeout(r, 12_000)); // more than two 5 s chunks
  await popup.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", type: "stop" }));
  await until("upload after Stop", () => completed.length > 0);
  checkUploaded();
  console.log("ok  record -> stop -> upload", `(${drive.bytes} bytes)`);
  await context.close();

  // 2. crash: the recording page vanishes without Stop; on the next start the leftover must upload by itself
  resetRun();
  const dir = (await import("node:fs")).mkdtempSync(
    (await import("node:os")).tmpdir() + "/meetle-e2e-",
  );
  const dist = new URL("../dist", import.meta.url).pathname;
  const args = [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    "--autoplay-policy=no-user-gesture-required",
  ];
  const open = () =>
    chromium.launchPersistentContext(dir, { channel: "chromium", headless: true, args });
  context = await open();
  id = new URL((context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))).url())
    .host;
  ({ popup } = await startRecording(context, id));
  await new Promise((r) => setTimeout(r, 8_000));
  await context.close(); // like a crash: no Stop, the state stays "recording" in IndexedDB
  assert.equal(drive.done, false, "nothing was uploaded before the crash");

  context = await open();
  id = new URL((context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))).url())
    .host;
  await context.newPage().then((p) => p.goto(`chrome-extension://${id}/offscreen.html`));
  const again = await context.newPage();
  await again.goto(`chrome-extension://${id}/popup.html`);
  await again.evaluate(
    ([apiBase, token]) =>
      chrome.runtime.sendMessage({ target: "offscreen", type: "recover", cfg: { apiBase, token } }),
    [base, PASSWORD],
  );
  await until("recovery upload", () => completed.length > 0);
  checkUploaded();
  console.log("ok  crash -> reopen -> the leftover uploads by itself", `(${drive.bytes} bytes)`);
  await context.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAIL", e);
    process.exit(1);
  });
