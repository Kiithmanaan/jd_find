import type {
  CandidateDraft,
  CandidateResult,
  AIAssessmentAuditRecord,
  HardConditionDimension,
  HardConditionOption,
  JobProfile,
  JobProfileVersion,
  MatchAssessment,
  RiskSignal,
  SearchRun,
  User,
  PluginCandidateBatch,
  CandidateAssessmentRecord,
} from "../domain/types.js";

export interface SourceAdapter {
  acquireCandidates(jobProfile: JobProfile, searchRun: SearchRun): Promise<{
    candidates: CandidateDraft[];
    riskSignal?: RiskSignal;
  }>;
}

export interface AIAssessmentPort {
  readonly providerName?: string;
  readonly modelName?: string;
  readonly graphVersion?: string;

  assessCandidates(
    jobProfile: JobProfile,
    candidates: CandidateResult[],
  ): Promise<Map<string, MatchAssessment>>;
}

export interface AIAssessmentAuditSink {
  record(record: AIAssessmentAuditRecord): Promise<void>;
}

export interface AIAssessmentAuditRepository extends AIAssessmentAuditSink {
  findBySearchRunId(searchRunId: string): Promise<AIAssessmentAuditRecord[]>;
}

export interface JobProfileRepository {
  save(jobProfile: JobProfile): Promise<JobProfile>;
  findById(id: string): Promise<JobProfile | undefined>;
}

export interface UserRepository {
  save(user: User): Promise<User>;
  findById(id: string): Promise<User | undefined>;
  findByEmail(email: string): Promise<User | undefined>;
}

export interface JobProfileVersionRepository {
  save(version: JobProfileVersion): Promise<JobProfileVersion>;
  findById(id: string): Promise<JobProfileVersion | undefined>;
  findByJobProfileId(jobProfileId: string): Promise<JobProfileVersion[]>;
  findLatestConfirmedByJobProfileId(jobProfileId: string): Promise<JobProfileVersion | undefined>;
}

export interface HardConditionConfigRepository {
  findDimensions(): Promise<HardConditionDimension[]>;
  findOptionsByDimensionKey(dimensionKey: string): Promise<HardConditionOption[]>;
  findAll(): Promise<Array<HardConditionDimension & { options: HardConditionOption[] }>>;
}

export interface SearchRunRepository {
  save(searchRun: SearchRun): Promise<SearchRun>;
  findById(id: string): Promise<SearchRun | undefined>;
  findByJobProfileId(jobProfileId: string): Promise<SearchRun[]>;
}

export interface OneTimeSearchJob {
  searchRunId: string;
  ownerId?: string;
  jobProfile: JobProfile;
  targetResultCount?: number;
  source: OneTimeSearchSource;
}

export type OneTimeSearchSource =
  | {
      type: "mock";
      candidates: CandidateDraft[];
      riskSignal?: RiskSignal;
    }
  | {
      type: "csv";
      csvFilePath: string;
    }
  | {
      type: "plugin";
    };

export interface SearchRunQueue {
  enqueueOneTimeSearch(job: OneTimeSearchJob): Promise<{ jobId: string; searchRunId: string }>;
}

export interface PluginAggregationQueue {
  schedule(searchRunId: string, delayMs: number): Promise<void>;
  cancel(searchRunId: string): Promise<void>;
}
export interface PluginAggregationJob { searchRunId: string; }

export type PluginBatchClaim = "claimed" | "duplicate" | "retry" | "conflict";

export interface PluginCandidateBatchRepository {
  claim(batch: PluginCandidateBatch): Promise<PluginBatchClaim>;
  complete(searchRunId: string, batchId: string): Promise<void>;
  fail(searchRunId: string, batchId: string, reason: string): Promise<void>;
}

export interface CandidateAssessmentRepository {
  append(record: CandidateAssessmentRecord): Promise<void>;
  findLatestByJobProfileVersion(
    jobProfileId: string,
    jobProfileVersionId: string,
  ): Promise<CandidateAssessmentRecord[]>;
}

export interface ReassessmentLockRepository {
  tryAcquire(jobProfileId: string, jobProfileVersionId: string): Promise<boolean>;
  release(jobProfileId: string, jobProfileVersionId: string): Promise<void>;
}

export interface AttachmentStorage {
  save(searchRunId: string, candidateId: string, filename: string, content: Buffer): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}
