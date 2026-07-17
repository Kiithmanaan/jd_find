import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createApp } from "../src/api/app.js";
import { hashPassword, signAuthToken } from "../src/application/auth.js";
import { SearchRunJobHandler } from "../src/application/search-run-job-handler.js";
import type { CandidateDraft, User } from "../src/domain/types.js";
import { InMemorySearchRunQueue } from "../src/infrastructure/memory/in-memory-search-run-queue.js";
import {
  InMemoryAIAssessmentAuditSink,
  InMemoryJobProfileRepository,
  InMemoryJobProfileVersionRepository,
  InMemorySearchRunRepository,
  InMemoryUserRepository,
} from "../src/infrastructure/memory/in-memory-repositories.js";
import { MockAIAssessment } from "../src/infrastructure/mock/mock-ai-assessment.js";
import { createSourceAdapter } from "../src/infrastructure/source/create-source-adapter.js";
import { createCandidateDrafts, createConfirmedJobProfile, createDraftJobProfile } from "./fixtures.js";

const workspaceRoot = fileURLToPath(new URL(import.meta.url.includes("/dist/") ? "../.." : "..", import.meta.url));
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
  assert.equal(queuedJob?.targetResultCount, 200);

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
      targetResultCount: 10,
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
    sourceAdapterFactory: createSourceAdapter,
  });
  await handler.handleOneTimeSearch(queuedJob);

  const queryResponse = await app.inject({
    method: "GET",
    url: "/api/search-runs/api-run-completed",
  });
  assert.equal(queryResponse.statusCode, 200);

  const body = queryResponse.json();
  assert.equal(body.status, "Completed");
  assert.equal(body.targetResultCount, 10);
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
    sourceAdapterFactory: createSourceAdapter,
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

test("API 返回 SearchRun 级与 JobProfile 级寻访报告", async () => {
  const searchRuns = new InMemorySearchRunRepository();
  const searchRunQueue = new InMemorySearchRunQueue();
  const app = createApp({ idGenerator: () => "api-run-report", searchRuns, searchRunQueue });
  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile: createConfirmedJobProfile(),
      targetResultCount: 10,
      candidates: createCandidateDrafts(),
    },
  });
  const queuedJob = searchRunQueue.findJobById(response.json().jobId);
  assert.ok(queuedJob);

  const handler = new SearchRunJobHandler({
    aiAssessment: new MockAIAssessment(),
    searchRuns,
    sourceAdapterFactory: createSourceAdapter,
  });
  await handler.handleOneTimeSearch(queuedJob);

  const runReport = await app.inject({
    method: "GET",
    url: "/api/search-runs/api-run-report/report",
  });
  assert.equal(runReport.statusCode, 200);
  const runBody = runReport.json();
  assert.equal(runBody.searchRunId, "api-run-report");
  assert.equal(runBody.status, "Completed");
  assert.equal(runBody.funnel.rawSubmitted, 4);
  assert.equal(runBody.funnel.deduplicated, 3);
  assert.equal(runBody.funnel.hardPassed, 2);
  assert.equal(runBody.funnel.hardRejected, 1);
  assert.equal(runBody.funnel.assessed, 2);
  assert.equal(runBody.funnel.recommended, 1);
  assert.equal(runBody.funnel.pending, 1);
  assert.equal(runBody.topCandidates.length, 2);
  assert.equal(runBody.topCandidates[0].matchAssessment.recommendation, "推荐");
  assert.equal(runBody.pendingCandidates.length, 1);
  assert.equal(runBody.pendingCandidates[0].matchAssessment.recommendation, "待定");

  const profileReport = await app.inject({
    method: "GET",
    url: "/api/job-profiles/job-1/report",
  });
  assert.equal(profileReport.statusCode, 200);
  const profileBody = profileReport.json();
  assert.equal(profileBody.jobProfileId, "job-1");
  assert.equal(profileBody.currentVersionId, "job-1-v1");
  assert.equal(profileBody.totalSearchRuns, 1);
  assert.equal(profileBody.cumulativeFunnel.rawSubmitted, 4);
  assert.equal(profileBody.uniqueCandidateCount, 3);
  assert.deepEqual(profileBody.currentRecommendationDistribution, {
    recommended: 1,
    pending: 1,
    notRecommended: 0,
    unassessed: 1,
  });
  assert.equal(profileBody.runs.length, 1);
  assert.equal(profileBody.runs[0].searchRunId, "api-run-report");
});

