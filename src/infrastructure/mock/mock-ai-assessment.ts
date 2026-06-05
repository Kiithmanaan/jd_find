import type { AIAssessmentPort } from "../../application/ports.js";
import { normalizeAIAssessments } from "../../domain/ai-assessment-contract.js";
import type { CandidateResult, JobProfile, MatchAssessment } from "../../domain/types.js";

export class MockAIAssessment implements AIAssessmentPort {
  readonly providerName = "mock";
  readonly modelName = "mock-ai-assessment-v1";

  async assessCandidates(
    jobProfile: JobProfile,
    candidates: CandidateResult[],
  ): Promise<Map<string, MatchAssessment>> {
    const assessments = new Map<string, MatchAssessment>();

    for (const candidate of candidates) {
      const keywordMatches = jobProfile.softRequirements.filter((requirement) =>
        candidate.resume.summary.includes(requirement.label),
      );
      const score = Math.min(100, 70 + keywordMatches.length * 10);

      assessments.set(candidate.id, {
        score,
        fitPoints:
          keywordMatches.length > 0
            ? keywordMatches.map((requirement) => `具备${requirement.label}相关经历`)
            : ["履历与岗位画像存在基础相关性"],
        riskPoints:
          keywordMatches.length === jobProfile.softRequirements.length
            ? []
            : ["部分软性条件需要猎头进一步人工判断"],
        assessedAt: new Date(),
      });
    }

    return normalizeAIAssessments(candidates, assessments);
  }
}
