import {
  acquireCandidateResults,
  applyHardFilter,
  applySoftAssessments,
  completeSearchRun,
  deduplicateWithinSearchRun,
  failSearchRun,
} from "../domain/search-run.js";
import {
  MATCH_ASSESSMENT_AGENT_VERSION,
  MATCH_ASSESSMENT_PROMPT_VERSION,
  normalizeAIAssessments,
} from "../domain/ai-assessment-contract.js";
import type { CandidateDraft, JobProfile, MatchAssessment, SearchRun } from "../domain/types.js";
import type {
  AIAssessmentAuditSink,
  AIAssessmentPort,
  JobProfileRepository,
  SearchRunRepository,
} from "./ports.js";

export interface PluginCandidateServiceDependencies {
  searchRuns: SearchRunRepository;
  jobProfiles: JobProfileRepository;
  aiAssessment: AIAssessmentPort;
  aiAssessmentAudit: AIAssessmentAuditSink;
  aggregationWindowMs?: number;
  aggregationThreshold?: number;
}

export class PluginCandidateService {
  private readonly aggregationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly aggregationWindowMs: number;
  private readonly aggregationThreshold: number;
  private readonly deps: PluginCandidateServiceDependencies;

  constructor(deps: PluginCandidateServiceDependencies) {
    this.deps = deps;
    this.aggregationWindowMs = deps.aggregationWindowMs ?? 30_000;
    this.aggregationThreshold = deps.aggregationThreshold ?? 20;
  }

  async acceptCandidates(
    searchRun: SearchRun,
    jobProfile: JobProfile,
    candidates: CandidateDraft[],
  ): Promise<SearchRun> {
    const next = acquireCandidateResults(searchRun, jobProfile, candidates);
    const saved = await this.deps.searchRuns.save(next);

    const acquiredCount = saved.candidates.filter(
      (candidate) => candidate.status === "Acquired",
    ).length;
    const shouldProcessImmediately =
      acquiredCount >= this.aggregationThreshold ||
      saved.rawSubmittedCount >= saved.targetResultCount;

    if (shouldProcessImmediately) {
      this.clearTimer(saved.id);
      return this.processPendingCandidates(saved, jobProfile);
    }

    this.scheduleTimer(saved.id);
    return saved;
  }

  cancelAggregation(searchRunId: string): void {
    this.clearTimer(searchRunId);
  }

  private scheduleTimer(searchRunId: string): void {
    if (this.aggregationTimers.has(searchRunId)) {
      return;
    }

    const timer = setTimeout(() => {
      void this.processScheduledAggregation(searchRunId);
    }, this.aggregationWindowMs);
    timer.unref();
    this.aggregationTimers.set(searchRunId, timer);
  }

  private clearTimer(searchRunId: string): void {
    const timer = this.aggregationTimers.get(searchRunId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.aggregationTimers.delete(searchRunId);
  }

  private async processScheduledAggregation(searchRunId: string): Promise<void> {
    this.clearTimer(searchRunId);

    const searchRun = await this.deps.searchRuns.findById(searchRunId);
    if (!searchRun || ["Completed", "Cancelled", "Failed"].includes(searchRun.status)) {
      return;
    }

    const jobProfile = await this.deps.jobProfiles.findById(searchRun.jobProfileId);
    if (!jobProfile) {
      await this.deps.searchRuns.save(
        failSearchRun(searchRun, "SearchRunInvalid: Search run job profile was not found."),
      );
      return;
    }

    await this.processPendingCandidates(searchRun, jobProfile);
  }

  private async processPendingCandidates(
    searchRun: SearchRun,
    jobProfile: JobProfile,
  ): Promise<SearchRun> {
    let next = searchRun;
    next = deduplicateWithinSearchRun(next);
    next = applyHardFilter(next, jobProfile);

    const hardPassedCandidates = next.candidates.filter(
      (candidate) => candidate.status === "HardPassed",
    );

    const assessmentStartedAt = Date.now();
    try {
      const assessments = normalizeAIAssessments(
        hardPassedCandidates,
        await this.deps.aiAssessment.assessCandidates(jobProfile, hardPassedCandidates),
      );
      await this.recordAudit(
        next,
        jobProfile,
        hardPassedCandidates,
        assessments,
        Date.now() - assessmentStartedAt,
        undefined,
      );
      next = applySoftAssessments(next, assessments);

      if (next.rawSubmittedCount >= next.targetResultCount) {
        next = completeSearchRun(next);
      }

      return this.deps.searchRuns.save(next);
    } catch (error) {
      await this.recordAudit(
        next,
        jobProfile,
        hardPassedCandidates,
        new Map(),
        Date.now() - assessmentStartedAt,
        error,
      );
      const failed = failSearchRun(
        next,
        error instanceof Error ? `${error.name}: ${error.message}` : "UnknownError",
      );
      await this.deps.searchRuns.save(failed);
      throw error;
    }
  }

  private async recordAudit(
    searchRun: SearchRun,
    jobProfile: JobProfile,
    candidates: SearchRun["candidates"],
    assessments: Map<string, MatchAssessment>,
    durationMs: number,
    error: unknown | undefined,
  ): Promise<void> {
    if (candidates.length === 0) {
      return;
    }

    const prompt = JSON.stringify({
      task: "match-assessment",
      jobProfileVersionId: jobProfile.currentVersionId,
      jobProfile: {
        title: jobProfile.title,
        hardRequirements: jobProfile.hardRequirements,
        softRequirements: jobProfile.softRequirements,
      },
      candidateIds: candidates.map((candidate) => candidate.id),
    });

    await this.deps.aiAssessmentAudit.record({
      id: crypto.randomUUID(),
      searchRunId: searchRun.id,
      jobProfileId: jobProfile.id,
      jobProfileVersionId: searchRun.jobProfileVersionId,
      agentType: "match-assessment",
      provider: this.deps.aiAssessment.providerName ?? "unknown",
      model: this.deps.aiAssessment.modelName ?? "unknown",
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

  destroy(): void {
    for (const [searchRunId] of this.aggregationTimers) {
      this.clearTimer(searchRunId);
    }
  }
}
