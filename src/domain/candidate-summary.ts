import type { CandidateAssessmentRecord, CandidateResult, SearchRun } from "./types.js";

export interface JobProfileCandidateSummary {
  currentVersionCandidates: CandidateResult[];
  staleVersionCandidates: CandidateResult[];
}

export function summarizeJobProfileCandidates(
  searchRuns: SearchRun[],
  currentJobProfileVersionId: string,
  currentAssessments: CandidateAssessmentRecord[] = [],
): JobProfileCandidateSummary {
  const latestByFingerprint = new Map<string, CandidateResult>();

  for (const searchRun of searchRuns) {
    for (const candidate of searchRun.candidates) {
      latestByFingerprint.set(candidate.fingerprint, structuredClone(candidate));
    }
  }

  for (const record of currentAssessments) {
    const candidate = latestByFingerprint.get(record.candidateFingerprint);
    if (candidate) latestByFingerprint.set(record.candidateFingerprint, { ...candidate, status: "Displayable", matchAssessment: record.assessment });
  }
  const candidates = [...latestByFingerprint.values()].sort(compareCandidatesByAssessment);
  return {
    currentVersionCandidates: candidates.filter(
      (candidate) => candidate.matchAssessment?.jobProfileVersionId === currentJobProfileVersionId,
    ),
    staleVersionCandidates: candidates.filter(
      (candidate) => candidate.matchAssessment?.jobProfileVersionId !== currentJobProfileVersionId,
    ),
  };
}

function compareCandidatesByAssessment(left: CandidateResult, right: CandidateResult): number {
  const leftScore = left.matchAssessment?.score ?? -1;
  const rightScore = right.matchAssessment?.score ?? -1;

  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  return left.fingerprint.localeCompare(right.fingerprint);
}
