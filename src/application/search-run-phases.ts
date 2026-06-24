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
  createMatchAssessmentPrompt,
  normalizeAIAssessments,
} from "../domain/ai-assessment-contract.js";
import {
  createConfirmedJobProfileVersion,
  normalizeConfirmedJobProfileVersion,
} from "../domain/job-profile.js";
import { formatFailureReason } from "../domain/errors.js";
import type { JobProfile, MatchAssessment, SearchRun } from "../domain/types.js";
import type {
  AIAssessmentAuditSink,
  AIAssessmentPort,
  JobProfileRepository,
  JobProfileVersionRepository,
  SearchRunRepository,
  SourceAdapter,
} from "./ports.js";

// ─── Phase 1: 创建并启动 SearchRun ──────────────────────────────

export class SetupSearchRunService {
  private readonly jobProfiles: JobProfileRepository | undefined;
  private readonly jobProfileVersions: JobProfileVersionRepository | undefined;
  private readonly searchRuns: SearchRunRepository | undefined;
  private readonly idGenerator: () => string;

  constructor(options: {
    jobProfiles?: JobProfileRepository;
    jobProfileVersions?: JobProfileVersionRepository;
    searchRuns?: SearchRunRepository;
    idGenerator: () => string;
  }) {
    this.jobProfiles = options.jobProfiles;
    this.jobProfileVersions = options.jobProfileVersions;
    this.searchRuns = options.searchRuns;
    this.idGenerator = options.idGenerator;
  }

  async execute(jobProfile: JobProfile, ownerId: string | undefined): Promise<SearchRun> {
    const runnableJobProfile = normalizeConfirmedJobProfileVersion(jobProfile);

    if (this.jobProfiles) {
      await this.jobProfiles.save(runnableJobProfile);
    }
    if (this.jobProfileVersions && runnableJobProfile.status === "Confirmed") {
      await this.jobProfileVersions.save(createConfirmedJobProfileVersion(runnableJobProfile));
    }

    let searchRun = createSearchRun(runnableJobProfile, this.idGenerator(), {
      targetResultCount: undefined,
      ownerId,
    });
    searchRun = startSearchRun(searchRun);

    if (this.searchRuns) {
      searchRun = await this.searchRuns.save(searchRun);
    }

    return searchRun;
  }
}

// ─── Phase 2: 采集、去重、硬筛 ─────────────────────────────────

export interface AcquirePhaseResult {
  searchRun: SearchRun;
  riskTriggered: boolean;
}

export class AcquirePhaseService {
  private readonly sourceAdapter: SourceAdapter;
  private readonly searchRuns: SearchRunRepository | undefined;

  constructor(options: {
    sourceAdapter: SourceAdapter;
    searchRuns?: SearchRunRepository;
  }) {
    this.sourceAdapter = options.sourceAdapter;
    this.searchRuns = options.searchRuns;
  }

  async execute(jobProfile: JobProfile, searchRun: SearchRun): Promise<AcquirePhaseResult> {
    const acquisition = await this.sourceAdapter.acquireCandidates(jobProfile, searchRun);

    if (acquisition.riskSignal) {
      const interrupted = interruptSearchRun(searchRun, acquisition.riskSignal);
      return { searchRun: await this.save(interrupted), riskTriggered: true };
    }

    let next = acquireCandidateResults(searchRun, jobProfile, acquisition.candidates);
    next = await this.save(next);

    next = deduplicateWithinSearchRun(next);
    next = await this.save(next);

    next = applyHardFilter(next, jobProfile);
    next = await this.save(next);

    return { searchRun: next, riskTriggered: false };
  }

  private async save(searchRun: SearchRun): Promise<SearchRun> {
    return this.searchRuns ? this.searchRuns.save(searchRun) : searchRun;
  }
}

// ─── Phase 3: AI 评估与审计 ─────────────────────────────────────

export class AssessmentPhaseService {
  private readonly aiAssessment: AIAssessmentPort;
  private readonly aiAssessmentAudit: AIAssessmentAuditSink | undefined;
  private readonly searchRuns: SearchRunRepository | undefined;
  private readonly auditIdGenerator: () => string;

  constructor(options: {
    aiAssessment: AIAssessmentPort;
    aiAssessmentAudit?: AIAssessmentAuditSink;
    searchRuns?: SearchRunRepository;
    auditIdGenerator: () => string;
  }) {
    this.aiAssessment = options.aiAssessment;
    this.aiAssessmentAudit = options.aiAssessmentAudit;
    this.searchRuns = options.searchRuns;
    this.auditIdGenerator = options.auditIdGenerator;
  }

  async execute(jobProfile: JobProfile, searchRun: SearchRun): Promise<SearchRun> {
    const hardPassedCandidates = searchRun.candidates.filter(
      (candidate) => candidate.status === "HardPassed",
    );
    const assessmentStartedAt = Date.now();
    let assessments: Map<string, MatchAssessment>;

    try {
      assessments = normalizeAIAssessments(
        hardPassedCandidates,
        await this.aiAssessment.assessCandidates(jobProfile, hardPassedCandidates),
      );
      await this.recordAudit(searchRun, jobProfile, hardPassedCandidates, assessments, assessmentStartedAt, undefined);
    } catch (error) {
      await this.recordAudit(searchRun, jobProfile, hardPassedCandidates, new Map(), assessmentStartedAt, error);
      throw error;
    }

    const next = applySoftAssessments(searchRun, assessments);
    return this.save(next);
  }

  private async save(searchRun: SearchRun): Promise<SearchRun> {
    return this.searchRuns ? this.searchRuns.save(searchRun) : searchRun;
  }

  private async recordAudit(
    searchRun: SearchRun,
    jobProfile: JobProfile,
    candidates: SearchRun["candidates"],
    assessments: Map<string, MatchAssessment>,
    startedAt: number,
    error: unknown | undefined,
  ): Promise<void> {
    if (!this.aiAssessmentAudit || candidates.length === 0) {
      return;
    }

    const durationMs = Date.now() - startedAt;
    await this.aiAssessmentAudit.record({
      id: this.auditIdGenerator(),
      searchRunId: searchRun.id,
      jobProfileId: jobProfile.id,
      jobProfileVersionId: searchRun.jobProfileVersionId,
      agentType: "match-assessment",
      provider: this.aiAssessment.providerName ?? "unknown",
      model: this.aiAssessment.modelName ?? "unknown",
      promptVersion: MATCH_ASSESSMENT_PROMPT_VERSION,
      agentVersion: MATCH_ASSESSMENT_AGENT_VERSION,
      graphVersion: this.aiAssessment.graphVersion,
      prompt: createMatchAssessmentPrompt(jobProfile, candidates.map((c) => c.id)),
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

// ─── Phase 4: 完成或失败 ────────────────────────────────────────

export class CompletionPhaseService {
  private readonly searchRuns: SearchRunRepository | undefined;

  constructor(options: { searchRuns?: SearchRunRepository }) {
    this.searchRuns = options.searchRuns;
  }

  async complete(searchRun: SearchRun): Promise<SearchRun> {
    const completed = completeSearchRun(searchRun);
    return this.save(completed);
  }

  async fail(searchRun: SearchRun, error: unknown): Promise<SearchRun> {
    const failed = failSearchRun(searchRun, formatFailureReason(error));
    return this.save(failed);
  }

  private async save(searchRun: SearchRun): Promise<SearchRun> {
    return this.searchRuns ? this.searchRuns.save(searchRun) : searchRun;
  }
}
