import assert from "node:assert/strict";
import test from "node:test";
import { SearchOrchestrator } from "../src/application/search-orchestrator.js";
import {
  InMemoryAIAssessmentAuditSink,
  InMemoryJobProfileRepository,
  InMemoryJobProfileVersionRepository,
  InMemorySearchRunRepository,
} from "../src/infrastructure/memory/in-memory-repositories.js";
import { MockAIAssessment } from "../src/infrastructure/mock/mock-ai-assessment.js";
import { MockSourceAdapter } from "../src/infrastructure/mock/mock-source-adapter.js";
import { createCandidateDrafts, createConfirmedJobProfile } from "./fixtures.js";

test("SearchRun 编排会在关键状态后保存可恢复快照", async () => {
  const jobProfiles = new InMemoryJobProfileRepository();
  const jobProfileVersions = new InMemoryJobProfileVersionRepository();
  const searchRuns = new InMemorySearchRunRepository();
  const aiAssessmentAudit = new InMemoryAIAssessmentAuditSink();
  const orchestrator = new SearchOrchestrator({
    sourceAdapter: new MockSourceAdapter({ candidates: createCandidateDrafts() }),
    aiAssessment: new MockAIAssessment(),
    aiAssessmentAudit,
    jobProfiles,
    jobProfileVersions,
    searchRuns,
    idGenerator: () => "persisted-run-1",
    auditIdGenerator: () => "audit-1",
  });

  await orchestrator.runOneTimeSearch(createConfirmedJobProfile());

  const savedJobProfile = await jobProfiles.findById("job-1");
  assert.equal(savedJobProfile?.status, "Confirmed");
  assert.equal(savedJobProfile?.currentVersionId, "job-1-v1");

  const savedVersion = await jobProfileVersions.findById("job-1-v1");
  assert.equal(savedVersion?.status, "Confirmed");
  assert.equal(savedVersion?.version, 1);

  const savedSearchRun = await searchRuns.findById("persisted-run-1");
  assert.equal(savedSearchRun?.status, "Completed");
  assert.equal(savedSearchRun?.jobProfileVersionId, "job-1-v1");

  const history = searchRuns.findHistoryById("persisted-run-1");
  assert.deepEqual(
    history.map((snapshot) => snapshot.status),
    ["Running", "Acquired", "Deduplicated", "HardFiltered", "Assessed", "Completed"],
  );
  assert.deepEqual(
    history.at(-1)?.events.map((event) => event.type),
    [
      "SearchStarted",
      "CandidateResultsAcquired",
      "CandidateResultsDeduplicated",
      "HardFilterCompleted",
      "SoftMatchAssessed",
      "SearchCompleted",
    ],
  );

  const [audit] = await aiAssessmentAudit.findBySearchRunId("persisted-run-1");
  assert.equal(audit?.id, "audit-1");
  assert.equal(audit?.provider, "mock");
  assert.equal(audit?.model, "mock-ai-assessment-v1");
  assert.equal(audit?.candidateIds.length, 2);
  assert.equal(audit?.outputSnapshot.length, 2);
});

test("风控中止也会保存 Interrupted 快照和风险事件", async () => {
  const searchRuns = new InMemorySearchRunRepository();
  const aiAssessmentAudit = new InMemoryAIAssessmentAuditSink();
  const orchestrator = new SearchOrchestrator({
    sourceAdapter: new MockSourceAdapter({
      candidates: createCandidateDrafts(),
      riskSignal: {
        type: "sourceUnavailable",
        reason: "来源不可用。",
      },
    }),
    aiAssessment: new MockAIAssessment(),
    aiAssessmentAudit,
    searchRuns,
    idGenerator: () => "persisted-risk-run",
  });

  await orchestrator.runOneTimeSearch(createConfirmedJobProfile());

  const savedSearchRun = await searchRuns.findById("persisted-risk-run");
  assert.equal(savedSearchRun?.status, "Interrupted");
  assert.deepEqual(
    savedSearchRun?.events.map((event) => event.type),
    ["SearchStarted", "RiskControlTriggered", "SearchInterrupted"],
  );
  assert.equal((await aiAssessmentAudit.findBySearchRunId("persisted-risk-run")).length, 0);
});
