import { DEFAULT_API, type Config, type ToBackground, type ToOffscreen } from "./lib/types";

const OFFSCREEN = "offscreen.html";
const config = async (): Promise<Config> => ({
  apiBase: ((await chrome.storage.local.get({ apiBase: DEFAULT_API })) as Config).apiBase,
});
const toOffscreen = (m: ToOffscreen) => chrome.runtime.sendMessage(m);

/** The access token of the Google account Chrome is signed in to; the API turns it into an email. */
async function googleToken(interactive: boolean, fresh = false) {
  let { token } = await chrome.identity.getAuthToken({ interactive });
  if (fresh && token) {
    await chrome.identity.removeCachedAuthToken({ token });
    ({ token } = await chrome.identity.getAuthToken({ interactive }));
  }
  return token;
}

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Record the Meet tab",
  });
}

async function startRecording(m: Extract<ToBackground, { type: "start" }>) {
  if (!(await googleToken(true))) return { error: "Chưa đăng nhập Google trong Chrome." };
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
    cfg: await config(),
  });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((m: ToBackground | ToOffscreen, _sender, reply) => {
  if ("target" in m) return false; // meant for the offscreen page
  if (m.type === "start") {
    startRecording(m).then(reply, (e: Error) => reply({ error: e.message }));
    return true; // async reply
  }
  if (m.type === "token") {
    googleToken(true, m.fresh).then(
      (token) => reply({ token }),
      () => reply({ token: undefined }),
    );
    return true;
  }
  if (m.type === "stop") void toOffscreen({ target: "offscreen", type: "stop" });
  if (m.type === "status")
    void chrome.storage.session.set({ status: m.text, recording: m.recording });
  return false;
});

// A crash or a closed browser leaves chunks behind: finish and upload them when Chrome starts again.
// Quietly: no sign-in window pops up at startup, so without a cached sign-in the leftover waits for the next recording.
chrome.runtime.onStartup.addListener(async () => {
  if (!(await googleToken(false).catch(() => undefined))) return;
  await ensureOffscreen();
  await toOffscreen({ target: "offscreen", type: "recover", cfg: await config() });
});
