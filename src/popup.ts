import { DEFAULT_API, type Config, type ToBackground } from "./lib/types";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const MEET = "https://meet.google.com/";

interface Lessons {
  className: string;
  other?: boolean; // the Meet is no class's: it is recorded into the "Other" folder
  suggestedId: string;
  sessions: { id: string; title: string; scheduledAt: string }[];
}

// Which button the teacher sees depends on whether this Meet is known (ready) and whether a recording runs.
let ready = false;
const show = async () => {
  const s = (await chrome.storage.session.get(["status", "recording"])) as {
    status?: string;
    recording?: boolean;
  };
  $("st").textContent = s.status ?? "";
  $("go").hidden = !ready || !!s.recording;
  $("stop").hidden = !s.recording;
};
chrome.storage.onChanged.addListener(show);
void show();

const stored = () => chrome.storage.local.get({ apiBase: DEFAULT_API }) as Promise<Config>;
const activeTab = async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

// Ask the server which lesson this Meet is: its guess is pre-selected, the teacher only changes it when it is wrong.
async function loadLessons() {
  ready = false;
  $("ses").hidden = true;
  void show();
  const tab = await activeTab();
  if (!tab.url?.startsWith(MEET)) {
    $("cls").textContent = "Mở tab Google Meet của buổi học, rồi bấm lại biểu tượng extension.";
    return;
  }
  $("cls").className = "";
  $("cls").textContent = "Đang tìm lớp…";
  try {
    const url = `${(await stored()).apiBase}/extension/sessions?meetUrl=${encodeURIComponent(tab.url)}`;
    const ask = async (fresh: boolean) => {
      const { token, error } = (await chrome.runtime.sendMessage({ type: "token", fresh })) as {
        token?: string;
        error?: string;
      };
      if (!token) throw new Error(error ?? "Chưa đăng nhập.");
      return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    };
    let r = await ask(false);
    if (r.status === 401) r = await ask(true); // the token expired or was revoked: sign in again once
    if (r.status === 401 || r.status === 403) {
      $("cls").textContent = "Email này chưa có trong danh sách giáo viên đang dạy.";
      return;
    }
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as Lessons;
    $("cls").className = d.other ? "warn" : "";
    if (d.other) {
      $("cls").textContent =
        "Meet này không thuộc lớp nào trong hệ thống. Bản ghi sẽ vào thư mục “Other” trên Drive.";
      ready = true;
      void show();
      return;
    }
    $("cls").textContent = d.className;
    const list = $<HTMLSelectElement>("ses");
    list.innerHTML = '<option value="">Tự chọn theo giờ</option>';
    for (const s of d.sessions) {
      const o = new Option(`${s.title} · ${new Date(s.scheduledAt).toLocaleString("vi-VN")}`, s.id);
      o.selected = s.id === d.suggestedId;
      list.append(o);
    }
    list.hidden = false;
    ready = true;
    void show();
  } catch (e) {
    $("cls").textContent = `Không lấy được danh sách buổi (${(e as Error).message}).`;
  }
}
// Not signed in: the first and only thing the popup offers is the sign-in; the recorder shows after it.
async function init() {
  const signedIn = !!((await chrome.storage.local.get("token")) as { token?: string }).token;
  $("login").hidden = signedIn;
  $("app").hidden = !signedIn;
  if (signedIn) {
    $("email").textContent = tokenEmail(
      ((await chrome.storage.local.get("token")) as { token: string }).token,
    );
    return loadLessons();
  }
  const { loginError } = (await chrome.storage.session.get("loginError")) as {
    loginError?: string;
  };
  $("lerr").textContent = loginError ?? "";
  await chrome.storage.session.remove("loginError");
}
// The token is "<base64url(email|expiry)>.<signature>": the email is only for showing whose it is.
const tokenEmail = (t: string) => {
  try {
    return atob(t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")).split("|")[0];
  } catch {
    return "";
  }
};
$("out").onclick = async (e) => {
  e.preventDefault();
  await chrome.storage.local.remove("token");
  await init();
};
$("signin").onclick = async () => {
  const r = (await chrome.runtime.sendMessage({ type: "token" } satisfies ToBackground)) as {
    token?: string;
    error?: string;
  };
  if (r.token) await init();
  else $("lerr").textContent = r.error ?? "Đăng nhập không thành công.";
};
$("ver").textContent = `Meetle Recorder v${chrome.runtime.getManifest().version}`;
void init();

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
