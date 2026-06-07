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
    },
  });
  assert.equal(draft.statusCode, 201);
  assert.equal(draft.json().id, "job-1-v2");
  assert.equal(draft.json().status, "Draft");

  const confirm = await app.inject({
    method: "POST",
    url: "/api/job-profiles/job-1/versions/job-1-v2/confirm",
  });
  assert.equal(confirm.statusCode, 200);
  assert.equal(confirm.json().jobProfile.currentVersionId, "job-1-v2");
  assert.equal(confirm.json().version.status, "Confirmed");

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
