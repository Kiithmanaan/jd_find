import type { AIAssessmentPort } from "../../application/ports.js";
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
    fitPoints?: unknown;
    riskPoints?: unknown;
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

    if (!Array.isArray(item.fitPoints) || !item.fitPoints.every((point) => typeof point === "string")) {
      throw new DomainError(`HTTP AI assessment for ${item.candidateId} has invalid fitPoints.`);
    }

    if (!Array.isArray(item.riskPoints) || !item.riskPoints.every((point) => typeof point === "string")) {
      throw new DomainError(`HTTP AI assessment for ${item.candidateId} has invalid riskPoints.`);
    }

    assessments.set(item.candidateId, {
      score: item.score,
      fitPoints: item.fitPoints,
      riskPoints: item.riskPoints,
      assessedAt: new Date(),
    });
  }

  return assessments;
}
