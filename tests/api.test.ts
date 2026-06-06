import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createApp } from "../src/api/app.js";
import { SearchRunJobHandler } from "../src/application/search-run-job-handler.js";
import { InMemorySearchRunQueue } from "../src/infrastructure/memory/in-memory-search-run-queue.js";
import {
  InMemoryAIAssessmentAuditSink,
  InMemorySearchRunRepository,
} from "../src/infrastructure/memory/in-memory-repositories.js";
import { MockAIAssessment } from "../src/infrastructure/mock/mock-ai-assessment.js";
import { createCandidateDrafts, createConfirmedJobProfile, createDraftJobProfile } from "./fixtures.js";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url)).includes("/dist/")
  ? join(fileURLToPath(new URL("..", import.meta.url)).split("/dist/")[0]!)
  : fileURLToPath(new URL("..", import.meta.url));
const csvFixturePath = join(workspaceRoot, "tests", "fixtures", "candidates.csv");

test("健康检查返回 ok", async () => {
  const app = createApp();
  const response = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("API 返回硬性条件配置", async () => {
  const app = createApp();
  const response = await app.inject({
    method: "GET",
    url: "/api/hard-condition-config",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  const education = body.dimensions.find((dimension: { key: string }) => dimension.key === "education");
  assert.ok(education);
  assert.equal(
    education.options.some((option: { value: string; rank?: number }) => option.value === "本科" && option.rank === 2),
    true,
  );
});

test("API 启动一次性寻访时只入队并返回可查询的 searchRunId", async () => {
  const searchRuns = new InMemorySearchRunRepository();
  const searchRunQueue = new InMemorySearchRunQueue();
  const app = createApp({ idGenerator: () => "api-run-1", searchRuns, searchRunQueue });
  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile: createConfirmedJobProfile(),
      candidates: createCandidateDrafts(),
    },
  });

  assert.equal(response.statusCode, 202);

  const body = response.json();
  assert.equal(body.status, "Queued");
  assert.equal(body.searchRunId, "api-run-1");
  assert.equal(body.statusUrl, "/api/search-runs/api-run-1");
  const queuedJob = searchRunQueue.findJobById(body.jobId);
  assert.equal(queuedJob?.source.type, "mock");

  const saved = await searchRuns.findById("api-run-1");
  assert.equal(saved, undefined);
});

test("API 可在 worker 完成后查询 SearchRun 结果", async () => {
  const searchRuns = new InMemorySearchRunRepository();
  const searchRunQueue = new InMemorySearchRunQueue();
  const app = createApp({ idGenerator: () => "api-run-completed", searchRuns, searchRunQueue });
  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile: createConfirmedJobProfile(),
      candidates: createCandidateDrafts(),
    },
  });

  assert.equal(response.statusCode, 202);

  const queued = response.json();
  const queuedJob = searchRunQueue.findJobById(queued.jobId);
  assert.ok(queuedJob);

  const handler = new SearchRunJobHandler({
    aiAssessment: new MockAIAssessment(),
    searchRuns,
  });
  await handler.handleOneTimeSearch(queuedJob);

  const queryResponse = await app.inject({
    method: "GET",
    url: "/api/search-runs/api-run-completed",
  });
  assert.equal(queryResponse.statusCode, 200);

  const body = queryResponse.json();
  assert.equal(body.status, "Completed");
  assert.equal(body.targetResultCount, 200);
  assert.equal(body.candidates.length, 3);
});

