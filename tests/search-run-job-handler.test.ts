import assert from "node:assert/strict";
import test from "node:test";
import { SearchRunJobHandler } from "../src/application/search-run-job-handler.js";
import { InMemorySearchRunQueue } from "../src/infrastructure/memory/in-memory-search-run-queue.js";
import { InMemorySearchRunRepository } from "../src/infrastructure/memory/in-memory-repositories.js";
import { MockAIAssessment } from "../src/infrastructure/mock/mock-ai-assessment.js";
import { createCandidateDrafts, createConfirmedJobProfile } from "./fixtures.js";

test("内存队列保存一次性寻访任务载荷，JobHandler 可执行同一业务闭环", async () => {
  const queue = new InMemorySearchRunQueue();
  const job = {
    searchRunId: "handler-run-1",
    jobProfile: createConfirmedJobProfile(),
    targetResultCount: 10,
    source: {
      type: "mock" as const,
      candidates: createCandidateDrafts(),
    },
  };
  const { jobId } = await queue.enqueueOneTimeSearch(job);
  const queuedJob = queue.findJobById(jobId);

  assert.equal(queuedJob?.jobProfile.id, "job-1");
  assert.equal(queuedJob?.source.type, "mock");
  assert.equal(queuedJob?.source.type === "mock" ? queuedJob.source.candidates.length : 0, 4);

  const searchRuns = new InMemorySearchRunRepository();
  const handler = new SearchRunJobHandler({
    aiAssessment: new MockAIAssessment(),
    searchRuns,
  });

  const result = await handler.handleOneTimeSearch(queuedJob!);

  assert.equal(result.status, "Completed");
  assert.equal(result.targetResultCount, 10);
  const saved = await searchRuns.findById("handler-run-1");
  assert.equal(saved?.status, "Completed");
  assert.equal(saved?.targetResultCount, 10);
});
