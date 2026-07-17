import type {
  JobProfileVersion,
  CandidateResult,
  SearchRun,
  LoginResponse,
  JobProfileVersionsResponse,
  JobProfileVersionDraftRequest,
  CreateOneTimeSearchRunResponse,
  CandidateSummaryResponse,
  AIAssessmentAuditsResponse,
  ReassessCandidatesResponse,
  HardConditionConfigResponse,
  SearchRunReportResponse,
  JobProfileReportResponse,
} from "./api-types.js";

export type ApiJobProfileVersion = JobProfileVersion;
export type ApiCandidate = CandidateResult;
export type ApiSearchRun = SearchRun;

let webToken = localStorage.getItem("jd-search-token") ?? "";

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(webToken ? { authorization: `Bearer ${webToken}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 401) { webToken = ""; localStorage.removeItem("jd-search-token"); }
  const body = await response.json() as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(body.message ?? body.error ?? `请求失败 (${response.status})`);
  return body;
}

export const realApi = {
  async login(email: string, password: string): Promise<void> {
    const result = await apiRequest<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    webToken = result.token; localStorage.setItem("jd-search-token", result.token);
  },
  hasToken: (): boolean => Boolean(webToken),
  logout: (): void => { webToken = ""; localStorage.removeItem("jd-search-token"); },
  versions: (profileId: string) => apiRequest<JobProfileVersionsResponse>(`/api/job-profiles/${profileId}/versions`),
  createDraft: (profileId: string, source: ApiJobProfileVersion, negativeSignals?: string[]) => apiRequest<ApiJobProfileVersion>(`/api/job-profiles/${profileId}/versions/draft`, {
    method: "POST",
    body: JSON.stringify({
      title: source.title, jdText: source.jdText, searchCondition: source.searchCondition,
      hardRequirements: source.hardRequirements, softRequirements: source.softRequirements,
      negativeSignals: negativeSignals ?? source.negativeSignals,
    } satisfies JobProfileVersionDraftRequest),
  }),
  confirmVersion: (profileId: string, versionId: string) => apiRequest<unknown>(`/api/job-profiles/${profileId}/versions/${versionId}/confirm`, { method: "POST" }),
  createRun: (version: ApiJobProfileVersion, targetResultCount: number) => apiRequest<CreateOneTimeSearchRunResponse>("/api/search-runs/one-time", {
    method: "POST", body: JSON.stringify({ sourceType: "plugin", targetResultCount, jobProfile: {
      id: version.jobProfileId, title: version.title, jdText: version.jdText, status: "Confirmed", currentVersionId: version.id,
      searchCondition: version.searchCondition, hardRequirements: version.hardRequirements, softRequirements: version.softRequirements,
      negativeSignals: version.negativeSignals,
    } }),
  }),
  run: (id: string) => apiRequest<ApiSearchRun>(`/api/search-runs/${id}`),
  runReport: (id: string) => apiRequest<SearchRunReportResponse>(`/api/search-runs/${id}/report`),
  profileReport: (profileId: string) => apiRequest<JobProfileReportResponse>(`/api/job-profiles/${profileId}/report`),
  cancel: (id: string) => apiRequest<ApiSearchRun>(`/api/search-runs/${id}/cancel`, { method: "POST" }),
  candidates: (profileId: string) => apiRequest<CandidateSummaryResponse>(`/api/job-profiles/${profileId}/candidates`),
  audits: (runId: string) => apiRequest<AIAssessmentAuditsResponse>(`/api/search-runs/${runId}/ai-assessment-audits`),
  reassess: (profileId: string) => apiRequest<ReassessCandidatesResponse>(`/api/job-profiles/${profileId}/reassess-candidates`, { method: "POST" }),
  hardConditionConfig: () => apiRequest<HardConditionConfigResponse>("/api/hard-condition-config"),
};
