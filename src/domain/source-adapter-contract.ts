import { DomainError } from "./errors.js";
import type { CandidateDraft, RiskSignal, SourceLead } from "./types.js";
import { createOriginalSourceLink } from "./original-source-link.js";

export interface SourceAcquisitionResult {
  candidates: CandidateDraft[];
  riskSignal?: RiskSignal;
}

export function normalizeSourceAcquisitionResult(result: SourceAcquisitionResult): SourceAcquisitionResult {
  if (result.riskSignal) {
    assertRiskSignalValid(result.riskSignal);

    return {
      candidates: [],
      riskSignal: result.riskSignal,
    };
  }

  return {
    candidates: result.candidates.map(normalizeCandidateDraft),
  };
}

function normalizeCandidateDraft(candidate: CandidateDraft): CandidateDraft {
  const sourceLead = normalizeSourceLead(candidate.sourceLead);

  return {
    ...candidate,
    fingerprint: candidate.fingerprint.trim(),
    intent: candidate.intent.trim(),
    activityLevel: candidate.activityLevel.trim(),
    resume: {
      ...candidate.resume,
      name: candidate.resume.name.trim(),
      title: candidate.resume.title.trim(),
      city: candidate.resume.city.trim(),
      educationLevel: candidate.resume.educationLevel.trim(),
      industries: candidate.resume.industries.map((industry) => industry.trim()).filter(Boolean),
      keywords: candidate.resume.keywords.map((keyword) => keyword.trim()).filter(Boolean),
      summary: candidate.resume.summary.trim(),
    },
    sourceLead,
  };
}

function normalizeSourceLead(sourceLead: SourceLead): SourceLead {
  return createOriginalSourceLink({
    id: sourceLead.id,
    platform: sourceLead.platform,
    originalUrl: sourceLead.originalUrl ?? sourceLead.url,
    externalId: sourceLead.externalId,
    searchContext: sourceLead.searchContext,
    fallbackClues: sourceLead.fallbackClues,
    riskLevel: sourceLead.riskLevel,
  });
}

function assertRiskSignalValid(riskSignal: RiskSignal): void {
  if (!riskSignal.reason.trim()) {
    throw new DomainError("Risk signal reason is required.");
  }
}