test("API 支持澄清访谈闭环：发起、逐题回答、完成产出草稿", async () => {
  const app = createApp({ idGenerator: () => "api-interview-run" });
  const createRun = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });
  assert.equal(createRun.statusCode, 202);

  const started = await app.inject({
    method: "POST",
    url: "/api/job-profiles/job-1/clarification-interviews",
  });
  assert.equal(started.statusCode, 201);
  const session = started.json();
  assert.equal(session.status, "InProgress");
  assert.equal(session.currentQuestion.topicKey, "role-purpose");
  assert.ok(session.currentQuestion.suggestedAnswer);

  let latest = session;
  for (let index = 0; index < 7; index += 1) {
    const answered = await app.inject({
      method: "POST",
      url: `/api/clarification-interviews/${session.id}/answers`,
      payload: { answer: `第${index}轮回答：解决方案；客户成功` },
    });
    assert.equal(answered.statusCode, 200);
    latest = answered.json();
  }

  assert.equal(latest.status, "Completed");
  assert.equal(latest.turns.length, 7);
  assert.equal(latest.currentQuestion, undefined);
  assert.ok(latest.draftOutput);
  assert.ok(latest.draftOutput.searchKeywords.length >= 1);

  const fetched = await app.inject({
    method: "GET",
    url: `/api/clarification-interviews/${session.id}`,
  });
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.json().status, "Completed");

  const listed = await app.inject({
    method: "GET",
    url: "/api/job-profiles/job-1/clarification-interviews",
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().sessions.length, 1);

  const extraAnswer = await app.inject({
    method: "POST",
    url: `/api/clarification-interviews/${session.id}/answers`,
    payload: { answer: "已完成后的多余回答" },
  });
  assert.equal(extraAnswer.statusCode, 422);
});

test("API 澄清访谈对不存在资源返回 404", async () => {
  const app = createApp();

  const started = await app.inject({
    method: "POST",
    url: "/api/job-profiles/missing-profile/clarification-interviews",
  });
  assert.equal(started.statusCode, 404);

  const answered = await app.inject({
    method: "POST",
    url: "/api/clarification-interviews/missing-session/answers",
    payload: { answer: "回答" },
  });
  assert.equal(answered.statusCode, 404);
});

test("API 支持搜索词迭代分析：生成建议、查询历史、未完成 run 拒绝", async () => {
  const searchRuns = new InMemorySearchRunRepository();
  const searchRunQueue = new InMemorySearchRunQueue();
  const app = createApp({ idGenerator: () => "api-run-refine", searchRuns, searchRunQueue });
  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile: createConfirmedJobProfile(),
      targetResultCount: 10,
      candidates: createCandidateDrafts(),
    },
  });
  const queuedJob = searchRunQueue.findJobById(response.json().jobId);
  assert.ok(queuedJob);

  const early = await app.inject({
    method: "POST",
    url: "/api/search-runs/api-run-refine/refinement-suggestions",
  });
  assert.equal(early.statusCode, 404);

  const handler = new SearchRunJobHandler({
    aiAssessment: new MockAIAssessment(),
    searchRuns,
    sourceAdapterFactory: createSourceAdapter,
  });
  await handler.handleOneTimeSearch(queuedJob);

  const created = await app.inject({
    method: "POST",
    url: "/api/search-runs/api-run-refine/refinement-suggestions",
  });
  assert.equal(created.statusCode, 201);
  const suggestion = created.json().suggestion;
  assert.equal(suggestion.searchRunId, "api-run-refine");
  assert.ok(suggestion.reasoning);
  assert.ok(suggestion.suggestedSearchCondition.keywords.length >= 1);
  assert.equal(suggestion.promptVersion, "search-refinement-v1");

  const listed = await app.inject({
    method: "GET",
    url: "/api/search-runs/api-run-refine/refinement-suggestions",
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().suggestions.length, 1);

  const audits = await app.inject({
    method: "GET",
    url: "/api/search-runs/api-run-refine/ai-assessment-audits",
  });
  const refinementAudit = audits.json().records.find(
    (record: { agentType: string }) => record.agentType === "search-refinement",
  );
  assert.ok(refinementAudit);
});

test("API 搜索词迭代分析对 Running 状态返回 422", async () => {
  const searchRuns = new InMemorySearchRunRepository();
  const app = createApp({ idGenerator: () => "api-run-refine-running", searchRuns });
  const created = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });
  assert.equal(created.statusCode, 202);

  const refine = await app.inject({
    method: "POST",
    url: `/api/search-runs/${created.json().searchRunId}/refinement-suggestions`,
  });
  assert.equal(refine.statusCode, 422);
  assert.equal(refine.json().error, "RefinementNotReady");
});

