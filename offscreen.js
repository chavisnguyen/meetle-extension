// Records the Meet tab (video + student's voice) mixed with the teacher's mic, chunk by chunk into IndexedDB;
// uploads to Drive when stopped, and finishes any recording a crash left behind.
import { putChunk, getChunks, dropChunks, putMeta, allMeta } from './lib/db.js';
import { uploadBlob } from './lib/upload.js';

const MIME = 'video/webm;codecs=vp9,opus';
let rec = null;
let cfg = null;
let cleanup = () => {};

const say = (text, extra = {}) => chrome.runtime.sendMessage({ type: 'status', text, ...extra });

chrome.runtime.onMessage.addListener((m) => {
  if (m.target !== 'offscreen') return;
  if (m.type === 'start') start(m).catch((e) => say(`Lỗi: ${e.message}`, { recording: false }));
  if (m.type === 'stop' && rec && rec.state !== 'inactive') rec.stop();
  if (m.type === 'recover') recover(m.cfg).catch((e) => say(`Lỗi upload bù: ${e.message}`));
});

async function start({ streamId, meetUrl, sessionId, cfg: c }) {
  cfg = c;
  const tab = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId, maxWidth: 1280, maxHeight: 720, maxFrameRate: 15 } },
  });
  // tabCapture mutes the tab for the teacher: play it back, and mix the teacher's own mic in (Meet never echoes it).
  const ctx = new AudioContext();
  const mix = ctx.createMediaStreamDestination();
  const tabAudio = ctx.createMediaStreamSource(new MediaStream(tab.getAudioTracks()));
  tabAudio.connect(mix);
  tabAudio.connect(ctx.destination);
  let mic = null;
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    ctx.createMediaStreamSource(mic).connect(mix);
  } catch { say('Không có quyền mic: chỉ ghi tiếng học sinh.'); }

  const out = new MediaStream([...tab.getVideoTracks(), ...mix.stream.getAudioTracks()]);
  const sid = `ses_${Date.now()}`;
  const meta = { sid, meetUrl, sessionId, startedAt: Date.now(), state: 'recording' };
  await putMeta(meta);

  rec = new MediaRecorder(out, { mimeType: MIME, videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 96_000 });
  let seq = 0;
  rec.ondataavailable = (e) => { if (e.data.size) putChunk(sid, seq++, e.data); };
  rec.onstop = async () => {
    cleanup();
    meta.endedAt = Date.now();
    await new Promise((r) => setTimeout(r, 300)); // let the last chunk reach the database
    meta.state = 'ready';
    await putMeta(meta);
    say('Đang upload lên Drive…', { recording: false });
    await upload(meta).catch((e) => say(`Upload lỗi (còn trên máy, sẽ thử lại lần mở Chrome sau): ${e.message}`));
  };
  // The Meet tab closing or the call ending ends the video track: stop and save.
  tab.getVideoTracks()[0].onended = () => rec.state !== 'inactive' && rec.stop();
  cleanup = () => { [...tab.getTracks(), ...(mic ? mic.getTracks() : [])].forEach((t) => t.stop()); ctx.close(); };
  rec.start(5000);
  say('Đang ghi…', { recording: true });
}

async function upload(meta) {
  const blob = new Blob(await getChunks(meta.sid), { type: 'video/webm' });
  if (!blob.size) throw new Error('bản ghi rỗng');
  const call = (path, body) => fetch(`${cfg.apiBase}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const r = await call('/extension/uploads', { meetUrl: meta.meetUrl, sessionId: meta.sessionId || '', startedAt: meta.startedAt, size: blob.size, mimeType: 'video/webm' });
  if (!r.ok) throw new Error(r.status === 409 ? 'link Meet này chưa thuộc lớp nào' : `API trả ${r.status}`);
  const { sessionId, folderId, uploadUrl } = await r.json();
  const file = await uploadBlob(uploadUrl, blob, (p) => say(`Upload ${Math.round(p * 100)}%`));
  const done = await call(`/extension/sessions/${sessionId}/complete`, {
    folderId, fileId: file.id, durationSeconds: Math.round(((meta.endedAt || Date.now()) - meta.startedAt) / 1000),
  });
  if (!done.ok) throw new Error(`đã lên Drive nhưng API trả ${done.status}`);
  await dropChunks(meta.sid);
  meta.state = 'uploaded';
  await putMeta(meta);
  say('Đã upload lên Drive.');
}

async function recover(c) {
  cfg = c;
  for (const meta of await allMeta()) if (meta.state !== 'uploaded' && !(rec && rec.state !== 'inactive')) await upload(meta);
}
