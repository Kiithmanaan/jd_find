import type { SessionState } from "../lib/types.js";
import { getApiBase, getActiveSearchRunId, setApiBase } from "../lib/storage.js";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const statusEl = $("status");
const loginView = $("login-view");
const sessionView = $("session-view");

function sendMessage<T = unknown>(message: unknown): Promise<T> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function setStatus(text: string, ok: boolean): void {
  statusEl.textContent = text;
  statusEl.className = `status ${ok ? "ok" : "warn"}`;
}

function render(session: SessionState): void {
  if (session.loggedIn) {
    setStatus(`已登录：${session.email ?? ""}`, true);
    loginView.classList.add("hidden");
    sessionView.classList.remove("hidden");
    $<HTMLInputElement>("searchRunId").value = session.activeSearchRunId ?? "";
  } else {
    setStatus("未登录", false);
    sessionView.classList.add("hidden");
    loginView.classList.remove("hidden");
  }
}

async function init(): Promise<void> {
  $<HTMLInputElement>("apiBase").value = await getApiBase();
  const res = await sendMessage<{ ok: boolean; session?: SessionState }>({ type: "GET_SESSION" });
  const activeRun = await getActiveSearchRunId();
  if (res.session) {
    render({ ...res.session, activeSearchRunId: res.session.activeSearchRunId ?? activeRun });
  }
}

$("login-btn").addEventListener("click", async () => {
  const apiBase = $<HTMLInputElement>("apiBase").value.trim();
  const email = $<HTMLInputElement>("email").value.trim();
  const password = $<HTMLInputElement>("password").value;
  if (!email || !password) {
    setStatus("请填写邮箱和密码", false);
    return;
  }
  if (apiBase) await setApiBase(apiBase);
  setStatus("登录中…", false);
  const res = await sendMessage<{ ok: boolean; session?: SessionState; error?: { message: string } }>({
    type: "LOGIN",
    email,
    password,
  });
  if (res.ok && res.session) {
    render(res.session);
  } else {
    setStatus(`登录失败：${res.error?.message ?? "未知错误"}`, false);
  }
});

$("save-run-btn").addEventListener("click", async () => {
  const searchRunId = $<HTMLInputElement>("searchRunId").value.trim();
  const res = await sendMessage<{ ok: boolean; session?: SessionState }>({
    type: "SET_ACTIVE_RUN",
    searchRunId,
  });
  if (res.ok && res.session) {
    render(res.session);
    setStatus(searchRunId ? "已保存 SearchRun" : "已清除 SearchRun", true);
  }
});

$("logout-btn").addEventListener("click", async () => {
  const res = await sendMessage<{ ok: boolean; session?: SessionState }>({ type: "LOGOUT" });
  if (res.ok && res.session) render(res.session);
});

void init();
