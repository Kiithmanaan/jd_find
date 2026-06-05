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
import { normalizeAIAssessments } from "../domain/ai-assessment-contract.js";
import type { JobProfile, MatchAssessment, SearchRun } from "../domain/types.js";
import type {
  AIAssessmentAuditSink,
  AIAssessmentPort,
  JobProfileRepository,
  SearchRunRepository,
  SourceAdapter,
} from "./ports.js";

export interface SearchOrchestratorDependencies {
  sourceAdapter: SourceAdapter;
  aiAssessment: AIAssessmentPort;
  aiAssessmentAudit?: AIAssessmentAuditSink;
  jobProfiles?: JobProfileRepository;
  searchRuns?: SearchRunRepository;
  idGenerator: () => string;
  auditIdGenerator?: () => string;
}

export class SearchOrchestrator {
  constructor(private readonly dependencies: SearchOrchestratorDependencies) {}

  async runOneTimeSearch(jobProfile: JobProfile): Promise<SearchRun> {
    if (this.dependencies.jobProfiles) {
      await this.dependencies.jobProfiles.save(jobProfile);
    }

    let searchRun = createSearchRun(jobProfile, this.dependencies.idGenerator());
    searchRun = startSearchRun(searchRun);
    searchRun = await this.saveSearchRun(searchRun);

    try {
      const acquisition = await this.dependencies.sourceAdapter.acquireCandidates(jobProfile, searchRun);

      if (acquisition.riskSignal) {
        return this.saveSearchRun(interruptSearchRun(searchRun, acquisition.riskSignal));
      }

      searchRun = acquireCandidateResults(searchRun, jobProfile, acquisition.candidates);
      searchRun = await this.saveSearchRun(searchRun);

      searchRun = deduplicateWithinSearchRun(searchRun);
      searchRun = await this.saveSearchRun(searchRun);

      searchRun = applyHardFilter(searchRun, jobProfile);
      searchRun = await this.saveSearchRun(searchRun);

      const hardPassedCandidates = searchRun.candidates.filter(
        (candidate) => candidate.status === "HardPassed",
      );
      const assessments = normalizeAIAssessments(
        hardPassedCandidates,
        await this.dependencies.aiAssessment.assessCandidates(jobProfile, hardPassedCandidates),
      );
      await this.recordAIAssessmentAudit(searchRun, jobProfile, hardPassedCandidates, assessments);

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
  ): Promise<void> {
    if (!this.dependencies.aiAssessmentAudit || candidates.length === 0) {
      return;
    }

    await this.dependencies.aiAssessmentAudit.record({
      id: this.dependencies.auditIdGenerator?.() ?? crypto.randomUUID(),
      searchRunId: searchRun.id,
      jobProfileId: jobProfile.id,
      provider: this.dependencies.aiAssessment.providerName ?? "unknown",
      model: this.dependencies.aiAssessment.modelName ?? "unknown",
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