test("API 查询不存在资源的寻访报告返回 404", async () => {
  const app = createApp();

  const runReport = await app.inject({ method: "GET", url: "/api/search-runs/missing-run/report" });
  assert.equal(runReport.statusCode, 404);
  assert.equal(runReport.json().error, "SearchRunNotFound");

  const profileReport = await app.inject({ method: "GET", url: "/api/job-profiles/missing-profile/report" });
  assert.equal(profileReport.statusCode, 404);
  assert.equal(profileReport.json().error, "JobProfileNotFound");
});

test("API 支持 JobProfile 版本列表、草稿创建和确认", async () => {
  const jobProfiles = new InMemoryJobProfileRepository();
  const jobProfileVersions = new InMemoryJobProfileVersionRepository();
  const app = createApp({
    idGenerator: () => "version-run",
    jobProfiles,
    jobProfileVersions,
  });
  const jobProfile = createConfirmedJobProfile();

  const createRun = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile,
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });
  assert.equal(createRun.statusCode, 202);

  const draft = await app.inject({
    method: "POST",
    url: "/api/job-profiles/job-1/versions/draft",
    payload: {
      title: "高级解决方案顾问 V2",
      jdText: jobProfile.jdText,
      searchCondition: jobProfile.searchCondition,
      hardRequirements: jobProfile.hardRequirements,
      softRequirements: jobProfile.softRequirements,
      negativeSignals: ["频繁跳槽"],
    },
  });
  assert.equal(draft.statusCode, 201);
  assert.equal(draft.json().id, "job-1-v2");
  assert.equal(draft.json().status, "Draft");
  assert.deepEqual(draft.json().negativeSignals, ["频繁跳槽"]);

  const confirm = await app.inject({
    method: "POST",
    url: "/api/job-profiles/job-1/versions/job-1-v2/confirm",
  });
  assert.equal(confirm.statusCode, 200);
  assert.equal(confirm.json().jobProfile.currentVersionId, "job-1-v2");
  assert.equal(confirm.json().version.status, "Confirmed");
  assert.deepEqual(confirm.json().jobProfile.negativeSignals, ["频繁跳槽"]);

  const versions = await app.inject({
    method: "GET",
    url: "/api/job-profiles/job-1/versions",
  });
  assert.equal(versions.statusCode, 200);
  assert.deepEqual(
    versions.json().versions.map((version: { id: string }) => version.id),
    ["job-1-v1", "job-1-v2"],
  );
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
    sourceAdapterFactory: createSourceAdapter,
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

test("认证开启后 Web 登录可创建插件 SearchRun", async () => {
  const users = new InMemoryUserRepository([createUser("user-1", "hunter@example.test", "secret")]);
  const searchRuns = new InMemorySearchRunRepository();
  const app = createApp({
    idGenerator: () => "plugin-run-1",
    users,
    searchRuns,
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });

  const unauthorized = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });
  assert.equal(unauthorized.statusCode, 401);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "hunter@example.test",
      password: "secret",
    },
  });
  assert.equal(login.statusCode, 200);

  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: {
      authorization: `Bearer ${login.json().token}`,
    },
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.json().searchRunId, "plugin-run-1");

  const saved = await searchRuns.findById("plugin-run-1");
  assert.equal(saved?.status, "Running");
  assert.equal(saved?.ownerId, "user-1");
  assert.equal(saved?.targetResultCount, 10);
  assert.equal(saved?.rawSubmittedCount, 0);
});

test("认证开启后异步 SearchRun 队列任务保留创建用户", async () => {
  const users = new InMemoryUserRepository([createUser("user-1", "hunter@example.test", "secret")]);
  const searchRunQueue = new InMemorySearchRunQueue();
  const app = createApp({
    idGenerator: () => "owned-queued-run",
    users,
    searchRunQueue,
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "hunter@example.test",
      password: "secret",
    },
  });
  assert.equal(login.statusCode, 200);

  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: {
      authorization: `Bearer ${login.json().token}`,
    },
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "mock",
      candidates: createCandidateDrafts(),
    },
  });
  assert.equal(response.statusCode, 202);

  const queuedJob = searchRunQueue.findJobById(response.json().jobId);
  assert.equal(queuedJob?.ownerId, "user-1");
});

