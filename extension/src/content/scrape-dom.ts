import type { CandidateDraft, CandidateResume, SourceLead } from "../lib/types.js";
import { parseYears } from "./field-map.js";

// DOM 兑底提取：当 fetch/XHR hook 没抓到 JSON 时，从可见的候选人卡片读取。
//
// ⚠️⚠️ 全部 Boss 选择器集中在此 SELECTORS 常量。Boss 会改版/混淆 class，
// 使用前请对着真实搜索/推荐页 DevTools 校准。下面是基于常见结构的初始猜测，非事实源。
const SELECTORS = {
  // 候选人卡片容器（列表项）——多写几个候选，任一命中即用
  card: [
    ".candidate-card-wrap",
    ".geek-item",
    "li.candidate-card",
    "[data-geek-id]",
    ".recommend-card",
  ],
  name: [".name", ".geek-name", ".candidate-name"],
  title: [".title", ".position", ".expect-position", ".job-title"],
  city: [".city", ".base-info .city", ".geek-city"],
  education: [".edu", ".degree", ".base-info .degree"],
  // 经验通常在 base-info 的标签里，如「5年」
  experience: [".work-year", ".exp", ".base-info .work-exp"],
  company: [".company", ".brand-name", ".last-company"],
  desc: [".content", ".geek-desc", ".advantage", ".card-desc"],
  // 详情链接
  link: ["a[href*='geek']", "a.card-link", "a[href*='/detail']"],
  // 卡片上的稳定 id 属性
  idAttrs: ["data-geek-id", "data-id", "data-uid"],
} as const;

function pick(root: Element, selectors: readonly string[]): string {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return "";
}

function pickAttr(root: Element, attrs: readonly string[]): string | undefined {
  for (const a of attrs) {
    const v = (root as HTMLElement).getAttribute?.(a);
    if (v) return v;
  }
  return undefined;
}

function pickLink(root: Element): string | undefined {
  for (const sel of SELECTORS.link) {
    const a = root.querySelector<HTMLAnchorElement>(sel);
    if (a?.href) return a.href;
  }
  return undefined;
}

function findCards(): Element[] {
  for (const sel of SELECTORS.card) {
    const found = Array.from(document.querySelectorAll(sel));
    if (found.length > 0) return found;
  }
  return [];
}

// 从一张卡片提取；关键字段缺失返回 null（由调用方计数为「跳过」）
function extractCard(card: Element): CandidateDraft | null {
  const name = pick(card, SELECTORS.name);
  const title = pick(card, SELECTORS.title);
  const city = pick(card, SELECTORS.city);
  const educationLevel = pick(card, SELECTORS.education);
  if (!name || !title || !city || !educationLevel) return null;

  const company = pick(card, SELECTORS.company);
  const descText = pick(card, SELECTORS.desc);
  const url = pickLink(card);
  const id = pickAttr(card, SELECTORS.idAttrs);

  const resume: CandidateResume = {
    name,
    title,
    city,
    educationLevel,
    yearsOfExperience: parseYears(pick(card, SELECTORS.experience)),
    industries: [],
    keywords: [],
    summary: descText || [title, city, company].filter(Boolean).join(" · "),
  };

  const sourceLead: SourceLead = {
    platform: "Boss",
    url,
    searchContext: `Boss 卡片抓取：${[title, city].filter(Boolean).join("；")}`,
    fallbackClues: [title, city, company].filter(Boolean),
  };

  return {
    fingerprint: id ?? url ?? [name, company, title].filter(Boolean).join("|"),
    resume,
    intent: "未知",
    activityLevel: "未知",
    sourceLead,
  };
}

export function scrapeVisibleCandidates(): CandidateDraft[] {
  const out: CandidateDraft[] = [];
  for (const card of findCards()) {
    const c = extractCard(card);
    if (c) out.push(c);
  }
  return out;
}

// 供面板显示：本页发现多少张卡片（无论是否成功提取）
export function countVisibleCards(): number {
  return findCards().length;
}
