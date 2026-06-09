import { useEffect, useState } from "react";
import {
  fetchAIAudits,
  fetchCandidateSummary,
  fetchCandidates,
  fetchJobProfile,
  fetchJobProfiles,
  fetchSearchRun,
} from "../lib/api-client.js";
import type { AIAudit, Candidate, CandidateSummary, JobProfile, SearchRun } from "../lib/types.js";

export interface AsyncData<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
}

function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncData<T> {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "请求失败，请稍后重试。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, deps);

  return { data, loading, error };
}

export function useJobProfiles(): AsyncData<JobProfile[]> {
  return useAsyncData(fetchJobProfiles, []);
}

export function useJobProfile(id: string): AsyncData<JobProfile | undefined> {
  return useAsyncData(() => fetchJobProfile(id), [id]);
}

export function useSearchRun(id: string): AsyncData<SearchRun | undefined> {
  return useAsyncData(() => fetchSearchRun(id), [id]);
}

export function useCandidates(): AsyncData<Candidate[]> {
  return useAsyncData(fetchCandidates, []);
}

export function useAIAudits(): AsyncData<AIAudit[]> {
  return useAsyncData(fetchAIAudits, []);
}

export function useCandidateSummary(profileId: string): AsyncData<CandidateSummary> {
  return useAsyncData(() => fetchCandidateSummary(profileId), [profileId]);
}