test("Web 可取消 Running SearchRun，取消后插件提交被拒绝", async () => {
  const users = new InMemoryUserRepository([createUser("user-1", "hunter@example.test", "secret")]);
  const searchRuns = new InMemorySearchRunRepository();
  const app = createApp({
    idGenerator: () => "plugin-run-cancel",
    users,
    searchRuns,
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });

  const webLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "hunter@example.test",
      password: "secret",
    },
  });
  assert.equal(webLogin.statusCode, 200);

  const createRun = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: {
      authorization: `Bearer ${webLogin.json().token}`,
    },
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });
  assert.equal(createRun.statusCode, 202);

  const cancel = await app.inject({
    method: "POST",
    url: "/api/search-runs/plugin-run-cancel/cancel",
    headers: {
      authorization: `Bearer ${webLogin.json().token}`,
    },
  });
  assert.equal(cancel.statusCode, 200);
  assert.equal(cancel.json().status, "Cancelled");

  const pluginLogin = await app.inject({
    method: "POST",
    url: "/api/plugin/auth/login",
    payload: {
      email: "hunter@example.test",
      password: "secret",
    },
  });
  assert.equal(pluginLogin.statusCode, 200);

  const submit = await app.inject({
    method: "POST",
    url: "/api/plugin/search-runs/plugin-run-cancel/candidates",
    headers: {
      authorization: `Bearer ${pluginLogin.json().token}`,
    },
    payload: {
      batchId: "attachment-batch-1",
      candidates: createCandidateDrafts().slice(0, 1),
    },
  });
  assert.equal(submit.statusCode, 409);
  assert.equal(submit.json().error, "SearchRunCancelled");
});

test("插件登录后可向自己的 SearchRun 增量提交候选人并等待聚合", async () => {
  const users = new InMemoryUserRepository([createUser("user-1", "hunter@example.test", "secret")]);
  const searchRuns = new InMemorySearchRunRepository();
  const jobProfiles = new InMemoryJobProfileRepository();
  const app = createApp({
    idGenerator: () => "plugin-run-submit",
    users,
    searchRuns,
    jobProfiles,
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });

  const webLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "hunter@example.test",
      password: "secret",
    },
  });
  assert.equal(webLogin.statusCode, 200);

  const createRun = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: {
      authorization: `Bearer ${webLogin.json().token}`,
    },
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });
  assert.equal(createRun.statusCode, 202);

  const pluginLogin = await app.inject({
    method: "POST",
    url: "/api/plugin/auth/login",
    payload: {
      email: "hunter@example.test",
      password: "secret",
    },
  });
  assert.equal(pluginLogin.statusCode, 200);

  const firstSubmit = await app.inject({
    method: "POST",
    url: "/api/plugin/search-runs/plugin-run-submit/candidates",
    headers: {
      authorization: `Bearer ${pluginLogin.json().token}`,
    },
    payload: {
      batchId: "batch-1",
      sourcePlatform: "MockPlatform",
      candidates: createCandidateDrafts().slice(0, 1),
    },
  });
  assert.equal(firstSubmit.statusCode, 202);
  assert.equal(firstSubmit.json().rawSubmittedCount, 1);
  assert.equal(firstSubmit.json().candidateCount, 1);

  const secondSubmit = await app.inject({
    method: "POST",
    url: "/api/plugin/search-runs/plugin-run-submit/candidates",
    headers: {
      authorization: `Bearer ${pluginLogin.json().token}`,
    },
    payload: {
      batchId: "batch-2",
      sourcePlatform: "MockPlatform",
      candidates: createCandidateDrafts().slice(1, 2),
    },
  });

  assert.equal(secondSubmit.statusCode, 202);
  assert.equal(secondSubmit.json().rawSubmittedCount, 2);
  assert.equal(secondSubmit.json().candidateCount, 2);

  const saved = await searchRuns.findById("plugin-run-submit");
  assert.equal(saved?.status, "Acquired");
  assert.equal(saved?.rawSubmittedCount, 2);
  assert.deepEqual(
    saved?.candidates.map((candidate) => candidate.fingerprint),
    ["candidate-a", "candidate-b"],
  );
});

