import type { CandidateAssessmentRecord, CandidateResult, SearchRun } from "./types.js";

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

export interface SearchRunReport {
  searchRunId: string;
  jobProfileId: string;
  jobProfileVersionId: string;
  status: SearchRun["status"];
  funnel: FunnelCounts;
  topCandidates: CandidateResult[];
  pendingCandidates: CandidateResult[];
}

export interface JobProfileRunReportEntry {
  searchRunId: string;
  status: SearchRun["status"];
  createdAt: Date;
  funnel: FunnelCounts;
}

export interface JobProfileReport {
  jobProfileId: string;
  currentVersionId: string;
  totalSearchRuns: number;
  /** 跨 SearchRun 求和的累计漏斗：每个 run 的当轮快照相加，不做跨 run 去重。 */
  cumulativeFunnel: FunnelCounts;
  /** 按 fingerprint 跨 SearchRun 去重后的唯一候选人数。 */
  uniqueCandidateCount: number;
  /** 跨 run 去重后按最新评估（含重评估覆盖）统计的推荐结论分布。 */
  currentRecommendationDistribution: {
    recommended: number;
    pending: number;
    notRecommended: number;
    unassessed: number;
  };
  runs: JobProfileRunReportEntry[];
}

const TOP_CANDIDATE_LIMIT = 5;

/** 候选人状态达到去重及之后阶段。 */
const DEDUPLICATED_STATUSES = new Set<CandidateResult["status"]>([
  "Deduplicated",
  "HardPassed",
  "HardRejected",
  "Assessed",
  "Displayable",
]);

const HARD_PASSED_STATUSES = new Set<CandidateResult["status"]>([
  "HardPassed",
  "Assessed",
  "Displayable",
]);

export function summarizeSearchRunFunnel(searchRun: SearchRun): FunnelCounts {
  const funnel: FunnelCounts = {
    rawSubmitted: searchRun.rawSubmittedCount,
    deduplicated: 0,
    hardPassed: 0,
    hardRejected: 0,
    assessed: 0,
    recommended: 0,
    pending: 0,
    notRecommended: 0,
  };

  for (const candidate of searchRun.candidates) {
    if (DEDUPLICATED_STATUSES.has(candidate.status)) funnel.deduplicated += 1;
    if (HARD_PASSED_STATUSES.has(candidate.status)) funnel.hardPassed += 1;
    if (candidate.status === "HardRejected") funnel.hardRejected += 1;
    if (candidate.matchAssessment) {
      funnel.assessed += 1;
      countRecommendation(funnel, candidate.matchAssessment.recommendation);
    }
  }

  return funnel;
}

export function summarizeSearchRunReport(searchRun: SearchRun): SearchRunReport {
  const assessedCandidates = searchRun.candidates
    .filter((candidate) => candidate.matchAssessment)
    .sort(compareByScoreDesc);
  const recommendedCandidates = assessedCandidates.filter(
    (candidate) => candidate.matchAssessment?.recommendation === "推荐",
  );
  const pendingCandidates = assessedCandidates.filter(
    (candidate) => candidate.matchAssessment?.recommendation === "待定",
  );
  const topCandidates = recommendedCandidates.slice(0, TOP_CANDIDATE_LIMIT);
  if (topCandidates.length < TOP_CANDIDATE_LIMIT) {
    topCandidates.push(...pendingCandidates.slice(0, TOP_CANDIDATE_LIMIT - topCandidates.length));
  }

  return {
    searchRunId: searchRun.id,
    jobProfileId: searchRun.jobProfileId,
    jobProfileVersionId: searchRun.jobProfileVersionId,
    status: searchRun.status,
    funnel: summarizeSearchRunFunnel(searchRun),
    topCandidates,
    pendingCandidates,
  };
}

export function summarizeJobProfileReport(
  searchRuns: SearchRun[],
  currentVersionId: string,
  latestAssessments: CandidateAssessmentRecord[] = [],
): JobProfileReport {
  const runs = [...searchRuns]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((searchRun) => ({
      searchRunId: searchRun.id,
      status: searchRun.status,
      createdAt: searchRun.createdAt,
      funnel: summarizeSearchRunFunnel(searchRun),
    }));

  const cumulativeFunnel = runs.reduce(
    (total, entry) => addFunnel(total, entry.funnel),
    createEmptyFunnel(),
  );

  const latestByFingerprint = new Map<string, CandidateResult>();
  for (const searchRun of searchRuns) {
    for (const candidate of searchRun.candidates) {
      latestByFingerprint.set(candidate.fingerprint, candidate);
    }
  }
  const latestAssessmentByFingerprint = new Map(
    latestAssessments.map((record) => [record.candidateFingerprint, record.assessment]),
  );

  const distribution = { recommended: 0, pending: 0, notRecommended: 0, unassessed: 0 };
  for (const [fingerprint, candidate] of latestByFingerprint) {
    const assessment = latestAssessmentByFingerprint.get(fingerprint) ?? candidate.matchAssessment;
    if (!assessment) {
      distribution.unassessed += 1;
    } else if (assessment.recommendation === "推荐") {
      distribution.recommended += 1;
    } else if (assessment.recommendation === "待定") {
      distribution.pending += 1;
    } else {
      distribution.notRecommended += 1;
    }
  }

  const [firstRun] = searchRuns;
  return {
    jobProfileId: firstRun?.jobProfileId ?? "",
    currentVersionId,
    totalSearchRuns: searchRuns.length,
    cumulativeFunnel,
    uniqueCandidateCount: latestByFingerprint.size,
    currentRecommendationDistribution: distribution,
    runs,
  };
}

function countRecommendation(funnel: FunnelCounts, recommendation: "推荐" | "待定" | "不推荐"): void {
  if (recommendation === "推荐") funnel.recommended += 1;
  else if (recommendation === "待定") funnel.pending += 1;
  else funnel.notRecommended += 1;
}

function createEmptyFunnel(): FunnelCounts {
  return {
    rawSubmitted: 0,
    deduplicated: 0,
    hardPassed: 0,
    hardRejected: 0,
    assessed: 0,
    recommended: 0,
    pending: 0,
    notRecommended: 0,
  };
}

function addFunnel(left: FunnelCounts, right: FunnelCounts): FunnelCounts {
  return {
    rawSubmitted: left.rawSubmitted + right.rawSubmitted,
    deduplicated: left.deduplicated + right.deduplicated,
    hardPassed: left.hardPassed + right.hardPassed,
    hardRejected: left.hardRejected + right.hardRejected,
    assessed: left.assessed + right.assessed,
    recommended: left.recommended + right.recommended,
    pending: left.pending + right.pending,
    notRecommended: left.notRecommended + right.notRecommended,
  };
}

function compareByScoreDesc(left: CandidateResult, right: CandidateResult): number {
  const leftScore = left.matchAssessment?.score ?? -1;
  const rightScore = right.matchAssessment?.score ?? -1;
  if (rightScore !== leftScore) return rightScore - leftScore;
  return left.fingerprint.localeCompare(right.fingerprint);
}
