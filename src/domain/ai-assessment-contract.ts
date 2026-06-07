import { DomainError } from "./errors.js";
import type { CandidateResult, MatchAssessment } from "./types.js";

export const MATCH_ASSESSMENT_PROMPT_VERSION = "match-assessment-v1";
export const MATCH_ASSESSMENT_AGENT_VERSION = "jd-match-assessment-v1";

const RECOMMENDATIONS: MatchAssessment["recommendation"][] = ["推荐", "待定", "不推荐"];

export function normalizeAIAssessments(
  candidates: CandidateResult[],
  assessments: Map<string, MatchAssessment>,
): Map<string, MatchAssessment> {
  const allowedCandidateIds = new Set(candidates.map((candidate) => candidate.id));
  const normalized = new Map<string, MatchAssessment>();

  for (const [candidateId, assessment] of assessments.entries()) {
    if (!allowedCandidateIds.has(candidateId)) {
      throw new DomainError("AI assessment contains a candidate outside the requested assessment scope.");
    }

    normalized.set(candidateId, normalizeMatchAssessment(assessment));
  }

  for (const candidate of candidates) {
    if (!normalized.has(candidate.id)) {
      throw new DomainError(`AI assessment is missing for candidate ${candidate.id}.`);
    }
  }

  return normalized;
}

export function normalizeMatchAssessment(assessment: MatchAssessment): MatchAssessment {
  const matchedPoints = normalizeLimitedPoints(assessment.matchedPoints, "matchedPoints");
  const unmatchedPoints = normalizeLimitedPoints(assessment.unmatchedPoints, "unmatchedPoints");
  const riskPoints = normalizeLimitedPoints(assessment.riskPoints, "riskPoints");
  const recommendationReason = assessment.recommendationReason.trim();
  const trace = assessment.trace.trim();
  const promptVersion = assessment.promptVersion.trim();
  const agentVersion = assessment.agentVersion.trim();

  if (!RECOMMENDATIONS.includes(assessment.recommendation)) {
    throw new DomainError("AI assessment recommendation must be 推荐, 待定, or 不推荐.");
  }

  if (matchedPoints.length === 0) {
    throw new DomainError("AI assessment must include at least one matched point.");
  }

  if (!recommendationReason) {
    throw new DomainError("AI assessment must include recommendationReason.");
  }

  if (!trace) {
    throw new DomainError("AI assessment must include trace.");
  }

  if (!promptVersion || !agentVersion) {
    throw new DomainError("AI assessment must include promptVersion and agentVersion.");
  }

  return {
    score: clampScore(assessment.score),
    recommendation: assessment.recommendation,
    recommendationReason,
    matchedPoints,
    unmatchedPoints,
    riskPoints,
    trace,
    assessedAt: assessment.assessedAt,
    jobProfileVersionId: assessment.jobProfileVersionId,
    promptVersion,
    agentVersion,
  };
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    throw new DomainError("AI assessment score must be a finite number.");
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeLimitedPoints(points: string[], fieldName: string): string[] {
  const normalized = points.map((point) => point.trim()).filter(Boolean);

  if (normalized.length > 3) {
    throw new DomainError(`AI assessment ${fieldName} must include no more than 3 points.`);
  }

  return normalized;
}
