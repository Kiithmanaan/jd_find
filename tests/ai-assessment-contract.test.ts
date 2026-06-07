import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAIAssessments, normalizeMatchAssessment } from "../src/domain/ai-assessment-contract.js";
import { DomainError } from "../src/domain/errors.js";
import {
  acquireCandidateResults,
  applyHardFilter,
  createSearchRun,
  deduplicateWithinSearchRun,
  startSearchRun,
} from "../src/domain/search-run.js";
import { SearchOrchestrator } from "../src/application/search-orchestrator.js";
import { MockSourceAdapter } from "../src/infrastructure/mock/mock-source-adapter.js";
import { createCandidateDrafts, createConfirmedJobProfile, createMatchAssessment } from "./fixtures.js";
import type { CandidateResult, JobProfile, MatchAssessment } from "../src/domain/types.js";
import type { AIAssessmentPort } from "../src/application/ports.js";

test("AI 匹配评估会规范化分数和解释文本", () => {
  const assessment = normalizeMatchAssessment({
    ...createMatchAssessment({}),
    score: 120.7,
    matchedPoints: [" 具备复杂项目推动经验 ", ""],
    unmatchedPoints: [" 需要确认独立方案设计经验 "],
    riskPoints: [" 需要人工确认求职意向 "],
  });

  assert.equal(assessment.score, 100);
  assert.deepEqual(assessment.matchedPoints, ["具备复杂项目推动经验"]);
  assert.deepEqual(assessment.unmatchedPoints, ["需要确认独立方案设计经验"]);
  assert.deepEqual(assessment.riskPoints, ["需要人工确认求职意向"]);
});

test("AI 匹配评估拒绝空合适点和缺失推荐说明", () => {
  assert.throws(
    () =>
      normalizeMatchAssessment({
        ...createMatchAssessment({}),
        matchedPoints: [" "],
      }),
    DomainError,
  );

  assert.throws(
    () =>
      normalizeMatchAssessment({
        ...createMatchAssessment({}),
        recommendationReason: " ",
      }),
    DomainError,
  );
});

test("AI 匹配评估允许推荐结论并限制三类要点数量", () => {
  const assessment = normalizeMatchAssessment({
    ...createMatchAssessment({}),
    recommendation: "推荐",
    recommendationReason: "确定合适，可以直接推荐。",
  });

  assert.equal(assessment.recommendation, "推荐");
  assert.equal(assessment.recommendationReason, "确定合适，可以直接推荐。");

  assert.throws(
    () =>
      normalizeMatchAssessment({
        ...createMatchAssessment({}),
        riskPoints: ["风险1", "风险2", "风险3", "风险4"],
      }),
    DomainError,
  );
});

test("AI 匹配评估必须覆盖请求范围内所有候选人且不能越界", () => {
  const jobProfile = createConfirmedJobProfile();
  let searchRun = startSearchRun(
    createSearchRun(jobProfile, "ai-contract-run", {
      targetResultCount: undefined,
      ownerId: undefined,
    }),
  );
  searchRun = acquireCandidateResults(searchRun, jobProfile, createCandidateDrafts().slice(0, 2));
  searchRun = deduplicateWithinSearchRun(searchRun);
  searchRun = applyHardFilter(searchRun, jobProfile);
  const hardPassed = searchRun.candidates.filter((candidate) => candidate.status === "HardPassed");

  assert.throws(
    () => normalizeAIAssessments(hardPassed, new Map()),
    DomainError,
  );

  assert.throws(
    () =>
      normalizeAIAssessments(
        hardPassed,
        new Map([
          [
            "outside-candidate",
            createMatchAssessment({ score: 80 }),
          ],
        ]),
      ),
    DomainError,
  );
});

test("编排器接受包含推荐结论的评估输出", async () => {
  class RecommendingAIAssessment implements AIAssessmentPort {
    async assessCandidates(
      _jobProfile: JobProfile,
      candidates: CandidateResult[],
    ): Promise<Map<string, MatchAssessment>> {
      return new Map(
        candidates.map((candidate) => [
          candidate.id,
          createMatchAssessment({
            score: 90,
            recommendation: "推荐",
            recommendationReason: "最终推荐该候选人",
          }),
        ]),
      );
    }
  }

  const orchestrator = new SearchOrchestrator({
    sourceAdapter: new MockSourceAdapter({ candidates: createCandidateDrafts() }),
    aiAssessment: new RecommendingAIAssessment(),
    idGenerator: () => "recommending-ai-run",
  });

  const searchRun = await orchestrator.runOneTimeSearch(createConfirmedJobProfile());
  const assessed = searchRun.candidates.filter((candidate) => candidate.matchAssessment);

  assert.equal(searchRun.status, "Completed");
  assert.equal(assessed.every((candidate) => candidate.matchAssessment?.recommendation === "推荐"), true);
});
