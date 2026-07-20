import type {
  CandidateSubmission,
  LoginResponse,
  PluginErrorCode,
  SearchRunStatus,
  SubmissionResponse,
} from "./types.js";
import { PluginApiError } from "./types.js";
import { getApiBase, getToken } from "./storage.js";

interface ErrorBody {
  error?: string;
  message?: string;
  retryAfterSeconds?: number;
}

function mapError(status: number, body: ErrorBody, retryAfterHeader: string | null): PluginApiError {
  const code = (body.error as PluginErrorCode) ?? inferCode(status);
  const message = body.message ?? `HTTP ${status}`;
  const retryAfter =
    body.retryAfterSeconds ?? (retryAfterHeader ? Number(retryAfterHeader) : undefined);
  return new PluginApiError(code, message, status, retryAfter);
}

function inferCode(status: number): PluginErrorCode {
  if (status === 401 || status === 403) return "AuthError";
  if (status === 429) return "RateLimited";
  if (status === 400) return "ValidationError";
  if (status === 404) return "SearchRunNotFound";
  return "InternalError";
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const base = await getApiBase();
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");

  if (init.auth) {
    const token = await getToken();
    if (!token) {
      throw new PluginApiError("AuthError", "未登录，请先在插件中登录。", 401);
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...init, headers });
  } catch (networkError) {
    throw new PluginApiError(
      "InternalError",
      `网络错误：${networkError instanceof Error ? networkError.message : "unknown"}`,
      0,
    );
  }

  const body = (await parseJson(response)) as ErrorBody & Record<string, unknown>;
  if (!response.ok) {
    throw mapError(response.status, body, response.headers.get("Retry-After"));
  }
  return body as T;
}

// POST /api/plugin/auth/login —— 无需既有 token
export function pluginLogin(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/plugin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// POST /api/plugin/search-runs/:id/candidates —— 需 plugin token
export function submitCandidates(
  searchRunId: string,
  submission: CandidateSubmission,
): Promise<SubmissionResponse> {
  return request<SubmissionResponse>(
    `/api/plugin/search-runs/${encodeURIComponent(searchRunId)}/candidates`,
    { method: "POST", body: JSON.stringify(submission), auth: true },
  );
}

// GET /api/plugin/search-runs/:id/status —— plugin token，只返回状态与计数（docs/30 §7）
export function getSearchRunStatus(searchRunId: string): Promise<SearchRunStatus> {
  return request<SearchRunStatus>(
    `/api/plugin/search-runs/${encodeURIComponent(searchRunId)}/status`,
    { method: "GET", auth: true },
  );
}
