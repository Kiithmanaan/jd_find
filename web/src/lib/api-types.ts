// 与后端契约对齐的唯一事实源。
// 对照 src/domain/types.ts + src/api/schemas.ts + src/api/app.ts 的响应整形（toSearchRunResponse/toCandidateResponse）手写。
// Date 字段在 JSON 传输中序列化为 ISO 字符串，因此这里一律用 string。
// resumeAttachment 在响应里不含 storageKey（后端 toCandidateResponse 已剥离），故此处不定义该字段。

export type Identifier = string;

// ─── JobProfile ──────────────────────────────────────────────────

export type JobProfileStatus = "Draft" | "Suggested" | "Confirmed" | "Archived";

export interface SearchCondition {
  keywords: string[];
  cities: string[];
  industries: string[];
  educationLevels: string[];
  minYearsOfExperience?: number;
}

export type HardConditionRuleMode = "AND" | "OR";
export type HardConditionField = "keyword" | "city" | "industry" | "education" | "yearsOfExperience";
export type HardConditionOperator = "normalizedContainsAny" | "optionAny" | "rankAtLeast" | "min";

export interface HardConditionRuleCondition {
  field: HardConditionField;
  operator: HardConditionOperator;
  values: string[];
}

export interface HardConditionRule {
  id: string;
  label: string;
  mode: HardConditionRuleMode;
  conditions: HardConditionRuleCondition[];
}

export type HardRequirementPredicate =
  | { type: "minYearsOfExperience"; value: number }
  | { type: "educationIn"; values: string[] }
  | { type: "keywordAny"; values: string[] }
  | { type: "industryIn"; values: string[] }
  | { type: "hardConditionRuleSet"; eliminationRules: HardConditionRule[]; passRules: HardConditionRule[] };

export interface HardRequirement {
  key: string;
  label: string;
  weight: number;
  predicate: HardRequirementPredicate;
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
  confirmedAt?: string;
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
  createdAt: string;
  confirmedAt?: string;
}

// ─── 硬筛配置（GET /api/hard-condition-config，已与后端一致） ──────

export interface HardConditionDimension {
  id: Identifier;
  key: string;
  label: string;
  valueType: "text" | "number" | "option";
  supportedMatchModes: string[];
  allowMultiple: boolean;
  createdAt: string;
}

export interface HardConditionOption {
  id: Identifier;
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

// ─── 候选人 ──────────────────────────────────────────────────────

export type CandidateResultStatus =
  | "Pending"
  | "Acquired"
  | "Deduplicated"
  | "HardPassed"
  | "HardRejected"
  | "Assessed"
  | "Displayable";

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

export type SourceVerificationStatus = "unverified" | "active" | "expired" | "fallback_only";
export type SourceRiskLevel = "low" | "medium" | "high";

export interface SourceLead {
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
  lastVerifiedAt?: string;
  riskLevel?: SourceRiskLevel;
  createdAt?: string;
}

export interface MatchAssessment {
  score: number;
  recommendation: "推荐" | "待定" | "不推荐";
  recommendationReason: string;
  matchedPoints: string[];
  unmatchedPoints: string[];
  riskPoints: string[];
  trace: string;
  assessedAt: string;
  jobProfileVersionId?: Identifier;
  promptVersion: string;
  agentVersion: string;
}

/** 响应里的附件信息不含 storageKey（后端已剥离，不对外暴露本地存储路径）。 */
export interface PublicResumeAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
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
  resumeAttachment?: PublicResumeAttachment;
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

// ─── SearchRun ───────────────────────────────────────────────────

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

export interface SearchEvent {
  type: SearchEventType;
  occurredAt: string;
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
  createdAt: string;
  updatedAt: string;
  interruptedReason?: string;
  failureReason?: string;
}

// ─── AI 评估审计 ─────────────────────────────────────────────────

export type AIAssessmentAuditAgentType = "job-profile" | "soft-condition" | "match-assessment";
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
  candidateIds: Identifier[];
  durationMs: number;
  status: AIAssessmentAuditStatus;
  errorType?: string;
  errorMessage?: string;
  createdAt: string;
}

// ─── 各端点请求/响应体 ────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface JobProfileVersionsResponse {
  currentVersionId?: string;
  versions: JobProfileVersion[];
}

export interface JobProfileVersionDraftRequest {
  title: string;
  jdText: string;
  searchCondition: SearchCondition;
  hardRequirements: HardRequirement[];
  softRequirements: SoftRequirement[];
  negativeSignals?: string[];
}

