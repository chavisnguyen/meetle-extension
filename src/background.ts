import { DEFAULT_API, type Config, type ToBackground, type ToOffscreen } from "./lib/types";

const OFFSCREEN = "offscreen.html";
const config = async (): Promise<Config> => ({
  apiBase: ((await chrome.storage.local.get({ apiBase: DEFAULT_API })) as Config).apiBase,
});
const toOffscreen = (m: ToOffscreen) => chrome.runtime.sendMessage(m);

/**
 * The teacher's token from the API. Signing in sends the browser through Google and back to the API's own callback,
 * which answers with the token in the #fragment. `fresh` drops the stored one first (the API refused it).
 */
async function googleToken(interactive: boolean, fresh = false) {
  if (fresh) await chrome.storage.local.remove("token");
  const stored = ((await chrome.storage.local.get("token")) as { token?: string }).token;
  if (stored || !interactive) return stored;
  const back = chrome.identity.getRedirectURL("cb");
  const url = await chrome.identity.launchWebAuthFlow({
    interactive: true,
    url: `${(await config()).apiBase}/extension/login?redirect=${encodeURIComponent(back)}`,
  });
  const done = new URL(url ?? back);
  const token = new URLSearchParams(done.hash.slice(1)).get("token");
  if (!token)
    throw new Error(
      done.searchParams.get("error") === "not_a_teacher"
        ? "Email này chưa có trong danh sách giáo viên đang dạy."
        : "Đăng nhập Google không thành công.",
    );
  await chrome.storage.local.set({ token });
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
  await googleToken(true); // signs in first when needed; throws a message the popup shows
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
      (e: Error) => {
        // The sign-in window closes the popup, so nobody is listening for the reply: keep the reason for the next open.
        void chrome.storage.session.set({ loginError: e.message });
        reply({ token: undefined, error: e.message });
      },
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