test("插件可上传、覆盖候选人附件，Web 可下载", async () => {
  const users = new InMemoryUserRepository([createUser("user-1", "hunter@example.test", "secret")]);
  const searchRuns = new InMemorySearchRunRepository();
  const jobProfiles = new InMemoryJobProfileRepository();
  const attachmentStorageDir = await mkdtemp(join(tmpdir(), "jd-attachments-"));
  const app = createApp({
    idGenerator: () => "plugin-run-attachment",
    users,
    searchRuns,
    jobProfiles,
    attachmentStorageDir,
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });

  const webLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "hunter@example.test",
      password: "secret",
    },
  });
  const pluginLogin = await app.inject({
    method: "POST",
    url: "/api/plugin/auth/login",
    payload: {
      email: "hunter@example.test",
      password: "secret",
    },
  });
  assert.equal(webLogin.statusCode, 200);
  assert.equal(pluginLogin.statusCode, 200);

  const createRun = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: {
      authorization: `Bearer ${webLogin.json().token}`,
    },
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });
  assert.equal(createRun.statusCode, 202);

  const submit = await app.inject({
    method: "POST",
    url: "/api/plugin/search-runs/plugin-run-attachment/candidates",
    headers: {
      authorization: `Bearer ${pluginLogin.json().token}`,
    },
    payload: {
      batchId: "private-batch-1",
      candidates: createCandidateDrafts().slice(0, 1),
    },
  });
  assert.equal(submit.statusCode, 202);

  const saved = await searchRuns.findById("plugin-run-attachment");
  const candidateId = saved?.candidates[0]?.id;
  assert.equal(typeof candidateId, "string");

  const firstUpload = await app.inject({
    method: "POST",
    url: `/api/plugin/search-runs/plugin-run-attachment/candidates/${candidateId}/resume-attachment`,
    headers: {
      authorization: `Bearer ${pluginLogin.json().token}`,
    },
    payload: {
      filename: "resume.pdf",
      contentType: "application/pdf",
      contentBase64: Buffer.from("first").toString("base64"),
    },
  });
  assert.equal(firstUpload.statusCode, 200);
  assert.equal(firstUpload.json().sizeBytes, 5);

  const secondUpload = await app.inject({
    method: "POST",
    url: `/api/plugin/search-runs/plugin-run-attachment/candidates/${candidateId}/resume-attachment`,
    headers: {
      authorization: `Bearer ${pluginLogin.json().token}`,
    },
    payload: {
      filename: "resume.pdf",
      contentType: "application/pdf",
      contentBase64: Buffer.from("second").toString("base64"),
    },
  });
  assert.equal(secondUpload.statusCode, 200);
  assert.equal(secondUpload.json().sizeBytes, 6);

  const download = await app.inject({
    method: "GET",
    url: `/api/search-runs/plugin-run-attachment/candidates/${candidateId}/resume-attachment`,
    headers: {
      authorization: `Bearer ${webLogin.json().token}`,
    },
  });
  assert.equal(download.statusCode, 200);
  assert.equal(download.body, "second");
  assert.equal(download.headers["content-type"], "application/pdf");

  const query = await app.inject({
    method: "GET",
    url: "/api/search-runs/plugin-run-attachment",
    headers: {
      authorization: `Bearer ${webLogin.json().token}`,
    },
  });
  assert.equal(query.statusCode, 200);
  assert.equal(query.json().candidates[0].resumeAttachment.filename, "resume.pdf");
  assert.equal("storagePath" in query.json().candidates[0].resumeAttachment, false);
});

test("插件候选人提交超过限流阈值返回 429 RateLimited", async () => {
  const users = new InMemoryUserRepository([createUser("user-1", "hunter@example.test", "secret")]);
  const searchRuns = new InMemorySearchRunRepository();
  const jobProfiles = new InMemoryJobProfileRepository();
  const app = createApp({
    idGenerator: () => "plugin-run-ratelimit",
    users,
    searchRuns,
    jobProfiles,
    pluginRateLimits: { candidateSubmissionPerWindow: 1, windowSeconds: 60 },
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });

  const webLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "hunter@example.test", password: "secret" },
  });
  await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: { authorization: `Bearer ${webLogin.json().token}` },
    payload: { jobProfile: createConfirmedJobProfile(), sourceType: "plugin", targetResultCount: 10 },
  });
  const pluginLogin = await app.inject({
    method: "POST",
    url: "/api/plugin/auth/login",
    payload: { email: "hunter@example.test", password: "secret" },
  });

  const submitPayload = {
    batchId: "batch-1",
    sourcePlatform: "MockPlatform",
    candidates: createCandidateDrafts().slice(0, 1),
  };

  const firstSubmit = await app.inject({
    method: "POST",
    url: "/api/plugin/search-runs/plugin-run-ratelimit/candidates",
    headers: { authorization: `Bearer ${pluginLogin.json().token}` },
    payload: submitPayload,
  });
  assert.equal(firstSubmit.statusCode, 202);

  const secondSubmit = await app.inject({
    method: "POST",
    url: "/api/plugin/search-runs/plugin-run-ratelimit/candidates",
    headers: { authorization: `Bearer ${pluginLogin.json().token}` },
    payload: { ...submitPayload, batchId: "batch-2" },
  });
  assert.equal(secondSubmit.statusCode, 429);
  assert.equal(secondSubmit.json().error, "RateLimited");
  assert.ok(secondSubmit.json().retryAfterSeconds > 0);
  assert.ok(secondSubmit.headers["retry-after"]);
});

