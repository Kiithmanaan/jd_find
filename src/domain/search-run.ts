import { createSearchEvent } from "./events.js";
import { evaluateHardRequirements } from "./hard-filter.js";
import { assertJobProfileConfirmed, createDefaultJobProfileVersionId } from "./job-profile.js";
import type {
  CandidateDraft,
  CandidateResult,
  JobProfile,
  MatchAssessment,
  RiskSignal,
  SearchRun,
} from "./types.js";

export const MVP_SINGLE_SEARCH_LIMIT = 200;

export interface CreateSearchRunOptions {
  targetResultCount: number | undefined;
  ownerId: string | undefined;
}

export function createSearchRun(jobProfile: JobProfile, id: string, options: CreateSearchRunOptions): SearchRun {
  assertJobProfileConfirmed(jobProfile);

  const now = new Date();

  return {
    id,
    jobProfileId: jobProfile.id,
    jobProfileVersionId: jobProfile.currentVersionId ?? createDefaultJobProfileVersionId(jobProfile.id),
    ownerId: options.ownerId,
    status: "Created",
    targetResultCount: options.targetResultCount ?? MVP_SINGLE_SEARCH_LIMIT,
    rawSubmittedCount: 0,
    candidates: [],
    events: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function startSearchRun(searchRun: SearchRun): SearchRun {
  return appendEvent(
    {
      ...searchRun,
      status: "Running",
      updatedAt: new Date(),
    },
    "SearchStarted",
  );
}

export function acquireCandidateResults(
  searchRun: SearchRun,
  jobProfile: JobProfile,
  drafts: CandidateDraft[],
): SearchRun {
  const remainingCapacity = Math.max(searchRun.targetResultCount - searchRun.rawSubmittedCount, 0);
  const limitedDrafts = drafts.slice(0, remainingCapacity);
  const candidates = limitedDrafts.map((draft, index): CandidateResult => {
    return {
      id: `${searchRun.id}-candidate-${searchRun.rawSubmittedCount + index + 1}`,
      fingerprint: draft.fingerprint,
      jobProfileId: jobProfile.id,
      searchRunId: searchRun.id,
      status: "Acquired",
      resume: draft.resume,
      intent: draft.intent,
      activityLevel: draft.activityLevel,
      sourceLead: draft.sourceLead,
      hardRejectReasons: [],
    };
  });

  return appendEvent(
    {
      ...searchRun,
      status: "Acquired",
      candidates: [...searchRun.candidates, ...candidates],
      updatedAt: new Date(),
      rawSubmittedCount: searchRun.rawSubmittedCount + limitedDrafts.length,
    },
    "CandidateResultsAcquired",
    undefined,
    { count: candidates.length },
  );
}

export function cancelSearchRun(searchRun: SearchRun, reason: string): SearchRun {
  return appendEvent(
    {
      ...searchRun,
      status: "Cancelled",
      updatedAt: new Date(),
    },
    "SearchInterrupted",
    reason,
  );
}

export function deduplicateWithinSearchRun(searchRun: SearchRun): SearchRun {
  const seen = new Set<string>();
  const candidates = searchRun.candidates
    .filter((candidate) => {
      if (seen.has(candidate.fingerprint)) {
        return false;
      }

      seen.add(candidate.fingerprint);
      return true;
    })
    .map((candidate) => ({
      ...candidate,
      status: "Deduplicated" as const,
    }));

  return appendEvent(
    {
      ...searchRun,
      status: "Deduplicated",
      candidates,
      updatedAt: new Date(),
    },
    "CandidateResultsDeduplicated",
    undefined,
    { count: candidates.length },
  );
}

export function applyHardFilter(searchRun: SearchRun, jobProfile: JobProfile): SearchRun {
  const candidates = searchRun.candidates.map((candidate) => {
    const result = evaluateHardRequirements(candidate, jobProfile.hardRequirements);

    return {
      ...candidate,
      status: result.passed ? ("HardPassed" as const) : ("HardRejected" as const),
      hardRejectReasons: result.reasons,
    };
  });

  return appendEvent(
    {
      ...searchRun,
      status: "HardFiltered",
      candidates,
      updatedAt: new Date(),
    },
    "HardFilterCompleted",
    undefined,
    {
      passed: candidates.filter((candidate) => candidate.status === "HardPassed").length,
      rejected: candidates.filter((candidate) => candidate.status === "HardRejected").length,
    },
  );
}

export function applySoftAssessments(
  searchRun: SearchRun,
  assessments: Map<string, MatchAssessment>,
): SearchRun {
  const candidates = searchRun.candidates.map((candidate) => {
    if (candidate.status === "HardRejected") {
      return candidate;
    }

    const assessment = assessments.get(candidate.id);
    if (!assessment) {
      return candidate;
    }

    return {
      ...candidate,
      status: "Assessed" as const,
      matchAssessment: assessment,
    };
  });

  return appendEvent(
    {
      ...searchRun,
      status: "Assessed",
      candidates,
      updatedAt: new Date(),
    },
    "SoftMatchAssessed",
    undefined,
    { assessed: candidates.filter((candidate) => candidate.status === "Assessed").length },
  );
}

export function completeSearchRun(searchRun: SearchRun): SearchRun {
  const candidates = [...searchRun.candidates]
    .map((candidate) => {
      if (candidate.status === "Assessed") {
        return {
          ...candidate,
          status: "Displayable" as const,
        };
      }

      return candidate;
    })
    .sort((left, right) => {
      const leftScore = left.matchAssessment?.score ?? -1;
      const rightScore = right.matchAssessment?.score ?? -1;
      return rightScore - leftScore;
    });

  return appendEvent(
    {
      ...searchRun,
      status: "Completed",
      candidates,
      updatedAt: new Date(),
    },
    "SearchCompleted",
  );
}

export function interruptSearchRun(searchRun: SearchRun, signal: RiskSignal): SearchRun {
  const triggered = appendEvent(searchRun, "RiskControlTriggered", signal.reason, {
    riskType: signal.type,
  });

  return appendEvent(
    {
      ...triggered,
      status: "Interrupted",
      interruptedReason: signal.reason,
      updatedAt: new Date(),
    },
    "SearchInterrupted",
    signal.reason,
  );
}

export function failSearchRun(searchRun: SearchRun, reason: string): SearchRun {
  return appendEvent(
    {
      ...searchRun,
      status: "Failed",
      failureReason: reason,
      updatedAt: new Date(),
    },
    "SearchFailed",
    reason,
  );
}

function appendEvent(
  searchRun: SearchRun,
  type: SearchRun["events"][number]["type"],
  reason?: string,
  metadata?: Record<string, unknown>,
): SearchRun {
  return {
    ...searchRun,
    events: [...searchRun.events, createSearchEvent(type, reason, metadata)],
  };
}
