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
import { createCandidateDrafts, createConfirmedJobProfile } from "./fixtures.js";
import type { CandidateResult, JobProfile, MatchAssessment } from "../src/domain/types.js";
import type { AIAssessmentPort } from "../src/application/ports.js";

test("AI 匹配评估会规范化分数和解释文本", () => {
  const assessment = normalizeMatchAssessment({
    score: 120.7,
    fitPoints: [" 具备复杂项目推动经验 ", ""],
    riskPoints: [" 需要人工确认求职意向 "],
    assessedAt: new Date("2026-06-04T00:00:00.000Z"),
  });

  assert.equal(assessment.score, 100);
  assert.deepEqual(assessment.fitPoints, ["具备复杂项目推动经验"]);
  assert.deepEqual(assessment.riskPoints, ["需要人工确认求职意向"]);
});

test("AI 匹配评估拒绝空合适点", () => {
  assert.throws(
    () =>
      normalizeMatchAssessment({
        score: 80,
        fitPoints: [" "],
        riskPoints: [],
        assessedAt: new Date(),
      }),
    DomainError,
  );
});

test("AI 匹配评估拒绝最终决策措辞", () => {
  assert.throws(
    () =>
      normalizeMatchAssessment({
        score: 95,
        fitPoints: ["确定合适，可以直接推荐"],
        riskPoints: [],
        assessedAt: new Date(),
      }),
    DomainError,
  );
});

test("AI 匹配评估必须覆盖请求范围内所有候选人且不能越界", () => {
  const jobProfile = createConfirmedJobProfile();
  let searchRun = startSearchRun(createSearchRun(jobProfile, "ai-contract-run"));
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
            {
              score: 80,
              fitPoints: ["履历与岗位相关"],
              riskPoints: [],
              assessedAt: new Date(),
            },
          ],
        ]),
      ),
    DomainError,
  );
});

test("编排器拒绝越过 AI 边界的评估输出", async () => {
  class BadAIAssessment implements AIAssessmentPort {
    async assessCandidates(
      _jobProfile: JobProfile,
      candidates: CandidateResult[],
    ): Promise<Map<string, MatchAssessment>> {
      return new Map(
        candidates.map((candidate) => [
          candidate.id,
          {
            score: 90,
            fitPoints: ["最终推荐该候选人"],
            riskPoints: [],
            assessedAt: new Date(),
          },
        ]),
      );
    }
  }

  const orchestrator = new SearchOrchestrator({
    sourceAdapter: new MockSourceAdapter({ candidates: createCandidateDrafts() }),
    aiAssessment: new BadAIAssessment(),
    idGenerator: () => "bad-ai-run",
  });

  await assert.rejects(() => orchestrator.runOneTimeSearch(createConfirmedJobProfile()), DomainError);
});
