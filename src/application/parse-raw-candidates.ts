import type { CandidateDraft } from "../domain/types.js";
import {
  collectGeeks,
  DEFAULT_STRUCTURAL_LIMITS,
  type StructuralLimits,
} from "../domain/plugin-raw-parsing.js";
import type { PlatformMapping, RejectReason } from "./platform-mappings.js";

export interface RawPayload {
  url?: string;
  matched?: "exact" | "heuristic";
  capturedAt?: string;
  json?: unknown;
}

export interface ParseDiagnostics {
  mappingVersion: string;
  geeksExtracted: number;
  draftsParsed: number;
  rejected: number;
  rejectedReasons: Record<RejectReason, number>;
  keyCensus: Record<string, number>;
}

export interface ParseResult {
  drafts: CandidateDraft[];
  diagnostics: ParseDiagnostics;
}

function emptyReasons(): Record<RejectReason, number> {
  return { missingName: 0, missingTitle: 0, missingCity: 0, missingEducation: 0, notAGeek: 0 };
}

// 解析一批原始载荷。可能抛 RawPayloadLimitError（结构超限）→ 调用方映射为 ValidationError。
export function parseRawPayloads(
  payloads: RawPayload[],
  mapping: PlatformMapping,
  limits: StructuralLimits = DEFAULT_STRUCTURAL_LIMITS,
): ParseResult {
  const drafts = new Map<string, CandidateDraft>(); // 按指纹去重
  const rejectedReasons = emptyReasons();
  const keyCensus: Record<string, number> = {};
  let geeksExtracted = 0;
  let rejected = 0;

  for (const payload of payloads) {
    const { geeks, keyCensus: census } = collectGeeks(payload.json, mapping.isGeek, limits);
    geeksExtracted += geeks.length;
    for (const [k, n] of Object.entries(census)) keyCensus[k] = (keyCensus[k] ?? 0) + n;

    for (const geek of geeks) {
      const result = mapping.mapGeek(geek);
      if (result.ok) {
        if (!drafts.has(result.draft.fingerprint)) drafts.set(result.draft.fingerprint, result.draft);
      } else {
        rejected += 1;
        rejectedReasons[result.reason] += 1;
      }
    }
  }

  return {
    drafts: Array.from(drafts.values()),
    diagnostics: {
      mappingVersion: mapping.mappingVersion,
      geeksExtracted,
      draftsParsed: drafts.size,
      rejected,
      rejectedReasons,
      keyCensus,
    },
  };
}
