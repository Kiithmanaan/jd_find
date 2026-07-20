import type { CandidateDraft, CandidateResume, SourceLead } from "../lib/types.js";

// Boss 候选人 JSON → CandidateDraft 映射。
//
// ⚠️ 校准点：Boss 的候选人对象字段名随端点/版本变化，下面覆盖了常见命名并逐层兜底。
// 正式使用前，先用 hook 在真实页面把一条候选人 JSON 打到 console（见 boss.ts 的 DEBUG_LOG），
// 据此补全/修正这里的字段路径，不要臆测。

// 宽松描述一个 Boss 候选人对象（字段全部可选，实际以采样为准）
export interface BossGeekLike {
  // 身份/指纹候选
  encryptGeekId?: string;
  geekId?: string | number;
  securityId?: string;
  lid?: string;
  expectId?: string | number;

  // 基本信息
  geekName?: string;
  name?: string;
  expectPositionName?: string; // 期望职位 → title
  positionName?: string;
  jobName?: string;
  cityName?: string;
  geekCityName?: string;
  city?: string;

  // 学历/经验
  degreeName?: string;
  eduName?: string;
  geekDegree?: string;
  geekWorkYear?: string | number; // 「5年」或 5
  workYears?: string | number;
  workYear?: string | number;

  // 行业/关键词/简述
  industryName?: string;
  expectIndustryName?: string;
  geekDesc?: string;
  content?: string;
  summary?: string;
  brandName?: string; // 当前/最近公司
  companyName?: string;

  // 意向/活跃
  activeTimeDesc?: string;
  activeTime?: string;
  applyStatus?: string;

  // 详情链接线索
  geekCard?: { encryptGeekId?: string };
  [k: string]: unknown;
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

// 「8年」「应届」「10年以上」→ 整数年
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
  if (typeof raw === "string") {
    return raw
      .split(/[、,，\/|\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

// profile URL 归一化：剥除 query 参数，否则同一候选人的 ?id=X&lid=Y 与 ?id=X 会被判为两人（docs/30 §9）
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

// 确定性内容哈希（FNV-1a 32 位）。docs/30 §9 第 5 项：兜底必须确定性——
// 带随机数的兜底会同时破坏批次幂等摘要与 (searchRunId, fingerprint) 唯一约束下的重放语义。
function contentHash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function buildFingerprint(geek: BossGeekLike, detailUrl?: string): string {
  // 兜底优先级见 docs/30 §9：profile id → profile URL → 联系方式 → 姓名+公司+职位 → 内容哈希
  const id = firstString(
    geek.encryptGeekId,
    geek.geekCard?.encryptGeekId,
    geek.securityId,
    geek.geekId,
    geek.lid,
  );
  if (id) return id.trim().toLowerCase();

  if (detailUrl) return normalizeUrl(detailUrl);

  const composite = [
    geek.geekName ?? geek.name,
    geek.brandName ?? geek.companyName,
    geek.expectPositionName ?? geek.positionName,
  ]
    .filter(Boolean)
    .join("|")
    .trim()
    .toLowerCase();
  if (composite) return composite;

  // 以上均不可得：对记录取确定性内容哈希（同一记录恒得同一指纹）
  return `boss-hash-${contentHash(JSON.stringify(geek))}`;
}

export function mapBossGeek(geek: BossGeekLike): CandidateDraft | null {
  const name = firstString(geek.geekName, geek.name);
  const title = firstString(geek.expectPositionName, geek.positionName, geek.jobName);
  const city = firstString(geek.cityName, geek.geekCityName, geek.city);
  const educationLevel = firstString(geek.degreeName, geek.eduName, geek.geekDegree);
  // 主工程 schema 要求 name/title/city/educationLevel/summary 非空，缺关键字段则跳过（由调用方计数）
  if (!name || !title || !city || !educationLevel) return null;

  const encryptId = firstString(geek.encryptGeekId, geek.geekCard?.encryptGeekId);
  const detailUrl = encryptId ? `https://www.zhipin.com/web/geek/detail?id=${encryptId}` : undefined;

  const industries = splitList(geek.industryName ?? geek.expectIndustryName);
  const keywords = Array.from(
    new Set(
      splitList(geek.geekDesc ?? geek.content ?? geek.summary)
        .filter((w) => w.length >= 2 && w.length <= 12)
        .slice(0, 12),
    ),
  );
  const summary =
    firstString(geek.geekDesc, geek.content, geek.summary) ??
    [title, city, geek.brandName ?? geek.companyName].filter(Boolean).join(" · ");

  const resume: CandidateResume = {
    name,
    title,
    city,
    educationLevel,
    yearsOfExperience: parseYears(geek.geekWorkYear ?? geek.workYears ?? geek.workYear),
    industries,
    keywords,
    summary,
  };

  const sourceLead: SourceLead = {
    platform: "Boss",
    url: detailUrl,
    searchContext: `Boss 候选人抓取：${[title, city].filter(Boolean).join("；")}`,
    fallbackClues: [title, city, geek.brandName ?? geek.companyName].filter((x): x is string => Boolean(x)),
  };

  return {
    fingerprint: buildFingerprint(geek, detailUrl),
    resume,
    intent: firstString(geek.applyStatus, geek.activeTimeDesc) ?? "未知",
    activityLevel: firstString(geek.activeTimeDesc, geek.activeTime) ?? "未知",
    sourceLead,
  };
}
