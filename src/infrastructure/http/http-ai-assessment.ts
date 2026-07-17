import type { AIAssessmentPort } from "../../application/ports.js";
import {
  MATCH_ASSESSMENT_AGENT_VERSION,
  MATCH_ASSESSMENT_PROMPT_VERSION,
} from "../../domain/ai-assessment-contract.js";
import { DomainError } from "../../domain/errors.js";
import type { CandidateResult, JobProfile, MatchAssessment } from "../../domain/types.js";

export interface HttpAIAssessmentOptions {
  endpoint: string;
  apiKey?: string;
  providerName?: string;
  modelName?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

interface HttpAIAssessmentResponse {
  assessments?: Array<{
    candidateId?: unknown;
    score?: unknown;
    recommendation?: unknown;
    recommendationReason?: unknown;
    matchedPoints?: unknown;
    unmatchedPoints?: unknown;
    riskPoints?: unknown;
    trace?: unknown;
    promptVersion?: unknown;
    agentVersion?: unknown;
  }>;
}

export class HttpAIAssessment implements AIAssessmentPort {
  readonly providerName: string;
  readonly modelName: string;

  constructor(private readonly options: HttpAIAssessmentOptions) {
    this.providerName = options.providerName ?? "http";
    this.modelName = options.modelName ?? "external-ai-assessment";
  }

  async assessCandidates(
    jobProfile: JobProfile,
    candidates: CandidateResult[],
  ): Promise<Map<string, MatchAssessment>> {
    if (candidates.length === 0) {
      return new Map();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 30_000);

    try {
      const fetchFn = this.options.fetchFn ?? fetch;
      const response = await fetchFn(this.options.endpoint, {
        method: "POST",
        headers: this.createHeaders(),
        body: JSON.stringify({
          jobProfile: {
            id: jobProfile.id,
            title: jobProfile.title,
            searchCondition: jobProfile.searchCondition,
            hardRequirements: jobProfile.hardRequirements,
            softRequirements: jobProfile.softRequirements,
            negativeSignals: jobProfile.negativeSignals,
          },
          candidates: candidates.map((candidate) => ({
            id: candidate.id,
            fingerprint: candidate.fingerprint,
            resume: candidate.resume,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new DomainError(`HTTP AI assessment failed with status ${response.status}.`);
      }

      return parseHttpAIAssessmentResponse(await response.json());
    } finally {
      clearTimeout(timeout);
    }
  }

  private createHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (this.options.apiKey) {
      headers.authorization = `Bearer ${this.options.apiKey}`;
    }

    return headers;
  }
}

export function parseHttpAIAssessmentResponse(response: unknown): Map<string, MatchAssessment> {
  const payload = response as HttpAIAssessmentResponse;

  if (!Array.isArray(payload.assessments)) {
    throw new DomainError("HTTP AI assessment response must include an assessments array.");
  }

  const assessments = new Map<string, MatchAssessment>();

  for (const item of payload.assessments) {
    if (typeof item.candidateId !== "string" || !item.candidateId.trim()) {
      throw new DomainError("HTTP AI assessment item is missing candidateId.");
    }

    if (typeof item.score !== "number") {
      throw new DomainError(`HTTP AI assessment for ${item.candidateId} is missing numeric score.`);
    }

    if (!isRecommendation(item.recommendation)) {
      throw new DomainError(`HTTP AI assessment for ${item.candidateId} has invalid recommendation.`);
    }

    if (typeof item.recommendationReason !== "string") {
      throw new DomainError(`HTTP AI assessment for ${item.candidateId} has invalid recommendationReason.`);
    }

    if (!Array.isArray(item.matchedPoints) || !item.matchedPoints.every((point) => typeof point === "string")) {
      throw new DomainError(`HTTP AI assessment for ${item.candidateId} has invalid matchedPoints.`);
    }

    if (!Array.isArray(item.unmatchedPoints) || !item.unmatchedPoints.every((point) => typeof point === "string")) {
      throw new DomainError(`HTTP AI assessment for ${item.candidateId} has invalid unmatchedPoints.`);
    }

    if (!Array.isArray(item.riskPoints) || !item.riskPoints.every((point) => typeof point === "string")) {
      throw new DomainError(`HTTP AI assessment for ${item.candidateId} has invalid riskPoints.`);
    }

    if (typeof item.trace !== "string") {
      throw new DomainError(`HTTP AI assessment for ${item.candidateId} has invalid trace.`);
    }

    assessments.set(item.candidateId, {
      score: item.score,
      recommendation: item.recommendation,
      recommendationReason: item.recommendationReason,
      matchedPoints: item.matchedPoints,
      unmatchedPoints: item.unmatchedPoints,
      riskPoints: item.riskPoints,
      trace: item.trace,
      assessedAt: new Date(),
      promptVersion: typeof item.promptVersion === "string" ? item.promptVersion : MATCH_ASSESSMENT_PROMPT_VERSION,
      agentVersion: typeof item.agentVersion === "string" ? item.agentVersion : MATCH_ASSESSMENT_AGENT_VERSION,
    });
  }

  return assessments;
}

function isRecommendation(value: unknown): value is MatchAssessment["recommendation"] {
  return value === "推荐" || value === "待定" || value === "不推荐";
}
