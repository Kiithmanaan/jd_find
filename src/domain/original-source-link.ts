import { DomainError } from "./errors.js";
import type { OriginalSourceLink, SourceRiskLevel } from "./types.js";

export function createOriginalSourceLink(options: {
  id?: string;
  platform: string;
  originalUrl?: string;
  url?: string;
  externalId?: string;
  searchContext: string;
  fallbackClues?: string[];
  riskLevel?: SourceRiskLevel;
}): OriginalSourceLink {
  const platform = options.platform.trim();
  const originalUrl = (options.originalUrl ?? options.url)?.trim();
  const searchContext = options.searchContext.trim();
  const fallbackClues = options.fallbackClues?.map((clue) => clue.trim()).filter(Boolean) ?? [];
  if (!platform) throw new DomainError("Source link platform is required.");
  if (!searchContext) throw new DomainError("Source link search context is required.");
  if (!originalUrl && fallbackClues.length === 0) throw new DomainError("Source link URL or fallback clues are required.");
  return {
    id: options.id ?? crypto.randomUUID(),
    platform,
    url: originalUrl,
    originalUrl: originalUrl ?? "",
    normalizedUrl: originalUrl ? normalizeUrl(originalUrl) : "",
    externalId: options.externalId?.trim() ?? "",
    searchContext,
    fallbackClues,
    expired: false,
    verificationStatus: originalUrl ? "unverified" : "fallback_only",
    status: originalUrl ? "unverified" : "fallback_only",
    riskLevel: options.riskLevel ?? assessRiskLevel(originalUrl, platform),
    createdAt: new Date(),
  };
}

export function verifySourceLink(link: OriginalSourceLink): OriginalSourceLink {
  if (!link.originalUrl && !link.url) throw new DomainError("Fallback-only source links cannot be verified.");
  return { ...link, expired: false, verificationStatus: "active", status: "active", lastVerifiedAt: new Date() };
}

export function expireSourceLink(link: OriginalSourceLink): OriginalSourceLink {
  if (link.verificationStatus === "expired" || link.expired) throw new DomainError("Source link is already expired.");
  return { ...link, expired: true, verificationStatus: "expired", status: "expired" };
}

export function isSourceLinkAccessible(link: OriginalSourceLink): boolean {
  if (link.verificationStatus === "expired" || link.expired) return false;
  if (link.verificationStatus === "fallback_only") return link.fallbackClues.length > 0;
  if (link.verificationStatus === "active" && link.lastVerifiedAt) return Date.now() - link.lastVerifiedAt.getTime() <= 86_400_000;
  return Boolean(link.originalUrl || link.url) || link.fallbackClues.length > 0;
}

export function normalizeUrl(url: string): string {
  const parsed = new URL(url.trim());
  return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}`.toLowerCase();
}

export function assessRiskLevel(url: string | undefined, platform: string): SourceRiskLevel {
  const value = `${url ?? ""} ${platform}`.toLowerCase();
  if (value.includes("internal") || value.includes("private")) return "high";
  if (["linkedin", "zhaopin", "51job", "猎聘", "boss"].some((name) => value.includes(name))) return "medium";
  return "low";
}
