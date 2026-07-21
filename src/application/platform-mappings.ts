// 来源平台原始载荷 → CandidateDraft 的服务端映射注册表（docs/30 §4b）。
// 解析归服务端：平台改字段名时只需在此改一次并部署，无需给全部用户发版插件。
//
// ⚠️ 校准点：Boss 候选人对象字段名随端点/版本变化。用 GET /parse-diagnostics 的 keyCensus
// 对照真实响应校准下面的字段路径与 mappingVersion，不臆测。

import type { CandidateDraft, CandidateResume, SourceLead } from "../domain/types.js";

export type RejectReason =
  | "missingName"
  | "missingTitle"
  | "missingCity"
  | "missingEducation"
  | "notAGeek";

export type MapGeekResult =
  | { ok: true; draft: CandidateDraft }
  | { ok: false; reason: RejectReason };

export interface PlatformMapping {
  platform: string;
  mappingVersion: string;
  isGeek(obj: Record<string, unknown>): boolean;
  mapGeek(obj: Record<string, unknown>): MapGeekResult;
}

// ---- 通用工具 ----
function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

export function parseYears(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.trunc(raw));
  if (typeof raw === "string") {
    const m = raw.match(/(\d+)/);
    if (m) return Math.max(0, parseInt(m[1], 10));
    if (/应届|在校|无经验/.test(raw)) return 0;
  }
  return 0;
}

function splitList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw === "string") return raw.split(/[、,，/|\s]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

// profile URL 归一化：剥 query，避免同一候选人的 ?id=X&lid=Y 与 ?id=X 被判为两人（docs/30 §9）
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

// 确定性内容哈希（FNV-1a 32 位）。docs/30 §9 第 5 项：兜底必须确定性。
function contentHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// ---- Boss 映射 ----
const BOSS_MAPPING_VERSION = "boss-2026-07-20.1";

function bossIsGeek(o: Record<string, unknown>): boolean {
  const hasName = "geekName" in o || "name" in o;
  const hasSignal =
    "expectPositionName" in o ||
    "positionName" in o ||
    "encryptGeekId" in o ||
    "geekId" in o ||
    "geekCard" in o;
  return hasName && hasSignal;
}

function bossFingerprint(o: Record<string, unknown>, detailUrl?: string): string {
  const geekCard = o.geekCard as { encryptGeekId?: string } | undefined;
  const id = firstString(o.encryptGeekId, geekCard?.encryptGeekId, o.securityId, o.geekId, o.lid);
  if (id) return id.trim().toLowerCase();
  if (detailUrl) return normalizeUrl(detailUrl);
  const composite = [o.geekName ?? o.name, o.brandName ?? o.companyName, o.expectPositionName ?? o.positionName]
    .filter(Boolean)
    .join("|")
    .trim()
    .toLowerCase();
  if (composite) return composite;
  return `boss-hash-${contentHash(JSON.stringify(o))}`;
}

function bossMapGeek(o: Record<string, unknown>): MapGeekResult {
  if (!bossIsGeek(o)) return { ok: false, reason: "notAGeek" };

  const name = firstString(o.geekName, o.name);
  if (!name) return { ok: false, reason: "missingName" };
  const title = firstString(o.expectPositionName, o.positionName, o.jobName);
  if (!title) return { ok: false, reason: "missingTitle" };
  const city = firstString(o.cityName, o.geekCityName, o.city);
  if (!city) return { ok: false, reason: "missingCity" };
  const educationLevel = firstString(o.degreeName, o.eduName, o.geekDegree);
  if (!educationLevel) return { ok: false, reason: "missingEducation" };

  const geekCard = o.geekCard as { encryptGeekId?: string } | undefined;
  const encryptId = firstString(o.encryptGeekId, geekCard?.encryptGeekId);
  const detailUrl = encryptId ? `https://www.zhipin.com/web/geek/detail?id=${encryptId}` : undefined;
  const company = firstString(o.brandName, o.companyName);

  const resume: CandidateResume = {
    name,
    title,
    city,
    educationLevel,
    yearsOfExperience: parseYears(o.geekWorkYear ?? o.workYears ?? o.workYear),
    industries: splitList(o.industryName ?? o.expectIndustryName),
    keywords: Array.from(
      new Set(
        splitList(o.geekDesc ?? o.content ?? o.summary)
          .filter((w) => w.length >= 2 && w.length <= 12)
          .slice(0, 12),
      ),
    ),
    summary:
      firstString(o.geekDesc, o.content, o.summary) ??
      [title, city, company].filter(Boolean).join(" · "),
  };

  const sourceLead: SourceLead = {
    platform: "Boss",
    url: detailUrl,
    searchContext: `Boss 原始载荷解析：${[title, city].filter(Boolean).join("；")}`,
    fallbackClues: [title, city, company].filter((x): x is string => Boolean(x)),
  };

  return {
    ok: true,
    draft: {
      fingerprint: bossFingerprint(o, detailUrl),
      resume,
      intent: firstString(o.applyStatus, o.activeTimeDesc) ?? "未知",
      activityLevel: firstString(o.activeTimeDesc, o.activeTime) ?? "未知",
      sourceLead,
    },
  };
}

const bossMapping: PlatformMapping = {
  platform: "Boss",
  mappingVersion: BOSS_MAPPING_VERSION,
  isGeek: bossIsGeek,
  mapGeek: bossMapGeek,
};

const REGISTRY: Record<string, PlatformMapping> = {
  Boss: bossMapping,
};

export function getPlatformMapping(platform: string): PlatformMapping | undefined {
  return REGISTRY[platform];
}

export function knownPlatforms(): string[] {
  return Object.keys(REGISTRY);
}
