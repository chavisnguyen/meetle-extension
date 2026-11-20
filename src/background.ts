import { DEFAULT_API, type Config, type ToBackground, type ToOffscreen } from "./lib/types";

const OFFSCREEN = "offscreen.html";
const config = () =>
  chrome.storage.local.get({ apiBase: DEFAULT_API, token: "" }) as Promise<Config>;
const toOffscreen = (m: ToOffscreen) => chrome.runtime.sendMessage(m);

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Record the Meet tab",
  });
}

async function startRecording(m: Extract<ToBackground, { type: "start" }>) {
  const c = await config();
  if (!c.token) return { error: "Chưa nhập mật khẩu (mở popup > Cài đặt)." };
  const mic = await navigator.permissions.query({ name: "microphone" as PermissionName });
  if (mic.state !== "granted") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("mic.html") });
    return { error: "Cho phép mic ở tab vừa mở, rồi bấm Ghi lại." };
  }
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: m.tab.id });
  await ensureOffscreen();
  await toOffscreen({
    target: "offscreen",
    type: "start",
    streamId,
    meetUrl: m.tab.url,
    sessionId: m.sessionId,
    cfg: c,
  });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((m: ToBackground, _sender, reply) => {
  if (m.type === "start") {
    startRecording(m).then(reply, (e: Error) => reply({ error: e.message }));
    return true; // async reply
  }
  if (m.type === "stop") void toOffscreen({ target: "offscreen", type: "stop" });
  if (m.type === "status")
    void chrome.storage.session.set({ status: m.text, recording: m.recording });
  return false;
});

// A crash or a closed browser leaves chunks behind: finish and upload them when Chrome starts again.
chrome.runtime.onStartup.addListener(async () => {
  const c = await config();
  if (!c.token) return;
  await ensureOffscreen();
  await toOffscreen({ target: "offscreen", type: "recover", cfg: c });
});
