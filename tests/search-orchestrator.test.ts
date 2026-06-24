import assert from "node:assert/strict";
import test from "node:test";
import { SearchOrchestrator } from "../src/application/search-orchestrator.js";
import { DomainError } from "../src/domain/errors.js";
import type { AIAssessmentPort } from "../src/application/ports.js";
import { MockAIAssessment } from "../src/infrastructure/mock/mock-ai-assessment.js";
import { MockSourceAdapter } from "../src/infrastructure/mock/mock-source-adapter.js";
import {
  InMemoryAIAssessmentAuditSink,
  InMemorySearchRunRepository,
} from "../src/infrastructure/memory/in-memory-repositories.js";
import { createCandidateDrafts, createConfirmedJobProfile, createDraftJobProfile } from "./fixtures.js";

test("未确认岗位画像不能启动寻访", async () => {
  const orchestrator = new SearchOrchestrator({
    sourceAdapter: new MockSourceAdapter({ candidates: [] }),
    aiAssessment: new MockAIAssessment(),
    idGenerator: () => "run-draft",
  });

  await assert.rejects(() => orchestrator.runOneTimeSearch(createDraftJobProfile(), undefined), DomainError);
});

test("一次性寻访按去重、硬筛、软性匹配、匹配分排序完成闭环", async () => {
  const orchestrator = new SearchOrchestrator({
    sourceAdapter: new MockSourceAdapter({ candidates: createCandidateDrafts() }),
    aiAssessment: new MockAIAssessment(),
    idGenerator: () => "run-1",
  });

  const searchRun = await orchestrator.runOneTimeSearch(createConfirmedJobProfile(), undefined);

  assert.equal(searchRun.status, "Completed");
  assert.equal(searchRun.targetResultCount, 200);
  assert.deepEqual(
    searchRun.events.map((event) => event.type),
    [
      "SearchStarted",
      "CandidateResultsAcquired",
      "CandidateResultsDeduplicated",
      "HardFilterCompleted",
      "SoftMatchAssessed",
      "SearchCompleted",
    ],
  );

  assert.equal(searchRun.candidates.length, 3);
  assert.equal(new Set(searchRun.candidates.map((candidate) => candidate.fingerprint)).size, 3);

  const rejected = searchRun.candidates.find((candidate) => candidate.fingerprint === "candidate-c");
  assert.equal(rejected?.status, "HardRejected");
  assert.equal(rejected?.matchAssessment, undefined);
  assert.ok(rejected?.hardRejectReasons.length);

  const displayable = searchRun.candidates.filter((candidate) => candidate.status === "Displayable");
  assert.equal(displayable.length, 2);
  assert.ok(displayable.every((candidate) => candidate.matchAssessment));
  assert.ok(displayable.every((candidate) => candidate.matchAssessment?.matchedPoints.length));
  assert.ok(displayable.every((candidate) => candidate.matchAssessment?.recommendation));
  assert.ok(displayable.every((candidate) => candidate.sourceLead.platform === "MockPlatform"));

  const scores = displayable.map((candidate) => candidate.matchAssessment?.score ?? 0);
  assert.deepEqual(scores, [...scores].sort((left, right) => right - left));

  const first = displayable[0];
  assert.equal(first.fingerprint, "candidate-a");
  assert.equal(first.intent, "高");
  assert.equal(first.activityLevel, "低");
});

test("风控触发时中止寻访且不继续补齐候选人结果", async () => {
  const orchestrator = new SearchOrchestrator({
    sourceAdapter: new MockSourceAdapter({
      candidates: createCandidateDrafts(),
      riskSignal: {
        type: "captcha",
        reason: "来源平台出现验证码，按风控优先中止。",
      },
    }),
    aiAssessment: new MockAIAssessment(),
    idGenerator: () => "run-risk",
  });

  const searchRun = await orchestrator.runOneTimeSearch(createConfirmedJobProfile(), undefined);

  assert.equal(searchRun.status, "Interrupted");
  assert.equal(searchRun.candidates.length, 0);
  assert.equal(searchRun.interruptedReason, "来源平台出现验证码，按风控优先中止。");
  assert.deepEqual(
    searchRun.events.map((event) => event.type),
    ["SearchStarted", "RiskControlTriggered", "SearchInterrupted"],
  );
});

test("AI 评估失败时保存 Failed 快照并向上抛错", async () => {
  const searchRuns = new InMemorySearchRunRepository();
  const aiAssessmentAudit = new InMemoryAIAssessmentAuditSink();
  const orchestrator = new SearchOrchestrator({
    sourceAdapter: new MockSourceAdapter({ candidates: createCandidateDrafts() }),
    aiAssessment: new FailingAIAssessment(),
    aiAssessmentAudit,
    searchRuns,
    idGenerator: () => "run-ai-failed",
    auditIdGenerator: () => "failed-audit-1",
  });

  await assert.rejects(
    () => orchestrator.runOneTimeSearch(createConfirmedJobProfile(), undefined),
    /AI service unavailable/,
  );

  const saved = await searchRuns.findById("run-ai-failed");
  const [audit] = await aiAssessmentAudit.findBySearchRunId("run-ai-failed");

  assert.equal(saved?.status, "Failed");
  assert.equal(saved?.failureReason, "Error: AI service unavailable");
  assert.equal(audit?.id, "failed-audit-1");
  assert.equal(audit?.status, "failure");
  assert.equal(audit?.errorType, "Error");
  assert.equal(audit?.errorMessage, "AI service unavailable");
  assert.equal(audit?.promptVersion, "match-assessment-v1");
  assert.deepEqual(
    saved?.events.map((event) => event.type),
    [
      "SearchStarted",
      "CandidateResultsAcquired",
      "CandidateResultsDeduplicated",
      "HardFilterCompleted",
      "SearchFailed",
    ],
  );
});

class FailingAIAssessment implements AIAssessmentPort {
  async assessCandidates(): Promise<never> {
    throw new Error("AI service unavailable");
  }
}
