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

export interface JobProfileVersionRepository {
  save(version: JobProfileVersion): Promise<JobProfileVersion>;
  findById(id: string): Promise<JobProfileVersion | undefined>;
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
}

export interface OneTimeSearchJob {
  searchRunId: string;
  jobProfile: JobProfile;
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
    };

export interface SearchRunQueue {
  enqueueOneTimeSearch(job: OneTimeSearchJob): Promise<{ jobId: string; searchRunId: string }>;
}
