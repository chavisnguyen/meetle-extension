const OFFSCREEN = 'offscreen.html';
const cfg = async () => (await chrome.storage.local.get({ apiBase: 'https://api.englishmaile.com', token: '' }));

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({ url: OFFSCREEN, reasons: ['USER_MEDIA'], justification: 'Record the Meet tab' });
}

chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m.type === 'start') {
    (async () => {
      const c = await cfg();
      if (!c.token) return reply({ error: 'Chưa nhập token API (mở popup > Cài đặt).' });
      const mic = await navigator.permissions.query({ name: 'microphone' });
      if (mic.state !== 'granted') {
        await chrome.tabs.create({ url: chrome.runtime.getURL('mic.html') });
        return reply({ error: 'Cho phép mic ở tab vừa mở, rồi bấm Ghi lại.' });
      }
      const tab = m.tab;
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      await ensureOffscreen();
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'start', streamId, meetUrl: tab.url, sessionId: m.sessionId, cfg: c });
      reply({ ok: true });
    })().catch((e) => reply({ error: e.message }));
    return true; // async reply
  }
  if (m.type === 'stop') chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' });
  if (m.type === 'status') chrome.storage.session.set({ status: m.text, recording: m.recording ?? undefined });
});

// A crash or a closed browser leaves chunks behind: finish and upload them when Chrome starts again.
chrome.runtime.onStartup.addListener(async () => {
  const c = await cfg();
  if (!c.token) return;
  await ensureOffscreen();
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'recover', cfg: c });
});
