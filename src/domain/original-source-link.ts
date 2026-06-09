import { DomainError } from "./errors.js";

// ─── 类型 ──────────────────────────────────────────────────────────

export type SourceLinkStatus = "unverified" | "active" | "expired";

export type SourceRiskLevel = "low" | "medium" | "high";

export interface OriginalSourceLink {
  id: string;
  platform: string;
  originalUrl: string;
  normalizedUrl: string;
  externalId: string;
  searchContext: string;
  fallbackClues: string[];
  riskLevel: SourceRiskLevel;
  status: SourceLinkStatus;
  lastVerifiedAt: Date | undefined;
  createdAt: Date;
}

export interface CreateSourceLinkOptions {
  id: string;
  platform: string;
  originalUrl: string;
  externalId?: string;
  searchContext: string;
  fallbackClues?: string[];
  riskLevel?: SourceRiskLevel;
}

// ─── 工厂函数 ──────────────────────────────────────────────────────

export function createOriginalSourceLink(options: CreateSourceLinkOptions): OriginalSourceLink {
  const platform = options.platform.trim();
  if (!platform) {
    throw new DomainError("Source link platform is required.");
  }

  const originalUrl = options.originalUrl.trim();
  if (!originalUrl) {
    throw new DomainError("Source link URL is required.");
  }

  const searchContext = options.searchContext.trim();
  if (!searchContext) {
    throw new DomainError("Source link search context is required.");
  }

  const now = new Date();
  return {
    id: options.id,
    platform,
    originalUrl,
    normalizedUrl: normalizeUrl(originalUrl),
    externalId: options.externalId?.trim() ?? "",
    searchContext,
    fallbackClues: options.fallbackClues?.map((clue) => clue.trim()).filter(Boolean) ?? [],
    riskLevel: options.riskLevel ?? assessRiskLevel(originalUrl, platform),
    status: "unverified",
    lastVerifiedAt: undefined,
    createdAt: now,
  };
}

// ─── 状态机 ────────────────────────────────────────────────────────

export function verifySourceLink(link: OriginalSourceLink): OriginalSourceLink {
  return {
    ...link,
    status: "active",
    lastVerifiedAt: new Date(),
  };
}

export function expireSourceLink(link: OriginalSourceLink): OriginalSourceLink {
  if (link.status === "expired") {
    throw new DomainError("Source link is already expired.");
  }

  return {
    ...link,
    status: "expired",
  };
}

// ─── 判断函数 ──────────────────────────────────────────────────────

export function isSourceLinkAccessible(link: OriginalSourceLink): boolean {
  if (link.status === "expired") {
    return false;
  }

  if (link.status === "active" && link.lastVerifiedAt) {
    const hoursSinceVerification = (Date.now() - link.lastVerifiedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceVerification > 24) {
      return false;
    }
  }

  if (link.status === "unverified") {
    return link.fallbackClues.length > 0 || isLowRiskPlatform(link.platform);
  }

  return true;
}

// ─── 辅助函数 ──────────────────────────────────────────────────────

export function normalizeUrl(url: string): string {
  let normalized = url.trim();

  try {
    const parsed = new URL(normalized);
    normalized = parsed.hostname.replace(/^www\./, "") + parsed.pathname;
    normalized = normalized.replace(/\/+$/, "").toLowerCase();
  } catch {
    // If URL parsing fails, do basic normalization
    normalized = normalized
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  return normalized || url.trim();
}

export function assessRiskLevel(url: string, platform: string): SourceRiskLevel {
  const normalizedUrl = url.toLowerCase();
  const normalizedPlatform = platform.toLowerCase();

  if (
    normalizedUrl.includes("linkedin") ||
    normalizedUrl.includes("zhaopin") ||
    normalizedUrl.includes("51job")
  ) {
    return "medium";
  }

  if (
    normalizedPlatform.includes("internal") ||
    normalizedPlatform.includes("private") ||
    normalizedUrl.includes("internal")
  ) {
    return "high";
  }

  return "low";
}

function isLowRiskPlatform(platform: string): boolean {
  const lowRisk = ["linkedin", "github", "猎聘", "boss直聘"];
  return lowRisk.some((name) => platform.toLowerCase().includes(name));
}
