export type JobProfileStatus = "Draft" | "Confirmed";

export type SearchRunStatus =
  | "Created"
  | "Running"
  | "Acquired"
  | "Deduplicated"
  | "HardFiltered"
  | "Assessed"
  | "Completed"
  | "Failed"
  | "Cancelled";

export type CandidateStatus = "Pending" | "Acquired" | "Deduplicated" | "HardPassed" | "HardRejected" | "Assessed" | "Displayable";
export type Recommendation = "推荐" | "待定" | "不推荐";

export interface SearchCondition {
  keywords: string;
  cities: string;
  industries: string;
  educationLevels: string;
  minYearsOfExperience: number;
}

export interface JobProfile {
  id: string;
  title: string;
  version: number;
  status: JobProfileStatus;
  owner: string;
  updatedAt: string;
  searchRunCount: number;
  jdText: string;
  searchCondition: SearchCondition;
  hardRequirements: string[];
  softRequirements: string;
}

export interface ProfileForm {
  title: string;
  jdText: string;
  keywords: string;
  cities: string;
  industries: string;
  educationLevels: string;
  minYearsOfExperience: number;
  hardRequirements: string;
  softRequirements: string;
}

export interface MatchAssessment {
  score: number;
  recommendation: Recommendation;
  recommendationReason: string;
  matchedPoints: string[];
  unmatchedPoints: string[];
  riskPoints: string[];
  trace: string;
}

export interface Candidate {
  id: string;
  name: string;
  title: string;
  city: string;
  educationLevel: string;
  yearsOfExperience: number;
  industries: string[];
  intent: string;
  activityLevel: string;
  sourcePlatform: string;
  sourceUrl: string;
  fallbackClues: string[];
  status: CandidateStatus;
  matchAssessment?: MatchAssessment;
  hardRejectReasons: string[];
  hasAttachment: boolean;
  resumeAttachment?: ResumeAttachment;
  assessedVersion: number;
}

export interface SearchEvent {
  type: string;
  occurredAt: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchRun {
  id: string;
  jobProfileId: string;
  jobProfileTitle: string;
  status: SearchRunStatus;
  targetResultCount: number;
  rawSubmittedCount: number;
  createdAt: string;
  updatedAt: string;
  candidates: Candidate[];
  failureReason?: string;
  events: SearchEvent[];
  searchRunUrl: string;
}

export interface CreateSearchRunRequest {
  jobProfile: JobProfile;
  targetResultCount: number;
}

export interface CreateSearchRunResponse {
  searchRunId: string;
  status: SearchRunStatus;
  statusUrl: string;
}

export interface AIAudit {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
  agentVersion: string;
  durationMs: number;
  status: "success" | "failure";
  candidateIds: string[];
  inputSnapshot: Record<string, unknown>;
  outputSnapshot: Record<string, unknown>;
}

export interface CandidateSummary {
  jobProfileId: string;
  jobProfileVersionId: string;
  currentVersionCandidates: Candidate[];
  staleVersionCandidates: Candidate[];
}
// ─── JobProfile 版本 ──────────────────────────────────────────────

export interface ResumeAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  receivedAt: string;
}

export interface JobProfileVersion {
  id: string;
  jobProfileId: string;
  version: number;
  title: string;
  jdText: string;
  searchCondition: SearchCondition;
  hardRequirements: string[];
  softRequirements: string;
  status: "Draft" | "Confirmed";
  createdAt: string;
  confirmedAt?: string;
}

// ─── 硬筛配置 ──────────────────────────────────────────────────────

export interface HardConditionDimension {
  id: string;
  key: string;
  label: string;
  valueType: "text" | "number" | "option";
  supportedMatchModes: string[];
  allowMultiple: boolean;
  createdAt: string;
}

export interface HardConditionOption {
  id: string;
  dimensionKey: string;
  value: string;
  label: string;
  aliases: string[];
  rank?: number;
  createdAt: string;
}

export interface HardConditionConfigDimension extends HardConditionDimension {
  options: HardConditionOption[];
}

export interface HardConditionConfigResponse {
  dimensions: HardConditionConfigDimension[];
}