test("插件附件上传超过限流阈值返回 429 RateLimited", async () => {
  const users = new InMemoryUserRepository([createUser("user-1", "hunter@example.test", "secret")]);
  const searchRuns = new InMemorySearchRunRepository();
  const jobProfiles = new InMemoryJobProfileRepository();
  const attachmentStorageDir = await mkdtemp(join(tmpdir(), "jd-attachments-"));
  const app = createApp({
    idGenerator: () => "plugin-run-attachment-ratelimit",
    users,
    searchRuns,
    jobProfiles,
    attachmentStorageDir,
    pluginRateLimits: { attachmentUploadPerWindow: 1, windowSeconds: 60 },
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });

  const webLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "hunter@example.test", password: "secret" },
  });
  const pluginLogin = await app.inject({
    method: "POST",
    url: "/api/plugin/auth/login",
    payload: { email: "hunter@example.test", password: "secret" },
  });
  await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: { authorization: `Bearer ${webLogin.json().token}` },
    payload: { jobProfile: createConfirmedJobProfile(), sourceType: "plugin", targetResultCount: 10 },
  });
  const submit = await app.inject({
    method: "POST",
    url: "/api/plugin/search-runs/plugin-run-attachment-ratelimit/candidates",
    headers: { authorization: `Bearer ${pluginLogin.json().token}` },
    payload: { batchId: "batch-1", candidates: createCandidateDrafts().slice(0, 1) },
  });
  const saved = await searchRuns.findById("plugin-run-attachment-ratelimit");
  const candidateId = saved?.candidates[0]?.id;
  assert.equal(submit.statusCode, 202);

  const uploadPayload = {
    filename: "resume.pdf",
    contentType: "application/pdf",
    contentBase64: Buffer.from("first").toString("base64"),
  };

  const firstUpload = await app.inject({
    method: "POST",
    url: `/api/plugin/search-runs/plugin-run-attachment-ratelimit/candidates/${candidateId}/resume-attachment`,
    headers: { authorization: `Bearer ${pluginLogin.json().token}` },
    payload: uploadPayload,
  });
  assert.equal(firstUpload.statusCode, 200);

  const secondUpload = await app.inject({
    method: "POST",
    url: `/api/plugin/search-runs/plugin-run-attachment-ratelimit/candidates/${candidateId}/resume-attachment`,
    headers: { authorization: `Bearer ${pluginLogin.json().token}` },
    payload: uploadPayload,
  });
  assert.equal(secondUpload.statusCode, 429);
  assert.equal(secondUpload.json().error, "RateLimited");
});

test("API 未捕获异常时输出结构化错误日志", async () => {
  const searchRuns = new InMemorySearchRunRepository();
  searchRuns.findById = async () => {
    throw new Error("boom");
  };
  const app = createApp({ searchRuns });

  const originalConsoleError = console.error;
  const logs: string[] = [];
  console.error = (message?: unknown) => {
    logs.push(String(message));
  };

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/search-runs/broken-run",
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.json().error, "InternalServerError");
    assert.equal(logs.length, 1);
    const logged = JSON.parse(logs[0]);
    assert.equal(logged.method, "GET");
    assert.equal(logged.path, "/api/search-runs/broken-run");
    assert.equal(logged.errorMessage, "boom");
  } finally {
    console.error = originalConsoleError;
  }
});

test("认证开启后过期 token 返回 TokenExpired", async () => {
  const user = createUser("user-1", "hunter@example.test", "secret");
  const users = new InMemoryUserRepository([user]);
  const app = createApp({
    users,
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });
  const expiredToken = signAuthToken(user, "test-secret", "web", -1);

  const response = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: {
      authorization: `Bearer ${expiredToken}`,
    },
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "TokenExpired");
});

