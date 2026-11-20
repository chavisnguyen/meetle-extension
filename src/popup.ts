import { DEFAULT_API, type Config, type ToBackground } from "./lib/types";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const MEET = "https://meet.google.com/";

interface Lessons {
  className: string;
  suggestedId: string;
  sessions: { id: string; title: string; scheduledAt: string }[];
}

const show = async () => {
  $("st").textContent =
    ((await chrome.storage.session.get("status")).status as string | undefined) ?? "";
};
chrome.storage.onChanged.addListener(show);
void show();

const stored = () =>
  chrome.storage.local.get({ apiBase: DEFAULT_API, token: "" }) as Promise<Config>;
void stored().then((c) => {
  $<HTMLInputElement>("api").value = c.apiBase;
  $<HTMLInputElement>("tok").value = c.token;
});
for (const id of ["api", "tok"]) {
  $(id).onchange = () =>
    chrome.storage.local.set({
      apiBase: $<HTMLInputElement>("api").value.replace(/\/$/, ""),
      token: $<HTMLInputElement>("tok").value,
    });
}

const activeTab = async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

// Ask the server which lesson this Meet is: its guess is pre-selected, the teacher only changes it when it is wrong.
async function loadLessons() {
  const tab = await activeTab();
  const c = await stored();
  if (!c.token || !tab.url?.startsWith(MEET)) return;
  try {
    const r = await fetch(
      `${c.apiBase}/extension/sessions?meetUrl=${encodeURIComponent(tab.url)}`,
      {
        headers: { Authorization: `Bearer ${c.token}` },
      },
    );
    if (r.status === 409) {
      $("cls").textContent = "Link Meet này chưa thuộc lớp nào.";
      return;
    }
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as Lessons;
    $("cls").textContent = d.className;
    const list = $<HTMLSelectElement>("ses");
    list.innerHTML = '<option value="">Tự chọn theo giờ</option>';
    for (const s of d.sessions) {
      const o = new Option(`${s.title} · ${new Date(s.scheduledAt).toLocaleString("vi-VN")}`, s.id);
      o.selected = s.id === d.suggestedId;
      list.append(o);
    }
  } catch (e) {
    $("cls").textContent = `Không lấy được danh sách buổi (${(e as Error).message}).`;
  }
}
void loadLessons();

$("go").onclick = async () => {
  const tab = await activeTab();
  if (!tab.url?.startsWith(MEET) || tab.id === undefined) {
    $("st").textContent = "Mở tab Google Meet trước.";
    return;
  }
  const m: ToBackground = {
    type: "start",
    sessionId: $<HTMLSelectElement>("ses").value,
    tab: { id: tab.id, url: tab.url },
  };
  const r = (await chrome.runtime.sendMessage(m)) as { error?: string } | undefined;
  if (r?.error) $("st").textContent = r.error;
};
$("stop").onclick = () => chrome.runtime.sendMessage({ type: "stop" } satisfies ToBackground);
