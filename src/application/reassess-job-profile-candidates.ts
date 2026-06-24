import {
  MATCH_ASSESSMENT_AGENT_VERSION,
  MATCH_ASSESSMENT_PROMPT_VERSION,
  normalizeAIAssessments,
} from "../domain/ai-assessment-contract.js";
import { summarizeJobProfileCandidates } from "../domain/candidate-summary.js";
import { applyHardFilter, applySoftAssessments } from "../domain/search-run.js";
import type { CandidateResult, JobProfile, MatchAssessment, SearchRun } from "../domain/types.js";
import type { AIAssessmentAuditSink, AIAssessmentPort, SearchRunRepository } from "./ports.js";

export interface ReassessJobProfileCandidatesDependencies {
  searchRuns: SearchRunRepository;
  aiAssessment: AIAssessmentPort;
  aiAssessmentAudit?: AIAssessmentAuditSink;
  auditIdGenerator: () => string;
}

export interface ReassessJobProfileCandidatesResult {
  jobProfileId: string;
  jobProfileVersionId: string;
  reassessedCount: number;
  hardRejectedCount: number;
  affectedSearchRunIds: string[];
}

export async function reassessJobProfileCandidates(
  jobProfile: JobProfile,
  dependencies: ReassessJobProfileCandidatesDependencies,
): Promise<ReassessJobProfileCandidatesResult> {
  if (!jobProfile.currentVersionId) {
    throw new Error("JobProfile currentVersionId is required before reassessment.");
  }

  const searchRuns = await dependencies.searchRuns.findByJobProfileId(jobProfile.id);
  const summary = summarizeJobProfileCandidates(searchRuns, jobProfile.currentVersionId);
  const candidatesForReassessment = [
    ...summary.currentVersionCandidates,
    ...summary.staleVersionCandidates,
  ].map(resetCandidateForReassessment);

  const reassessmentRun = applyHardFilter(
    createSyntheticSearchRun(jobProfile, jobProfile.currentVersionId, candidatesForReassessment),
    jobProfile,
  );
  const hardPassedCandidates = reassessmentRun.candidates.filter(
    (candidate) => candidate.status === "HardPassed",
  );
  const assessmentStartedAt = Date.now();
  const assessments = normalizeAIAssessments(
    hardPassedCandidates,
    await dependencies.aiAssessment.assessCandidates(jobProfile, hardPassedCandidates),
  );
  const assessedRun = applySoftAssessments(reassessmentRun, assessments);
  const latestByFingerprint = new Map(
    assessedRun.candidates.map((candidate) => [candidate.fingerprint, candidate]),
  );
  const affectedSearchRunIds: string[] = [];

  for (const searchRun of searchRuns) {
    const updatedSearchRun = replaceCandidatesByFingerprint(searchRun, latestByFingerprint);
    if (updatedSearchRun !== searchRun) {
      await dependencies.searchRuns.save(updatedSearchRun);
      affectedSearchRunIds.push(updatedSearchRun.id);
      await recordReassessmentAudit(
        updatedSearchRun,
        jobProfile,
        updatedSearchRun.candidates.filter((candidate) => assessments.has(candidate.id)),
        assessments,
        Date.now() - assessmentStartedAt,
        dependencies,
      );
    }
  }

  return {
    jobProfileId: jobProfile.id,
    jobProfileVersionId: jobProfile.currentVersionId,
    reassessedCount: assessments.size,
    hardRejectedCount: assessedRun.candidates.filter((candidate) => candidate.status === "HardRejected").length,
    affectedSearchRunIds,
  };
}

function resetCandidateForReassessment(candidate: CandidateResult): CandidateResult {
  return {
    ...structuredClone(candidate),
    status: "Deduplicated",
    hardRejectReasons: [],
    matchAssessment: undefined,
    id: candidate.id,
  };
}

function createSyntheticSearchRun(
  jobProfile: JobProfile,
  jobProfileVersionId: string,
  candidates: CandidateResult[],
): SearchRun {
  const now = new Date();
  return {
    id: `${jobProfile.id}-reassessment`,
    jobProfileId: jobProfile.id,
    jobProfileVersionId,
    status: "Deduplicated",
    targetResultCount: candidates.length,
    rawSubmittedCount: candidates.length,
    candidates,
    events: [],
    createdAt: now,
    updatedAt: now,
  };
}

function replaceCandidatesByFingerprint(
  searchRun: SearchRun,
  latestByFingerprint: Map<string, CandidateResult>,
): SearchRun {
  let changed = false;
  const candidates = searchRun.candidates.map((candidate) => {
    const reassessed = latestByFingerprint.get(candidate.fingerprint);
    if (!reassessed) {
      return candidate;
    }

    changed = true;
    return {
      ...candidate,
      status: reassessed.status,
      hardRejectReasons: reassessed.hardRejectReasons,
      matchAssessment: reassessed.matchAssessment,
    };
  });

  if (!changed) {
    return searchRun;
  }

  return {
    ...searchRun,
    candidates,
    updatedAt: new Date(),
  };
}

async function recordReassessmentAudit(
  searchRun: SearchRun,
  jobProfile: JobProfile,
  candidates: CandidateResult[],
  assessments: Map<string, MatchAssessment>,
  durationMs: number,
  dependencies: ReassessJobProfileCandidatesDependencies,
): Promise<void> {
  if (!dependencies.aiAssessmentAudit || candidates.length === 0) {
    return;
  }

  await dependencies.aiAssessmentAudit.record({
    id: dependencies.auditIdGenerator(),
    searchRunId: searchRun.id,
    jobProfileId: jobProfile.id,
    jobProfileVersionId: jobProfile.currentVersionId,
    agentType: "match-assessment",
    provider: dependencies.aiAssessment.providerName ?? "unknown",
    model: dependencies.aiAssessment.modelName ?? "unknown",
    promptVersion: MATCH_ASSESSMENT_PROMPT_VERSION,
    agentVersion: MATCH_ASSESSMENT_AGENT_VERSION,
    graphVersion: dependencies.aiAssessment.graphVersion,
    prompt: createMatchAssessmentPrompt(jobProfile, candidates),
    candidateIds: candidates.map((candidate) => candidate.id),
    inputSnapshot: {
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
    },
    outputSnapshot: Array.from(assessments.entries()).map(([candidateId, assessment]) => ({
      candidateId,
      assessment,
    })),
    durationMs,
    status: "success",
    createdAt: new Date(),
  });
}

function createMatchAssessmentPrompt(jobProfile: JobProfile, candidates: CandidateResult[]): string {
  return JSON.stringify({
    task: "match-assessment",
    jobProfileVersionId: jobProfile.currentVersionId,
    jobProfile: {
      title: jobProfile.title,
      hardRequirements: jobProfile.hardRequirements,
      softRequirements: jobProfile.softRequirements,
    },
    candidateIds: candidates.map((candidate) => candidate.id),
  });
}