test("插件候选人缓冲满 20 条时立即触发评估", async () => {
  const users = new InMemoryUserRepository([createUser("user-1", "hunter@example.test", "secret")]);
  const searchRuns = new InMemorySearchRunRepository();
  const jobProfiles = new InMemoryJobProfileRepository();
  const app = createApp({
    idGenerator: () => "plugin-run-threshold",
    users,
    searchRuns,
    jobProfiles,
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });

  const webLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "hunter@example.test",
      password: "secret",
    },
  });
  assert.equal(webLogin.statusCode, 200);

  const createRun = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: {
      authorization: `Bearer ${webLogin.json().token}`,
    },
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 50,
    },
  });
  assert.equal(createRun.statusCode, 202);

  const pluginLogin = await app.inject({
    method: "POST",
    url: "/api/plugin/auth/login",
    payload: {
      email: "hunter@example.test",
      password: "secret",
    },
  });
  assert.equal(pluginLogin.statusCode, 200);

  const response = await app.inject({
    method: "POST",
    url: "/api/plugin/search-runs/plugin-run-threshold/candidates",
    headers: {
      authorization: `Bearer ${pluginLogin.json().token}`,
    },
    payload: {
      batchId: "batch-20",
      sourcePlatform: "MockPlatform",
      candidates: createManyCandidateDrafts(20),
    },
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.json().rawSubmittedCount, 20);

  const saved = await searchRuns.findById("plugin-run-threshold");
  assert.equal(saved?.status, "Assessed");
  assert.equal(saved?.candidates.filter((candidate) => candidate.matchAssessment).length, 20);
});

test("插件不能向其他用户创建的 SearchRun 提交候选人", async () => {
  const users = new InMemoryUserRepository([
    createUser("user-1", "owner@example.test", "secret"),
    createUser("user-2", "other@example.test", "secret"),
  ]);
  const searchRuns = new InMemorySearchRunRepository();
  const app = createApp({
    idGenerator: () => "plugin-run-owner",
    users,
    searchRuns,
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });

  const ownerLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "owner@example.test",
      password: "secret",
    },
  });
  assert.equal(ownerLogin.statusCode, 200);

  const createRun = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: {
      authorization: `Bearer ${ownerLogin.json().token}`,
    },
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });
  assert.equal(createRun.statusCode, 202);

  const otherPluginLogin = await app.inject({
    method: "POST",
    url: "/api/plugin/auth/login",
    payload: {
      email: "other@example.test",
      password: "secret",
    },
  });
  assert.equal(otherPluginLogin.statusCode, 200);

  const response = await app.inject({
    method: "POST",
    url: "/api/plugin/search-runs/plugin-run-owner/candidates",
    headers: {
      authorization: `Bearer ${otherPluginLogin.json().token}`,
    },
    payload: {
      batchId: "batch-other",
      candidates: createCandidateDrafts().slice(0, 1),
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "AuthError");
});

test("Web 用户不能访问其他用户的 SearchRun、附件和审计", async () => {
  const users = new InMemoryUserRepository([
    createUser("user-1", "owner@example.test", "secret"),
    createUser("user-2", "other@example.test", "secret"),
  ]);
  const searchRuns = new InMemorySearchRunRepository();
  const jobProfiles = new InMemoryJobProfileRepository();
  const attachmentStorageDir = await mkdtemp(join(tmpdir(), "jd-attachments-"));
  const app = createApp({
    idGenerator: () => "plugin-run-private",
    users,
    searchRuns,
    jobProfiles,
    attachmentStorageDir,
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });

  const ownerWebLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "owner@example.test",
      password: "secret",
    },
  });
  const ownerPluginLogin = await app.inject({
    method: "POST",
    url: "/api/plugin/auth/login",
    payload: {
      email: "owner@example.test",
      password: "secret",
    },
  });
  const otherWebLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "other@example.test",
      password: "secret",
    },
  });
  assert.equal(ownerWebLogin.statusCode, 200);
  assert.equal(ownerPluginLogin.statusCode, 200);
  assert.equal(otherWebLogin.statusCode, 200);

  const createRun = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: {
      authorization: `Bearer ${ownerWebLogin.json().token}`,
    },
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });
  assert.equal(createRun.statusCode, 202);

  const submit = await app.inject({
    method: "POST",
    url: "/api/plugin/search-runs/plugin-run-private/candidates",
    headers: {
      authorization: `Bearer ${ownerPluginLogin.json().token}`,
    },
    payload: {
      batchId: "private-batch-1",
      candidates: createCandidateDrafts().slice(0, 1),
    },
  });
  assert.equal(submit.statusCode, 202);

  const saved = await searchRuns.findById("plugin-run-private");
  const candidateId = saved?.candidates[0]?.id;
  assert.equal(typeof candidateId, "string");

  const upload = await app.inject({
    method: "POST",
    url: `/api/plugin/search-runs/plugin-run-private/candidates/${candidateId}/resume-attachment`,
    headers: {
      authorization: `Bearer ${ownerPluginLogin.json().token}`,
    },
    payload: {
      filename: "resume.pdf",
      contentType: "application/pdf",
      contentBase64: Buffer.from("private").toString("base64"),
    },
  });
  assert.equal(upload.statusCode, 200);

  const otherHeaders = {
    authorization: `Bearer ${otherWebLogin.json().token}`,
  };
  const queryRun = await app.inject({
    method: "GET",
    url: "/api/search-runs/plugin-run-private",
    headers: otherHeaders,
  });
  assert.equal(queryRun.statusCode, 403);

  const download = await app.inject({
    method: "GET",
    url: `/api/search-runs/plugin-run-private/candidates/${candidateId}/resume-attachment`,
    headers: otherHeaders,
  });
  assert.equal(download.statusCode, 403);

  const cancel = await app.inject({
    method: "POST",
    url: "/api/search-runs/plugin-run-private/cancel",
    headers: otherHeaders,
  });
  assert.equal(cancel.statusCode, 403);

  const audit = await app.inject({
    method: "GET",
    url: "/api/search-runs/plugin-run-private/ai-assessment-audits",
    headers: otherHeaders,
  });
  assert.equal(audit.statusCode, 403);
});

