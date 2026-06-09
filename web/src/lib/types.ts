export type JobProfileStatus = "Draft" | "Confirmed";
export type SearchRunStatus = "WaitingPlugin" | "Running" | "Completed" | "Cancelled";
export type CandidateStatus = "Pending" | "Displayable" | "HardRejected";
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
  prompt: string;
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
  assessedVersion: number;
}

export interface SearchRun {
  id: string;
  jobProfileId: string;
  status: SearchRunStatus;
  targetResultCount: number;
  rawSubmittedCount: number;
  createdAt: string;
  pluginInstruction: string;
  reason?: string;
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
