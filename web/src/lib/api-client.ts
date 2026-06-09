import type { AIAudit, Candidate, CandidateSummary, JobProfile, SearchRun } from "./types.js";
import { mockAudit, mockCandidateSummary, mockCandidates, mockProfiles, initialSearchRun } from "./mock-data.js";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJobProfiles(): Promise<JobProfile[]> {
  await delay(200);
  return structuredClone(mockProfiles);
}

export async function fetchJobProfile(id: string): Promise<JobProfile | undefined> {
  await delay(100);
  const profile = mockProfiles.find((p) => p.id === id);
  return profile ? structuredClone(profile) : undefined;
}

export async function fetchSearchRun(_id: string): Promise<SearchRun | undefined> {
  await delay(100);
  return structuredClone(initialSearchRun);
}

export async function fetchCandidates(): Promise<Candidate[]> {
  await delay(200);
  return structuredClone(mockCandidates);
}

export async function fetchAIAudits(): Promise<AIAudit[]> {
  await delay(100);
  return [structuredClone(mockAudit)];
}

export async function fetchCandidateSummary(_profileId: string): Promise<CandidateSummary> {
  await delay(150);
  return structuredClone(mockCandidateSummary);
}

export async function cancelSearchRun(_id: string): Promise<SearchRun> {
  await delay(300);
  return { ...initialSearchRun, status: "Cancelled", reason: "用户在原型中取消任务。" };
}

export async function login(_email: string, _password: string): Promise<{ token: string }> {
  await delay(300);
  return { token: "mock-jwt-token" };
}
