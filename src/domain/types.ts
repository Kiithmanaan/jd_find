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
  | { type: "industryIn"; values: string[] };

export interface SoftRequirement {
  key: string;
  label: string;
  weight: number;
  description: string;
}

export interface JobProfile {
  id: Identifier;
  title: string;
  jdText: string;
  status: JobProfileStatus;
  searchCondition: SearchCondition;
  hardRequirements: HardRequirement[];
  softRequirements: SoftRequirement[];
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
  fitPoints: string[];
  riskPoints: string[];
  assessedAt: Date;
}

export interface AIAssessmentAuditRecord {
  id: Identifier;
  searchRunId: Identifier;
  jobProfileId: Identifier;
  provider: string;
  model: string;
  candidateIds: Identifier[];
  inputSnapshot: {
    jobProfile: Pick<JobProfile, "id" | "title" | "searchCondition" | "hardRequirements" | "softRequirements">;
    candidates: Array<Pick<CandidateResult, "id" | "fingerprint" | "resume">>;
  };
  outputSnapshot: Array<{
    candidateId: Identifier;
    assessment: MatchAssessment;
  }>;
  createdAt: Date;
}

export interface SourceLead {
  platform: string;
  url?: string;
  searchContext: string;
  fallbackClues: string[];
  expired?: boolean;
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
  status: SearchRunStatus;
  targetResultCount: number;
  candidates: CandidateResult[];
  events: SearchEvent[];
  createdAt: Date;
  updatedAt: Date;
  interruptedReason?: string;
  failureReason?: string;
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
