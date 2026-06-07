import {
  acquireCandidateResults,
  applyHardFilter,
  applySoftAssessments,
  completeSearchRun,
  createSearchRun,
  deduplicateWithinSearchRun,
  failSearchRun,
  interruptSearchRun,
  startSearchRun,
} from "../domain/search-run.js";
import {
  MATCH_ASSESSMENT_AGENT_VERSION,
  MATCH_ASSESSMENT_PROMPT_VERSION,
  normalizeAIAssessments,
} from "../domain/ai-assessment-contract.js";
import { createConfirmedJobProfileVersion, createDefaultJobProfileVersionId } from "../domain/job-profile.js";
import type { JobProfile, MatchAssessment, SearchRun } from "../domain/types.js";
import type {
  AIAssessmentAuditSink,
  AIAssessmentPort,
  JobProfileRepository,
  JobProfileVersionRepository,
  SearchRunRepository,
  SourceAdapter,
} from "./ports.js";

export interface SearchOrchestratorDependencies {
  sourceAdapter: SourceAdapter;
  aiAssessment: AIAssessmentPort;
  aiAssessmentAudit?: AIAssessmentAuditSink;
  jobProfiles?: JobProfileRepository;
  jobProfileVersions?: JobProfileVersionRepository;
  searchRuns?: SearchRunRepository;
  idGenerator: () => string;
  auditIdGenerator?: () => string;
}

export class SearchOrchestrator {
  constructor(private readonly dependencies: SearchOrchestratorDependencies) {}

  async runOneTimeSearch(jobProfile: JobProfile): Promise<SearchRun> {
    const runnableJobProfile = normalizeConfirmedJobProfileVersion(jobProfile);

    if (this.dependencies.jobProfiles) {
      await this.dependencies.jobProfiles.save(runnableJobProfile);
    }
    if (this.dependencies.jobProfileVersions && runnableJobProfile.status === "Confirmed") {
      await this.dependencies.jobProfileVersions.save(createConfirmedJobProfileVersion(runnableJobProfile));
    }

    let searchRun = createSearchRun(runnableJobProfile, this.dependencies.idGenerator(), {
      targetResultCount: undefined,
      ownerId: undefined,
    });
    searchRun = startSearchRun(searchRun);
    searchRun = await this.saveSearchRun(searchRun);

    try {
      const acquisition = await this.dependencies.sourceAdapter.acquireCandidates(runnableJobProfile, searchRun);

      if (acquisition.riskSignal) {
        return this.saveSearchRun(interruptSearchRun(searchRun, acquisition.riskSignal));
      }

      searchRun = acquireCandidateResults(searchRun, runnableJobProfile, acquisition.candidates);
      searchRun = await this.saveSearchRun(searchRun);

      searchRun = deduplicateWithinSearchRun(searchRun);
      searchRun = await this.saveSearchRun(searchRun);

      searchRun = applyHardFilter(searchRun, runnableJobProfile);
      searchRun = await this.saveSearchRun(searchRun);

      const hardPassedCandidates = searchRun.candidates.filter(
        (candidate) => candidate.status === "HardPassed",
      );
      const assessmentStartedAt = Date.now();
      let assessments: Map<string, MatchAssessment>;
      try {
        assessments = normalizeAIAssessments(
          hardPassedCandidates,
          await this.dependencies.aiAssessment.assessCandidates(runnableJobProfile, hardPassedCandidates),
        );
        await this.recordAIAssessmentAudit(
          searchRun,
          runnableJobProfile,
          hardPassedCandidates,
          assessments,
          Date.now() - assessmentStartedAt,
          undefined,
        );
      } catch (error) {
        await this.recordAIAssessmentAudit(
          searchRun,
          runnableJobProfile,
          hardPassedCandidates,
          new Map(),
          Date.now() - assessmentStartedAt,
          error,
        );
        throw error;
      }

      searchRun = applySoftAssessments(searchRun, assessments);
      searchRun = await this.saveSearchRun(searchRun);

      return this.saveSearchRun(completeSearchRun(searchRun));
    } catch (error) {
      await this.saveSearchRun(failSearchRun(searchRun, formatFailureReason(error)));
      throw error;
    }
  }

  private async saveSearchRun(searchRun: SearchRun): Promise<SearchRun> {
    if (!this.dependencies.searchRuns) {
      return searchRun;
    }

    return this.dependencies.searchRuns.save(searchRun);
  }

  private async recordAIAssessmentAudit(
    searchRun: SearchRun,
    jobProfile: JobProfile,
    candidates: SearchRun["candidates"],
    assessments: Map<string, MatchAssessment>,
    durationMs: number,
    error: unknown | undefined,
  ): Promise<void> {
    if (!this.dependencies.aiAssessmentAudit || candidates.length === 0) {
      return;
    }

    const prompt = createMatchAssessmentPrompt(jobProfile, candidates);
    await this.dependencies.aiAssessmentAudit.record({
      id: this.dependencies.auditIdGenerator?.() ?? crypto.randomUUID(),
      searchRunId: searchRun.id,
      jobProfileId: jobProfile.id,
      jobProfileVersionId: searchRun.jobProfileVersionId,
      agentType: "match-assessment",
      provider: this.dependencies.aiAssessment.providerName ?? "unknown",
      model: this.dependencies.aiAssessment.modelName ?? "unknown",
      promptVersion: MATCH_ASSESSMENT_PROMPT_VERSION,
      agentVersion: MATCH_ASSESSMENT_AGENT_VERSION,
      prompt,
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
      status: error ? "failure" : "success",
      errorType: error instanceof Error ? error.name : error ? "UnknownError" : undefined,
      errorMessage: error instanceof Error ? error.message : error ? "Unknown AI assessment error." : undefined,
      createdAt: new Date(),
    });
  }
}

function formatFailureReason(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return "UnknownError: Search run failed.";
}

function normalizeConfirmedJobProfileVersion(jobProfile: JobProfile): JobProfile {
  if (jobProfile.status !== "Confirmed" || jobProfile.currentVersionId) {
    return jobProfile;
  }

  return {
    ...jobProfile,
    currentVersionId: createDefaultJobProfileVersionId(jobProfile.id),
  };
}

function createMatchAssessmentPrompt(jobProfile: JobProfile, candidates: SearchRun["candidates"]): string {
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
