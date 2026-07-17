export type Identifier = string;

export type JobProfileStatus = "Draft" | "Suggested" | "Confirmed" | "Archived";

export type SearchRunStatus =
  | "Created"
  | "Running"
  | "Acquired"
  | "Deduplicated"
  | "HardFiltered"
  | "Assessed"
  | "Completed"
  | "Interrupted"
  | "Failed"
  | "Cancelled";

export type CandidateResultStatus =
  | "Pending"
  | "Acquired"
  | "Deduplicated"
  | "HardPassed"
  | "HardRejected"
  | "Assessed"
  | "Displayable";

export type SearchEventType =
  | "JobProfileConfirmed"
  | "SearchStarted"
  | "CandidateResultsAcquired"
  | "CandidateResultsDeduplicated"
  | "HardFilterCompleted"
  | "SoftMatchAssessed"
  | "SearchCompleted"
  | "SearchFailed"
  | "RiskControlTriggered"
  | "SearchInterrupted"
  | "SourceLeadExpired"
  | "FallbackSourceCluesProvided";

export interface SearchCondition {
  keywords: string[];
  cities: string[];
  industries: string[];
  educationLevels: string[];
  minYearsOfExperience?: number;
}

export interface HardRequirement {
  key: string;
  label: string;
  weight: number;
  predicate: HardRequirementPredicate;
}

export type HardRequirementPredicate =
  | { type: "minYearsOfExperience"; value: number }
  | { type: "educationIn"; values: string[] }
  | { type: "keywordAny"; values: string[] }
  | { type: "industryIn"; values: string[] }
  | { type: "hardConditionRuleSet"; eliminationRules: HardConditionRule[]; passRules: HardConditionRule[] };

export type HardConditionRuleMode = "AND" | "OR";
export type HardConditionField = "keyword" | "city" | "industry" | "education" | "yearsOfExperience";
export type HardConditionOperator = "normalizedContainsAny" | "optionAny" | "rankAtLeast" | "min";

export interface HardConditionRule {
  id: string;
  label: string;
  mode: HardConditionRuleMode;
  conditions: HardConditionRuleCondition[];
}

export interface HardConditionRuleCondition {
  field: HardConditionField;
  operator: HardConditionOperator;
  values: string[];
  numericValue?: number;
  aliases: string[];
  rank?: number;
}

export type HardConditionValueType = "text" | "number" | "option";
export type HardConditionMatchMode = "exact" | "normalizedContains" | "min" | "optionAny" | "rankAtLeast";

export interface HardConditionDimension {
  id: Identifier;
  key: string;
  label: string;
  valueType: HardConditionValueType;
  supportedMatchModes: HardConditionMatchMode[];
  allowMultiple: boolean;
  createdAt: Date;
}

export interface HardConditionOption {
  id: Identifier;
  dimensionKey: string;
  value: string;
  label: string;
  aliases: string[];
  rank?: number;
  createdAt: Date;
}

export interface SoftRequirement {
  key: string;
  label: string;
  weight: number;
  description: string;
  /** 验证方式提示：看简历中什么信号才算真正满足该条件。 */
  verificationHint?: string;
}

export interface JobProfile {
  id: Identifier;
  createdByUserId?: Identifier;
  title: string;
  jdText: string;
  status: JobProfileStatus;
  currentVersionId?: Identifier;
  searchCondition: SearchCondition;
  hardRequirements: HardRequirement[];
  softRequirements: SoftRequirement[];
  /** 排除信号：命中即提示风险的简历特征描述，空数组表示未配置。 */
  negativeSignals: string[];
  confirmedAt?: Date;
}

export interface JobProfileVersion {
  id: Identifier;
  jobProfileId: Identifier;
  version: number;
  title: string;
  jdText: string;
  searchCondition: SearchCondition;
  hardRequirements: HardRequirement[];
  softRequirements: SoftRequirement[];
  negativeSignals: string[];
  status: "Draft" | "Confirmed";
  createdAt: Date;
  confirmedAt?: Date;
}

export interface CandidateResume {
  name: string;
  title: string;
  city: string;
  educationLevel: string;
  yearsOfExperience: number;
  industries: string[];
  keywords: string[];
  summary: string;
}

