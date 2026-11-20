// Records the Meet tab (video + student's voice) mixed with the teacher's mic, chunk by chunk into IndexedDB;
// uploads to Drive when stopped, and finishes any recording a crash left behind.
import { putChunk, getChunks, dropChunks, putMeta, allMeta } from "./lib/db";
import type { Config, Meta, ToOffscreen } from "./lib/types";
import { uploadBlob } from "./lib/upload";

const MIME = "video/webm;codecs=vp9,opus";
let rec: MediaRecorder | null = null;
let cfg: Config;
let cleanup = () => {};

const say = (text: string, recording?: boolean) =>
  chrome.runtime.sendMessage({ type: "status", text, recording });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

chrome.runtime.onMessage.addListener((m: ToOffscreen) => {
  if (m.target !== "offscreen") return;
  if (m.type === "start") start(m).catch((e) => say(`Lỗi: ${msg(e)}`, false));
  if (m.type === "stop" && rec && rec.state !== "inactive") rec.stop();
  if (m.type === "recover") recover(m.cfg).catch((e) => say(`Lỗi upload bù: ${msg(e)}`));
});

// Chrome's own constraint names for a tab's stream; they are not in the DOM typings.
const tabConstraints = (streamId: string, extra: object = {}) => ({
  mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId, ...extra },
});

/** A picture and a tone, for tests that cannot press the toolbar button tabCapture needs. */
function fakeTabStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const g = canvas.getContext("2d")!;
  let n = 0;
  setInterval(() => {
    g.fillStyle = `hsl(${(n += 7) % 360} 70% 50%)`;
    g.fillRect(0, 0, 320, 180);
  }, 100);
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const out = ctx.createMediaStreamDestination();
  osc.connect(out);
  osc.start();
  return new MediaStream([
    ...canvas.captureStream(10).getVideoTracks(),
    ...out.stream.getAudioTracks(),
  ]);
}

async function start(m: Extract<ToOffscreen, { type: "start" }>) {
  cfg = m.cfg;
  const tab = m.fake
    ? fakeTabStream()
    : await navigator.mediaDevices.getUserMedia({
        audio: tabConstraints(m.streamId),
        video: tabConstraints(m.streamId, { maxWidth: 1280, maxHeight: 720, maxFrameRate: 15 }),
      } as unknown as MediaStreamConstraints);

  // tabCapture mutes the tab for the teacher: play it back, and mix the teacher's own mic in (Meet never echoes it).
  const ctx = new AudioContext();
  const mix = ctx.createMediaStreamDestination();
  const tabAudio = ctx.createMediaStreamSource(new MediaStream(tab.getAudioTracks()));
  tabAudio.connect(mix);
  if (!m.fake) tabAudio.connect(ctx.destination);
  let mic: MediaStream | null = null;
  if (!m.fake) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
      ctx.createMediaStreamSource(mic).connect(mix);
    } catch {
      say("Không có quyền mic: chỉ ghi tiếng học sinh.");
    }
  }

  const out = new MediaStream([...tab.getVideoTracks(), ...mix.stream.getAudioTracks()]);
  const sid = `ses_${Date.now()}`;
  const meta: Meta = {
    sid,
    meetUrl: m.meetUrl,
    sessionId: m.sessionId,
    startedAt: Date.now(),
    state: "recording",
  };
  await putMeta(meta);

  const recorder = new MediaRecorder(out, {
    mimeType: MIME,
    videoBitsPerSecond: 1_000_000,
    audioBitsPerSecond: 96_000,
  });
  rec = recorder;
  let seq = 0;
  recorder.ondataavailable = (e) => {
    if (e.data.size) putChunk(sid, seq++, e.data);
  };
  recorder.onstop = async () => {
    cleanup();
    meta.endedAt = Date.now();
    await new Promise((r) => setTimeout(r, 300)); // let the last chunk reach the database
    meta.state = "ready";
    await putMeta(meta);
    say("Đang upload lên Drive…", false);
    await upload(meta).catch((e) =>
      say(`Upload lỗi (còn trên máy, sẽ thử lại lần mở Chrome sau): ${msg(e)}`),
    );
  };
  // The Meet tab closing or the call ending ends the video track: stop and save.
  tab.getVideoTracks()[0].onended = () => recorder.state !== "inactive" && recorder.stop();
  cleanup = () => {
    [...tab.getTracks(), ...(mic?.getTracks() ?? [])].forEach((t) => t.stop());
    void ctx.close();
  };
  recorder.start(5000);
  say("Đang ghi…", true);
}

async function upload(meta: Meta) {
  const blob = new Blob(await getChunks(meta.sid), { type: "video/webm" });
  if (!blob.size) throw new Error("bản ghi rỗng");
  const call = (path: string, body: object) =>
    fetch(`${cfg.apiBase}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const r = await call("/extension/uploads", {
    meetUrl: meta.meetUrl,
    sessionId: meta.sessionId || "",
    startedAt: meta.startedAt,
    size: blob.size,
    mimeType: "video/webm",
  });
  if (!r.ok)
    throw new Error(r.status === 409 ? "link Meet này chưa thuộc lớp nào" : `API trả ${r.status}`);
  const { sessionId, folderId, uploadUrl } = (await r.json()) as {
    sessionId: string;
    folderId: string;
    uploadUrl: string;
  };
  const file = await uploadBlob(uploadUrl, blob, (p) => say(`Upload ${Math.round(p * 100)}%`));
  const ok = await call(`/extension/sessions/${sessionId}/complete`, {
    folderId,
    fileId: file.id,
    durationSeconds: Math.round(((meta.endedAt ?? Date.now()) - meta.startedAt) / 1000),
  });
  if (!ok.ok) throw new Error(`đã lên Drive nhưng API trả ${ok.status}`);
  await dropChunks(meta.sid);
  meta.state = "uploaded";
  await putMeta(meta);
  say("Đã upload lên Drive.");
}

async function recover(c: Config) {
  cfg = c;
  for (const meta of await allMeta()) {
    if (meta.state !== "uploaded" && !(rec && rec.state !== "inactive")) await upload(meta);
  }
}
