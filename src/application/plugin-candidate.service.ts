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
  PluginCandidateBatchRepository,
  PluginAggregationQueue,
  CandidateAssessmentRepository,
} from "./ports.js";
import { createHash } from "node:crypto";
import { BatchConflictError, formatFailureReason } from "../domain/errors.js";

export interface PluginCandidateServiceDependencies {
  searchRuns: SearchRunRepository;
  jobProfiles: JobProfileRepository;
  aiAssessment: AIAssessmentPort;
  aiAssessmentAudit: AIAssessmentAuditSink;
  pluginBatches: PluginCandidateBatchRepository;
  aggregationQueue?: PluginAggregationQueue;
  candidateAssessments?: CandidateAssessmentRepository;
  aggregationWindowMs?: number;
  aggregationThreshold?: number;
}

export class PluginCandidateService {
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
    batchId: string,
    // §4b /raw-candidates 传入原始请求体摘要，使幂等判定基于原始载荷而非解析结果，
    // 映射升级后重放同一批次仍幂等（docs/30 §4b）。§4 不传，退回按解析后候选人摘要。
    requestDigest?: string,
  ): Promise<SearchRun> {
    const digest =
      requestDigest ?? createHash("sha256").update(JSON.stringify(candidates)).digest("hex");
    const claim = await this.deps.pluginBatches.claim({
      searchRunId: searchRun.id,
      batchId,
      requestDigest: digest,
      candidateCount: candidates.length,
      status: "processing",
    });
    if (claim === "conflict") throw new BatchConflictError();
    if (claim === "duplicate") return searchRun;

    try {
    const next = acquireCandidateResults(searchRun, jobProfile, candidates);
    const saved = await this.deps.searchRuns.save(next);

    const acquiredCount = saved.candidates.filter(
      (candidate) => candidate.status === "Acquired",
    ).length;
    const shouldProcessImmediately =
      acquiredCount >= this.aggregationThreshold ||
      saved.rawSubmittedCount >= saved.targetResultCount;

    if (shouldProcessImmediately) {
      await this.deps.aggregationQueue?.cancel(saved.id);
      const processed = await this.processPendingCandidates(saved, jobProfile);
      await this.deps.pluginBatches.complete(searchRun.id, batchId);
      return processed;
    }

    await this.deps.aggregationQueue?.schedule(saved.id, this.aggregationWindowMs);
    await this.deps.pluginBatches.complete(searchRun.id, batchId);
    return saved;
    } catch (error) {
      await this.deps.pluginBatches.fail(searchRun.id, batchId, formatFailureReason(error));
      throw error;
    }
  }

  async cancelAggregation(searchRunId: string): Promise<void> {
    await this.deps.aggregationQueue?.cancel(searchRunId);
  }

  async processScheduledAggregation(searchRunId: string): Promise<void> {
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
      const auditId = await this.recordAudit(
        next,
        jobProfile,
        hardPassedCandidates,
        assessments,
        Date.now() - assessmentStartedAt,
        undefined,
      );
      for (const candidate of hardPassedCandidates) {
        const assessment = assessments.get(candidate.id);
        if (assessment) await this.deps.candidateAssessments?.append({
          id: crypto.randomUUID(), candidateId: candidate.id, candidateFingerprint: candidate.fingerprint,
          searchRunId: next.id, jobProfileId: jobProfile.id, jobProfileVersionId: next.jobProfileVersionId,
          auditId, assessmentType: "initial", assessment, createdAt: new Date(),
        });
      }
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
  ): Promise<string | undefined> {
    if (candidates.length === 0) {
      return undefined;
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

    const auditId = crypto.randomUUID();
    await this.deps.aiAssessmentAudit.record({
      id: auditId,
      searchRunId: searchRun.id,
      jobProfileId: jobProfile.id,
      jobProfileVersionId: searchRun.jobProfileVersionId,
      agentType: "match-assessment",
      provider: this.deps.aiAssessment.providerName ?? "unknown",
      model: this.deps.aiAssessment.modelName ?? "unknown",
      promptVersion: MATCH_ASSESSMENT_PROMPT_VERSION,
      agentVersion: MATCH_ASSESSMENT_AGENT_VERSION,
      graphVersion: this.deps.aiAssessment.graphVersion,
      prompt,
      candidateIds: candidates.map((candidate) => candidate.id),
      inputSnapshot: {
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
    return auditId;
  }

}
