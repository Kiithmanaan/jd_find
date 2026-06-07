import type { AIAssessmentPort } from "../../application/ports.js";
import {
  MATCH_ASSESSMENT_AGENT_VERSION,
  MATCH_ASSESSMENT_PROMPT_VERSION,
  normalizeAIAssessments,
} from "../../domain/ai-assessment-contract.js";
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
        recommendation: score >= 85 ? "推荐" : "待定",
        recommendationReason: score >= 85 ? "软性条件匹配度较高。" : "存在基础相关性，部分条件需要进一步确认。",
        matchedPoints:
          keywordMatches.length > 0
            ? keywordMatches.map((requirement) => `具备${requirement.label}相关经历`)
            : ["履历与岗位画像存在基础相关性"],
        unmatchedPoints:
          keywordMatches.length === jobProfile.softRequirements.length
            ? []
            : ["部分软性条件缺少直接证据"],
        riskPoints:
          keywordMatches.length === jobProfile.softRequirements.length
            ? []
            : ["部分软性条件需要猎头进一步人工判断"],
        trace: `候选人摘要与 ${keywordMatches.length} 个软性条件出现文本证据匹配。`,
        assessedAt: new Date(),
        jobProfileVersionId: jobProfile.currentVersionId,
        promptVersion: MATCH_ASSESSMENT_PROMPT_VERSION,
        agentVersion: MATCH_ASSESSMENT_AGENT_VERSION,
      });
    }

    return normalizeAIAssessments(candidates, assessments);
  }
}
