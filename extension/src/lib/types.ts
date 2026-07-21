// 与主工程契约对齐：src/api/schemas.ts 的 candidateDraftSchema / pluginCandidateSubmissionSchema。
// 字段变化时以 docs/30-technical-plugin-protocol.md + docs/31-technical-openapi.yaml 为准，此处同步修改。

export interface CandidateResume {
  name: string;
  title: string;
  city: string;
  educationLevel: string;
  yearsOfExperience: number; // 整数，≥0
  industries: string[];
  keywords: string[];
  summary: string;
}

export interface SourceLead {
  platform: string;
  url?: string;
  searchContext: string;
  fallbackClues: string[];
  expired?: boolean;
}

export interface CandidateDraft {
  fingerprint: string; // 指纹兜底：平台 profile id → url → 联系方式 → 姓名+公司+职位
  resume: CandidateResume;
  intent: string; // 求职意向，如「高」「中」「低」
  activityLevel: string; // 活跃度
  sourceLead: SourceLead;
}

export interface CandidateSubmission {
  batchId: string;
  sourcePlatform?: string;
  candidates: CandidateDraft[];
}

// §4b 原始载荷
export interface RawPayload {
  url?: string;
  matched?: "exact" | "heuristic";
  capturedAt?: string;
  json: unknown;
}

export interface RawCandidateSubmission {
  batchId: string;
  sourcePlatform: string;
  captureVersion?: string;
  payloads: RawPayload[];
}

export interface ParseDiagnostics {
  mappingVersion: string;
  geeksExtracted: number;
  draftsParsed: number;
  rejected: number;
  rejectedReasons: Record<string, number>;
  keyCensus: Record<string, number>;
}

export interface RawSubmissionResponse extends SubmissionResponse {
  parse: ParseDiagnostics;
}

export interface LoginResponse {
  token: string;
  tokenType: string;
  expiresIn: number;
}

export interface SubmissionResponse {
  searchRunId: string;
  status: string;
  rawSubmittedCount: number;
  acceptedCount: number;
  candidateCount: number;
}

// GET /api/plugin/search-runs/:id/status 的响应（只状态+计数，不含候选人明细）
export interface SearchRunStatus {
  id: string;
  status: string;
  rawSubmittedCount: number;
  targetResultCount: number;
}

// 主工程错误码（docs/30 §8）。插件按此决定动作。
export type PluginErrorCode =
  | "ValidationError"
  | "AuthError"
  | "RateLimited"
  | "SearchRunNotFound"
  | "SearchRunInvalid"
  | "SearchRunCompleted"
  | "SearchRunCancelled"
  | "SearchRunFailed"
  | "BatchConflict"
  | "InternalError";

export class PluginApiError extends Error {
  constructor(
    public readonly code: PluginErrorCode,
    message: string,
    public readonly httpStatus: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "PluginApiError";
  }
}

// popup ↔ background ↔ content 之间的消息协议
export type RuntimeMessage =
  | { type: "LOGIN"; email: string; password: string }
  | { type: "LOGOUT" }
  | { type: "GET_SESSION" }
  | { type: "SET_ACTIVE_RUN"; searchRunId: string }
  // 主路径：提交原始载荷（服务端解析）。fallbackCandidates 供 §4b 返回 404/5xx 时客户端兜底（docs/30 §4d）。
  | { type: "SUBMIT_RAW"; payloads: RawPayload[]; sourcePlatform: string; fallbackCandidates: CandidateDraft[] }
  | { type: "GET_RUN_STATUS" };

export interface SessionState {
  email: string | null;
  loggedIn: boolean;
  tokenExpiresAt: number | null; // epoch ms
  activeSearchRunId: string | null;
}
