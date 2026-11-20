const $ = (id) => document.getElementById(id);
const show = async () => { $('st').textContent = (await chrome.storage.session.get('status')).status || ''; };
chrome.storage.onChanged.addListener(show);
show();
chrome.storage.local.get({ apiBase: 'https://api.englishmaile.com', token: '' }).then((c) => { $('api').value = c.apiBase; $('tok').value = c.token; });
for (const id of ['api', 'tok']) $(id).onchange = () => chrome.storage.local.set({ apiBase: $('api').value.replace(/\/$/, ''), token: $('tok').value });
// Ask the server which lesson this Meet is: its guess is pre-selected, the teacher only changes it when it is wrong.
async function loadLessons() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const c = await chrome.storage.local.get({ apiBase: 'https://api.englishmaile.com', token: '' });
  if (!c.token || !/^https:\/\/meet\.google\.com\//.test(tab.url || '')) return;
  try {
    const r = await fetch(`${c.apiBase}/extension/sessions?meetUrl=${encodeURIComponent(tab.url)}`, { headers: { Authorization: `Bearer ${c.token}` } });
    if (r.status === 409) return ($('cls').textContent = 'Link Meet này chưa thuộc lớp nào.');
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    $('cls').textContent = d.className;
    $('ses').innerHTML = '<option value="">Tự chọn theo giờ</option>';
    for (const s of d.sessions) {
      const o = new Option(`${s.title} · ${new Date(s.scheduledAt).toLocaleString('vi-VN')}`, s.id);
      o.selected = s.id === d.suggestedId;
      $('ses').append(o);
    }
  } catch (e) { $('cls').textContent = `Không lấy được danh sách buổi (${e.message}).`; }
}
loadLessons();
$('go').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!/^https:\/\/meet\.google\.com\//.test(tab.url || '')) return ($('st').textContent = 'Mở tab Google Meet trước.');
  const r = await chrome.runtime.sendMessage({ type: 'start', sessionId: $('ses').value, tab: { id: tab.id, url: tab.url } });
  if (r && r.error) $('st').textContent = r.error;
};
$('stop').onclick = () => chrome.runtime.sendMessage({ type: 'stop' });