test("API 可查询一次寻访对应的 AI 评估审计快照", async () => {
  const searchRuns = new InMemorySearchRunRepository();
  const aiAssessmentAudits = new InMemoryAIAssessmentAuditSink();
  const searchRunQueue = new InMemorySearchRunQueue();
  const app = createApp({
    idGenerator: () => "api-run-audit",
    searchRuns,
    aiAssessmentAudits,
    searchRunQueue,
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile: createConfirmedJobProfile(),
      candidates: createCandidateDrafts(),
    },
  });
  const queued = response.json();
  const queuedJob = searchRunQueue.findJobById(queued.jobId);
  assert.ok(queuedJob);

  const handler = new SearchRunJobHandler({
    aiAssessment: new MockAIAssessment(),
    aiAssessmentAudit: aiAssessmentAudits,
    searchRuns,
  });
  await handler.handleOneTimeSearch(queuedJob);

  const queryResponse = await app.inject({
    method: "GET",
    url: "/api/search-runs/api-run-audit/ai-assessment-audits",
  });

  assert.equal(queryResponse.statusCode, 200);
  const body = queryResponse.json();
  assert.equal(body.searchRunId, "api-run-audit");
  assert.equal(body.records.length, 1);
  assert.equal(body.records[0].provider, "mock");
  assert.equal(body.records[0].candidateIds.length, 2);
});

test("API 查询不存在 SearchRun 的 AI 评估审计返回 404", async () => {
  const app = createApp();
  const response = await app.inject({
    method: "GET",
    url: "/api/search-runs/missing-run/ai-assessment-audits",
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "SearchRunNotFound");
});

test("API 支持 CSV 来源入队并由 worker 从文件完成寻访", async () => {
  const searchRuns = new InMemorySearchRunRepository();
  const searchRunQueue = new InMemorySearchRunQueue();
  const app = createApp({ idGenerator: () => "api-csv-run", searchRuns, searchRunQueue });
  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "csv",
      csvFilePath: csvFixturePath,
    },
  });

  assert.equal(response.statusCode, 202);

  const queued = response.json();
  const queuedJob = searchRunQueue.findJobById(queued.jobId);
  assert.equal(queuedJob?.source.type, "csv");

  const handler = new SearchRunJobHandler({
    aiAssessment: new MockAIAssessment(),
    searchRuns,
  });
  await handler.handleOneTimeSearch(queuedJob!);

  const queryResponse = await app.inject({
    method: "GET",
    url: "/api/search-runs/api-csv-run",
  });

  assert.equal(queryResponse.statusCode, 200);
  const body = queryResponse.json();
  assert.equal(body.status, "Completed");
  assert.equal(body.candidates.length, 2);
});

test("API 查询不存在的 SearchRun 返回 404", async () => {
  const app = createApp();
  const response = await app.inject({
    method: "GET",
    url: "/api/search-runs/missing-run",
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "SearchRunNotFound");
});

test("API 拒绝未确认岗位画像启动寻访", async () => {
  const app = createApp({ idGenerator: () => "api-run-draft" });
  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile: createDraftJobProfile(),
      candidates: createCandidateDrafts(),
    },
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.json().error, "DomainError");
});

test("API 拒绝缺失 jobProfile 的非法请求且不入队", async () => {
  const searchRunQueue = new InMemorySearchRunQueue();
  const app = createApp({ idGenerator: () => "api-invalid-run", searchRunQueue });
  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      candidates: createCandidateDrafts(),
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "ValidationError");
  assert.equal(searchRunQueue.findJobById("memory-search-job-1"), undefined);
});

test("API 拒绝搜索关键词为空的岗位画像", async () => {
  const jobProfile = {
    ...createConfirmedJobProfile(),
    searchCondition: {
      ...createConfirmedJobProfile().searchCondition,
      keywords: [],
    },
  };
  const app = createApp({ idGenerator: () => "api-empty-keywords" });
  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile,
      candidates: createCandidateDrafts(),
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "ValidationError");
});

test("API 拒绝非法 SourceLead URL", async () => {
  const candidates = createCandidateDrafts();
  candidates[0] = {
    ...candidates[0]!,
    sourceLead: {
      ...candidates[0]!.sourceLead,
      url: "not-a-url",
    },
  };
  const app = createApp({ idGenerator: () => "api-invalid-url" });
  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile: createConfirmedJobProfile(),
      candidates,
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "ValidationError");
});
