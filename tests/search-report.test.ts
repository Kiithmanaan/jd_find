import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeJobProfileReport,
  summarizeSearchRunReport,
} from "../src/domain/search-report.js";
import type { CandidateAssessmentRecord, CandidateResult, MatchAssessment, SearchRun } from "../src/domain/types.js";
import { createMatchAssessment } from "./fixtures.js";

function createCandidate(
  id: string,
  status: CandidateResult["status"],
  assessment?: MatchAssessment,
): CandidateResult {
  return {
    id,
    fingerprint: id,
    jobProfileId: "job-1",
    searchRunId: "run-1",
    status,
    resume: {
      name: id,
      title: "顾问",
      city: "上海",
      educationLevel: "本科",
      yearsOfExperience: 8,
      industries: ["企业服务"],
      keywords: ["解决方案"],
      summary: "摘要",
    },
    intent: "高",
    activityLevel: "高",
    sourceLead: {
      platform: "MockPlatform",
      url: `https://example.test/${id}`,
      searchContext: "关键词",
      fallbackClues: ["线索"],
    },
    hardRejectReasons: [],
    matchAssessment: assessment,
  };
}

function createRun(
  id: string,
  candidates: CandidateResult[],
  overrides: Partial<SearchRun> = {},
): SearchRun {
  return {
    id,
    jobProfileId: "job-1",
    jobProfileVersionId: "job-1-v1",
    status: "Completed",
    targetResultCount: 10,
    rawSubmittedCount: candidates.length,
    candidates,
    events: [],
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

function assessment(score: number, recommendation: MatchAssessment["recommendation"]): MatchAssessment {
  return createMatchAssessment({ score, recommendation, jobProfileVersionId: "job-1-v1" });
}

test("空 SearchRun 报告漏斗全为零", () => {
  const report = summarizeSearchRunReport(createRun("run-empty", [], { rawSubmittedCount: 0, status: "Running" }));

  assert.equal(report.status, "Running");
  assert.deepEqual(report.funnel, {
    rawSubmitted: 0,
    deduplicated: 0,
    hardPassed: 0,
    hardRejected: 0,
    assessed: 0,
    recommended: 0,
    pending: 0,
    notRecommended: 0,
  });
  assert.deepEqual(report.topCandidates, []);
  assert.deepEqual(report.pendingCandidates, []);
});

test("全部硬筛淘汰时报告只有淘汰计数", () => {
  const report = summarizeSearchRunReport(
    createRun("run-rejected", [
      createCandidate("c1", "HardRejected"),
      createCandidate("c2", "HardRejected"),
    ]),
  );

  assert.equal(report.funnel.deduplicated, 2);
  assert.equal(report.funnel.hardRejected, 2);
  assert.equal(report.funnel.hardPassed, 0);
  assert.equal(report.funnel.assessed, 0);
  assert.deepEqual(report.topCandidates, []);
});

test("报告统计推荐分布并生成 Top 与待定清单", () => {
  const report = summarizeSearchRunReport(
    createRun("run-mixed", [
      createCandidate("c-rec-90", "Displayable", assessment(90, "推荐")),
      createCandidate("c-rec-85", "Displayable", assessment(85, "推荐")),
      createCandidate("c-pending-80", "Displayable", assessment(80, "待定")),
      createCandidate("c-pending-70", "Displayable", assessment(70, "待定")),
      createCandidate("c-no-60", "Displayable", assessment(60, "不推荐")),
      createCandidate("c-rejected", "HardRejected"),
    ], { rawSubmittedCount: 7 }),
  );

  assert.equal(report.funnel.rawSubmitted, 7);
  assert.equal(report.funnel.deduplicated, 6);
  assert.equal(report.funnel.hardPassed, 5);
  assert.equal(report.funnel.hardRejected, 1);
  assert.equal(report.funnel.assessed, 5);
  assert.equal(report.funnel.recommended, 2);
  assert.equal(report.funnel.pending, 2);
  assert.equal(report.funnel.notRecommended, 1);

  assert.deepEqual(
    report.topCandidates.map((candidate) => candidate.id),
    ["c-rec-90", "c-rec-85", "c-pending-80", "c-pending-70"],
  );
  assert.deepEqual(
    report.pendingCandidates.map((candidate) => candidate.id),
    ["c-pending-80", "c-pending-70"],
  );
});

test("推荐候选人超过 5 个时 Top 只取前 5", () => {
  const candidates = Array.from({ length: 7 }, (_, index) =>
    createCandidate(`c-rec-${index}`, "Displayable", assessment(99 - index, "推荐")));
  const report = summarizeSearchRunReport(createRun("run-top", candidates));

  assert.equal(report.topCandidates.length, 5);
  assert.deepEqual(
    report.topCandidates.map((candidate) => candidate.id),
    ["c-rec-0", "c-rec-1", "c-rec-2", "c-rec-3", "c-rec-4"],
  );
});

test("JobProfile 级报告跨 run 累计漏斗并按 fingerprint 去重", () => {
  const runA = createRun("run-a", [
    createCandidate("dup", "Displayable", assessment(80, "待定")),
    createCandidate("only-a", "HardRejected"),
  ], { createdAt: new Date("2026-07-01T00:00:00.000Z") });
  const runB = createRun("run-b", [
    createCandidate("dup", "Displayable", assessment(90, "推荐")),
    createCandidate("only-b", "Displayable", assessment(65, "不推荐")),
  ], { createdAt: new Date("2026-07-02T00:00:00.000Z") });

  const report = summarizeJobProfileReport([runA, runB], "job-1-v1");

  assert.equal(report.totalSearchRuns, 2);
  assert.equal(report.cumulativeFunnel.rawSubmitted, 4);
  assert.equal(report.cumulativeFunnel.assessed, 3);
  assert.equal(report.uniqueCandidateCount, 3);
  assert.deepEqual(report.currentRecommendationDistribution, {
    recommended: 1,
    pending: 0,
    notRecommended: 1,
    unassessed: 1,
  });
  assert.deepEqual(report.runs.map((entry) => entry.searchRunId), ["run-b", "run-a"]);
});

test("JobProfile 级报告叠加最新重评估结果", () => {
  const run = createRun("run-reassess", [
    createCandidate("cand", "Displayable", assessment(85, "推荐")),
  ]);
  const latest: CandidateAssessmentRecord = {
    id: "assessment-1",
    candidateId: "cand",
    candidateFingerprint: "cand",
    searchRunId: "run-reassess",
    jobProfileId: "job-1",
    jobProfileVersionId: "job-1-v2",
    assessmentType: "reassessment",
    assessment: assessment(55, "不推荐"),
    createdAt: new Date("2026-07-03T00:00:00.000Z"),
  };

  const report = summarizeJobProfileReport([run], "job-1-v2", [latest]);

  assert.deepEqual(report.currentRecommendationDistribution, {
    recommended: 0,
    pending: 0,
    notRecommended: 1,
    unassessed: 0,
  });
  assert.equal(report.cumulativeFunnel.recommended, 1);
});

test("Interrupted run 也能生成报告", () => {
  const report = summarizeSearchRunReport(
    createRun("run-interrupted", [createCandidate("c1", "Acquired")], {
      status: "Interrupted",
      rawSubmittedCount: 1,
    }),
  );

  assert.equal(report.status, "Interrupted");
  assert.equal(report.funnel.rawSubmitted, 1);
  assert.equal(report.funnel.deduplicated, 0);
});