test("Web 用户不能访问其他用户的 JobProfile 版本和汇总", async () => {
  const users = new InMemoryUserRepository([
    createUser("user-1", "owner@example.test", "secret"),
    createUser("user-2", "other@example.test", "secret"),
  ]);
  const searchRuns = new InMemorySearchRunRepository();
  const jobProfiles = new InMemoryJobProfileRepository();
  const jobProfileVersions = new InMemoryJobProfileVersionRepository();
  const app = createApp({
    idGenerator: () => "job-profile-private-run",
    users,
    searchRuns,
    jobProfiles,
    jobProfileVersions,
    auth: {
      enabled: true,
      jwtSecret: "test-secret",
      webTokenTtlSeconds: 3600,
      pluginTokenTtlSeconds: 3600,
    },
  });

  const ownerLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "owner@example.test",
      password: "secret",
    },
  });
  const otherLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "other@example.test",
      password: "secret",
    },
  });
  assert.equal(ownerLogin.statusCode, 200);
  assert.equal(otherLogin.statusCode, 200);

  const createRun = await app.inject({
    method: "POST",
    url: "/api/search-runs/one-time",
    headers: {
      authorization: `Bearer ${ownerLogin.json().token}`,
    },
    payload: {
      jobProfile: createConfirmedJobProfile(),
      sourceType: "plugin",
      targetResultCount: 10,
    },
  });
  assert.equal(createRun.statusCode, 202);

  const otherHeaders = {
    authorization: `Bearer ${otherLogin.json().token}`,
  };
  const versions = await app.inject({
    method: "GET",
    url: "/api/job-profiles/job-1/versions",
    headers: otherHeaders,
  });
  assert.equal(versions.statusCode, 403);

  const candidates = await app.inject({
    method: "GET",
    url: "/api/job-profiles/job-1/candidates",
    headers: otherHeaders,
  });
  assert.equal(candidates.statusCode, 403);

  const draft = await app.inject({
    method: "POST",
    url: "/api/job-profiles/job-1/versions/draft",
    headers: otherHeaders,
    payload: {
      title: "非法草稿",
      jdText: createConfirmedJobProfile().jdText,
      searchCondition: createConfirmedJobProfile().searchCondition,
      hardRequirements: createConfirmedJobProfile().hardRequirements,
      softRequirements: createConfirmedJobProfile().softRequirements,
    },
  });
  assert.equal(draft.statusCode, 403);

  const profileReport = await app.inject({
    method: "GET",
    url: "/api/job-profiles/job-1/report",
    headers: otherHeaders,
  });
  assert.equal(profileReport.statusCode, 403);

  const runReport = await app.inject({
    method: "GET",
    url: `/api/search-runs/${createRun.json().searchRunId}/report`,
    headers: otherHeaders,
  });
  assert.equal(runReport.statusCode, 403);
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

function createUser(id: string, email: string, password: string): User {
  return {
    id,
    email,
    passwordHash: hashPassword(password, undefined),
    pluginTokenVersion: 1,
    createdAt: new Date("2026-06-06T00:00:00.000Z"),
  };
}

function createManyCandidateDrafts(count: number): CandidateDraft[] {
  const template = createCandidateDrafts()[0]!;
  return Array.from({ length: count }, (_, index) => ({
    ...template,
    fingerprint: `candidate-${index + 1}`,
    resume: {
      ...template.resume,
      name: `候选人${index + 1}`,
      summary: `${template.resume.summary} 第 ${index + 1} 位。`,
    },
    sourceLead: {
      ...template.sourceLead,
      url: `https://example.test/candidate-${index + 1}`,
    },
  }));
}
