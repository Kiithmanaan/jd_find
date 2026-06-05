import { DomainError } from "./errors.js";
import type { CandidateResult, MatchAssessment } from "./types.js";

const FINAL_DECISION_TERMS = ["最终推荐", "建议录用", "必须沟通", "直接推荐", "确定合适"];

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
  const fitPoints = normalizeExplanationPoints(assessment.fitPoints);
  const riskPoints = normalizeExplanationPoints(assessment.riskPoints);

  if (fitPoints.length === 0) {
    throw new DomainError("AI assessment must include at least one fit point.");
  }

  assertNoFinalDecisionLanguage([...fitPoints, ...riskPoints]);

  return {
    score: clampScore(assessment.score),
    fitPoints,
    riskPoints,
    assessedAt: assessment.assessedAt,
  };
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    throw new DomainError("AI assessment score must be a finite number.");
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeExplanationPoints(points: string[]): string[] {
  return points.map((point) => point.trim()).filter(Boolean);
}

function assertNoFinalDecisionLanguage(points: string[]): void {
  const violatingPoint = points.find((point) =>
    FINAL_DECISION_TERMS.some((term) => point.includes(term)),
  );

  if (violatingPoint) {
    throw new DomainError(`AI assessment must not contain final decision language: ${violatingPoint}`);
  }
}
