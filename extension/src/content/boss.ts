// 运行在隔离世界（默认 world, run_at document_idle）。
// 职责：监听 hook 转发的 Boss JSON → 映射并按指纹缓冲去重；注入悬浮面板；
// 用户点「抓取本页」时合并缓冲 + DOM 兑底，交 background 提交。

import { mapBossGeek, type BossGeekLike } from "./field-map.js";
import { scrapeVisibleCandidates, countVisibleCards } from "./scrape-dom.js";
import type { CandidateDraft, SessionState } from "../lib/types.js";

const EVENT_NAME = "jdfind:boss-json";
// 采样开关：首次抓到候选人 JSON 时打一条到 console，便于校准 field-map（见 README）
let DEBUG_LOGGED = false;

// 指纹 → 候选人缓冲
const buffer = new Map<string, CandidateDraft>();

// ---- 从任意 JSON 里启发式提取「像候选人」的对象数组 ----
function looksLikeGeek(o: Record<string, unknown>): boolean {
  const hasName = "geekName" in o || "name" in o;
  const hasSignal =
    "expectPositionName" in o ||
    "positionName" in o ||
    "encryptGeekId" in o ||
    "geekId" in o ||
    "geekCard" in o;
  return hasName && hasSignal;
}

function collectGeeks(node: unknown, out: BossGeekLike[], depth = 0): void {
  if (depth > 6 || out.length > 200) return;
  if (Array.isArray(node)) {
    for (const item of node) collectGeeks(item, out, depth + 1);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (looksLikeGeek(obj)) out.push(obj as BossGeekLike);
    for (const key of Object.keys(obj)) collectGeeks(obj[key], out, depth + 1);
  }
}

function ingest(url: string, json: unknown): void {
  const geeks: BossGeekLike[] = [];
  collectGeeks(json, geeks);
  if (geeks.length === 0) return;

  if (!DEBUG_LOGGED) {
    DEBUG_LOGGED = true;
    // 校准用：把首个候选人对象原样打出来，据此修正 field-map.ts
    console.log("[jd_find] 采样 Boss 候选人 JSON（来自", url, "）：", geeks[0]);
  }

  let added = 0;
  for (const g of geeks) {
    const draft = mapBossGeek(g);
    if (draft && !buffer.has(draft.fingerprint)) {
      buffer.set(draft.fingerprint, draft);
      added += 1;
    }
  }
  if (added > 0) updatePanelCounts();
}

window.addEventListener(EVENT_NAME, (e: Event) => {
  try {
    const detail = (e as CustomEvent).detail;
    const parsed = typeof detail === "string" ? JSON.parse(detail) : detail;
    if (parsed && typeof parsed === "object") ingest(parsed.url ?? "", parsed.json);
  } catch {
    /* ignore */
  }
});

// ---- 悬浮面板 ----
let panel: HTMLElement | null = null;
let statusEl: HTMLElement | null = null;
let countEl: HTMLElement | null = null;
let resultEl: HTMLElement | null = null;

function updatePanelCounts(): void {
  if (countEl) {
    countEl.textContent = `已捕获 ${buffer.size} 人 · 本页卡片 ${countVisibleCards()}`;
  }
}

async function sendMessage<T = unknown>(message: unknown): Promise<T> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function refreshSession(): Promise<void> {
  const res = await sendMessage<{ ok: boolean; session?: SessionState }>({ type: "GET_SESSION" });
  const s = res.session;
  if (!statusEl) return;
  if (s?.loggedIn) {
    statusEl.textContent = `已登录 ${s.email ?? ""} · run ${s.activeSearchRunId ? s.activeSearchRunId.slice(0, 8) + "…" : "未设置"}`;
    statusEl.className = "jdf-status jdf-ok";
  } else {
    statusEl.textContent = "未登录 — 请在插件弹窗中登录并设置 searchRunId";
    statusEl.className = "jdf-status jdf-warn";
  }
}

async function onCapture(): Promise<void> {
  if (!resultEl) return;
  resultEl.textContent = "抓取中…";

  // 合并 hook 缓冲 + DOM 兑底，按指纹去重
  const merged = new Map(buffer);
  for (const c of scrapeVisibleCandidates()) {
    if (!merged.has(c.fingerprint)) merged.set(c.fingerprint, c);
  }
  const candidates = Array.from(merged.values());
  if (candidates.length === 0) {
    resultEl.textContent = "本页未捕获到候选人。滚动浏览列表让页面加载数据后再试。";
    return;
  }

  const res = await sendMessage<{
    ok: boolean;
    submitted?: number;
    accepted?: number;
    runStatus?: string;
    stopped?: boolean;
    error?: { code: string; message: string };
  }>({ type: "SUBMIT_CANDIDATES", candidates, sourcePlatform: "Boss" });

  if (res.ok) {
    resultEl.textContent = `已提交 ${res.submitted} 人，新增接收 ${res.accepted} 人（run 状态：${res.runStatus ?? "-"}）。`;
    resultEl.className = "jdf-result jdf-ok";
    buffer.clear();
    updatePanelCounts();
  } else {
    const stopHint = res.stopped ? "（该 SearchRun 已终止/需重新登录，请处理后重试）" : "";
    resultEl.textContent = `提交失败：${res.error?.code ?? "错误"} — ${res.error?.message ?? ""} ${stopHint}`;
    resultEl.className = "jdf-result jdf-warn";
  }
}

function buildPanel(): void {
  if (document.getElementById("jdfind-panel")) return;
  panel = document.createElement("div");
  panel.id = "jdfind-panel";
  panel.className = "jdf-panel";
  panel.innerHTML = `
    <div class="jdf-head">
      <span class="jdf-title">jd_find 抓取</span>
      <button class="jdf-min" title="折叠">—</button>
    </div>
    <div class="jdf-body">
      <div class="jdf-status jdf-warn" id="jdf-status">加载中…</div>
      <div class="jdf-count" id="jdf-count">已捕获 0 人</div>
      <button class="jdf-capture" id="jdf-capture">抓取本页候选人</button>
      <div class="jdf-result" id="jdf-result"></div>
      <div class="jdf-hint">被动只读 · 仅抓取你正在浏览的页面</div>
    </div>`;
  document.body.appendChild(panel);

  statusEl = panel.querySelector("#jdf-status");
  countEl = panel.querySelector("#jdf-count");
  resultEl = panel.querySelector("#jdf-result");

  panel.querySelector<HTMLButtonElement>("#jdf-capture")?.addEventListener("click", onCapture);
  const body = panel.querySelector<HTMLElement>(".jdf-body");
  panel.querySelector<HTMLButtonElement>(".jdf-min")?.addEventListener("click", () => {
    if (body) body.style.display = body.style.display === "none" ? "" : "none";
  });

  updatePanelCounts();
  void refreshSession();
  // 面板打开时定期刷新登录态（用户可能在弹窗登录后回到页面）
  setInterval(refreshSession, 5000);
}

if (document.body) {
  buildPanel();
} else {
  window.addEventListener("DOMContentLoaded", buildPanel);
}