export interface MatchAssessment {
  score: number;
  recommendation: "推荐" | "待定" | "不推荐";
  recommendationReason: string;
  matchedPoints: string[];
  unmatchedPoints: string[];
  riskPoints: string[];
  trace: string;
  assessedAt: Date;
  jobProfileVersionId?: Identifier;
  promptVersion: string;
  agentVersion: string;
}

export type AIAssessmentAuditAgentType = "job-profile" | "soft-condition" | "match-assessment" | "search-refinement";
export type AIAssessmentAuditStatus = "success" | "failure";

export interface AIAssessmentAuditRecord {
  id: Identifier;
  searchRunId: Identifier;
  jobProfileId: Identifier;
  jobProfileVersionId?: Identifier;
  agentType: AIAssessmentAuditAgentType;
  provider: string;
  model: string;
  promptVersion: string;
  agentVersion: string;
  graphVersion?: string;
  prompt: string;
  candidateIds: Identifier[];
  inputSnapshot: {
    jobProfile: Pick<
      JobProfile,
      "id" | "title" | "searchCondition" | "hardRequirements" | "softRequirements" | "negativeSignals"
    >;
    candidates: Array<Pick<CandidateResult, "id" | "fingerprint" | "resume">>;
  };
  outputSnapshot: Array<{
    candidateId: Identifier;
    assessment: MatchAssessment;
  }>;
  durationMs: number;
  status: AIAssessmentAuditStatus;
  errorType?: string;
  errorMessage?: string;
  createdAt: Date;
}

export type SourceVerificationStatus = "unverified" | "active" | "expired" | "fallback_only";
export type SourceRiskLevel = "low" | "medium" | "high";

export interface OriginalSourceLink {
  id?: string;
  platform: string;
  url?: string;
  originalUrl?: string;
  normalizedUrl?: string;
  externalId?: string;
  searchContext: string;
  fallbackClues: string[];
  expired?: boolean;
  verificationStatus?: SourceVerificationStatus;
  status?: SourceVerificationStatus;
  lastVerifiedAt?: Date;
  riskLevel?: SourceRiskLevel;
  createdAt?: Date;
}

export type SourceLead = OriginalSourceLink;

export interface ResumeAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedAt: Date;
}

export interface PluginCandidateBatch {
  searchRunId: Identifier;
  batchId: string;
  requestDigest: string;
  candidateCount: number;
  status: "processing" | "completed" | "failed";
  failureReason?: string;
}

export interface CandidateAssessmentRecord {
  id: Identifier;
  candidateId: Identifier;
  candidateFingerprint: string;
  searchRunId: Identifier;
  jobProfileId: Identifier;
  jobProfileVersionId: Identifier;
  auditId?: Identifier;
  assessmentType: "initial" | "reassessment";
  assessment: MatchAssessment;
  createdAt: Date;
}

export interface CandidateResult {
  id: Identifier;
  fingerprint: string;
  jobProfileId: Identifier;
  searchRunId: Identifier;
  status: CandidateResultStatus;
  resume: CandidateResume;
  intent: string;
  activityLevel: string;
  sourceLead: SourceLead;
  hardRejectReasons: string[];
  matchAssessment?: MatchAssessment;
  resumeAttachment?: ResumeAttachment;
}

export interface SearchEvent {
  type: SearchEventType;
  occurredAt: Date;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchRun {
  id: Identifier;
  jobProfileId: Identifier;
  jobProfileVersionId: Identifier;
  ownerId?: Identifier;
  status: SearchRunStatus;
  targetResultCount: number;
  rawSubmittedCount: number;
  candidates: CandidateResult[];
  events: SearchEvent[];
  createdAt: Date;
  updatedAt: Date;
  interruptedReason?: string;
  failureReason?: string;
}

export interface User {
  id: Identifier;
  email: string;
  passwordHash: string;
  pluginTokenVersion: number;
  createdAt: Date;
}

export interface CandidateDraft {
  fingerprint: string;
  resume: CandidateResume;
  intent: string;
  activityLevel: string;
  sourceLead: SourceLead;
}

export interface RiskSignal {
  type: "captcha" | "accessLimited" | "sourceUnavailable" | "sourceLeadUnstable";
  reason: string;
}