export interface CreateOneTimeSearchRunRequest {
  jobProfile: JobProfile;
  targetResultCount: number;
}

export interface CreateOneTimeSearchRunResponse {
  jobId?: string;
  searchRunId: Identifier;
  status: SearchRunStatus | "Queued";
  statusUrl: string;
}

export interface CandidateSummaryResponse {
  currentVersionCandidates: CandidateResult[];
  staleVersionCandidates: CandidateResult[];
}

export interface AIAssessmentAuditsResponse {
  records: AIAssessmentAuditRecord[];
}

export interface ReassessCandidatesResponse {
  reassessedCount: number;
}

// ─── 澄清访谈（/api/job-profiles/:id/clarification-interviews 等） ──────────

export type InterviewTopicKey =
  | "role-purpose"
  | "hard-gates"
  | "vital-skills"
  | "negative-signals"
  | "target-companies"
  | "search-keywords"
  | "soft-preferences";

export interface InterviewTurn {
  topicKey: InterviewTopicKey;
  question: string;
  suggestedAnswer: string;
  answer?: string;
  askedAt: string;
  answeredAt?: string;
  ai: {
    provider: string;
    model: string;
    promptVersion: string;
    agentVersion: string;
    graphVersion?: string;
    durationMs: number;
  };
}

export interface InterviewDraftOutput {
  jdText: string;
  hardRequirementNotes: string[];
  softRequirements: SoftRequirement[];
  negativeSignals: string[];
  searchKeywords: string[];
}

export interface ClarificationInterviewSession {
  id: Identifier;
  jobProfileId: Identifier;
  createdByUserId?: Identifier;
  status: "InProgress" | "Completed" | "Abandoned";
  currentTopicIndex: number;
  turns: InterviewTurn[];
  currentQuestion?: {
    topicKey: InterviewTopicKey;
    question: string;
    suggestedAnswer: string;
  };
  draftOutput?: InterviewDraftOutput;
  provider: string;
  model: string;
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ClarificationInterviewListResponse {
  jobProfileId: Identifier;
  sessions: ClarificationInterviewSession[];
}

// ─── 搜索词迭代（/api/search-runs/:id/refinement-suggestions） ──────────

export interface SearchRefinementSuggestion {
  id: Identifier;
  searchRunId: Identifier;
  jobProfileId: Identifier;
  jobProfileVersionId: Identifier;
  suggestedSearchCondition: SearchCondition;
  addedKeywords: string[];
  droppedKeywords: string[];
  reasoning: string;
  analysisSnapshot: {
    recommendedCount: number;
    eliminatedCount: number;
    recommendedTraits: string[];
    eliminatedTraits: string[];
  };
  provider: string;
  model: string;
  promptVersion: string;
  agentVersion: string;
  createdAt: string;
}

export interface SearchRefinementSuggestionsResponse {
  searchRunId: Identifier;
  suggestions: SearchRefinementSuggestion[];
}

// ─── 寻访报告（GET /api/search-runs/:id/report、GET /api/job-profiles/:id/report） ──

export interface FunnelCounts {
  rawSubmitted: number;
  deduplicated: number;
  hardPassed: number;
  hardRejected: number;
  assessed: number;
  recommended: number;
  pending: number;
  notRecommended: number;
}

export interface SearchRunReportResponse {
  searchRunId: Identifier;
  jobProfileId: Identifier;
  jobProfileVersionId: Identifier;
  status: SearchRunStatus;
  funnel: FunnelCounts;
  /** 推荐候选人按匹配分降序前 5，不足补高分待定。 */
  topCandidates: CandidateResult[];
  /** 全部推荐结论为待定的候选人，按匹配分降序。 */
  pendingCandidates: CandidateResult[];
}

export interface JobProfileReportResponse {
  jobProfileId: Identifier;
  currentVersionId: Identifier;
  totalSearchRuns: number;
  /** 各 run 当轮快照相加，不做跨 run 去重。 */
  cumulativeFunnel: FunnelCounts;
  uniqueCandidateCount: number;
  /** 跨 run 去重后按最新评估（含重评估覆盖）的分布，与累计漏斗口径不同。 */
  currentRecommendationDistribution: {
    recommended: number;
    pending: number;
    notRecommended: number;
    unassessed: number;
  };
  runs: Array<{
    searchRunId: Identifier;
    status: SearchRunStatus;
    createdAt: string;
    funnel: FunnelCounts;
  }>;
}
