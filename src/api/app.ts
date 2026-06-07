import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import type {
  AIAssessmentAuditRepository,
  AIAssessmentPort,
  HardConditionConfigRepository,
  JobProfileRepository,
  JobProfileVersionRepository,
  SearchRunQueue,
  SearchRunRepository,
  UserRepository,
} from "../application/ports.js";
import { signAuthToken, verifyAuthTokenResult, verifyPassword, type AuthTokenPayload } from "../application/auth.js";
import { reassessJobProfileCandidates } from "../application/reassess-job-profile-candidates.js";
import {
  assertJobProfileConfirmed,
  confirmJobProfileVersion,
  createConfirmedJobProfileVersion,
  createDefaultJobProfileVersionId,
  createDraftJobProfileVersion,
} from "../domain/job-profile.js";
import {
  acquireCandidateResults,
  applyHardFilter,
  applySoftAssessments,
  cancelSearchRun,
  completeSearchRun,
  createSearchRun,
  deduplicateWithinSearchRun,
  failSearchRun,
  startSearchRun,
} from "../domain/search-run.js";
import {
  MATCH_ASSESSMENT_AGENT_VERSION,
  MATCH_ASSESSMENT_PROMPT_VERSION,
  normalizeAIAssessments,
} from "../domain/ai-assessment-contract.js";
import type { JobProfile, MatchAssessment, SearchRun } from "../domain/types.js";
import {
  InMemoryAIAssessmentAuditSink,
  InMemoryHardConditionConfigRepository,
  InMemoryJobProfileVersionRepository,
  InMemoryJobProfileRepository,
  InMemorySearchRunRepository,
  InMemoryUserRepository,
} from "../infrastructure/memory/in-memory-repositories.js";
import { summarizeJobProfileCandidates } from "../domain/candidate-summary.js";
import { InMemorySearchRunQueue } from "../infrastructure/memory/in-memory-search-run-queue.js";
import { MockAIAssessment } from "../infrastructure/mock/mock-ai-assessment.js";
import {
  formatZodError,
  jobProfileVersionDraftRequestSchema,
  loginRequestSchema,
  oneTimeSearchRequestSchema,
  pluginCandidateSubmissionSchema,
  resumeAttachmentUploadSchema,
} from "./schemas.js";

export interface CreateAppOptions {
  idGenerator?: () => string;
  jobProfiles?: JobProfileRepository;
  jobProfileVersions?: JobProfileVersionRepository;
  hardConditionConfig?: HardConditionConfigRepository;
  searchRuns?: SearchRunRepository;
  aiAssessmentAudits?: AIAssessmentAuditRepository;
  searchRunQueue?: SearchRunQueue;
  users?: UserRepository;
  aiAssessment?: AIAssessmentPort;
  attachmentStorageDir?: string;
  auth?: {
    enabled?: boolean;
    jwtSecret?: string;
    webTokenTtlSeconds?: number;
    pluginTokenTtlSeconds?: number;
  };
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: false,
  });
  const jobProfiles = options.jobProfiles ?? new InMemoryJobProfileRepository();
  const jobProfileVersions = options.jobProfileVersions ?? new InMemoryJobProfileVersionRepository();
  const searchRuns = options.searchRuns ?? new InMemorySearchRunRepository();
  const aiAssessmentAudits = options.aiAssessmentAudits ?? new InMemoryAIAssessmentAuditSink();
  const hardConditionConfig = options.hardConditionConfig ?? new InMemoryHardConditionConfigRepository();
  const searchRunQueue = options.searchRunQueue ?? new InMemorySearchRunQueue();
  const users = options.users ?? new InMemoryUserRepository([]);
  const aiAssessment = options.aiAssessment ?? new MockAIAssessment();
  const authEnabled = options.auth?.enabled ?? false;
  const jwtSecret = options.auth?.jwtSecret ?? process.env.JWT_SECRET ?? "development-only-secret";
  const webTokenTtlSeconds = options.auth?.webTokenTtlSeconds ?? 7 * 24 * 60 * 60;
  const pluginTokenTtlSeconds = options.auth?.pluginTokenTtlSeconds ?? 7 * 24 * 60 * 60;
  const attachmentStorageDir = options.attachmentStorageDir ?? process.env.RESUME_ATTACHMENT_DIR ?? join(process.cwd(), "data", "resume-attachments");
  const maxResumeAttachmentBytes = 20 * 1024 * 1024;
  const pluginAggregationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pluginAggregationWindowMs = 30_000;
  const pluginAggregationThreshold = 20;

  app.get("/api/health", async () => {
    return { status: "ok" };
  });

  app.get("/api/hard-condition-config", async () => {
    return {
      dimensions: await hardConditionConfig.findAll(),
    };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsedBody = loginRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "ValidationError", issues: formatZodError(parsedBody.error) });
    }

    const user = await users.findByEmail(parsedBody.data.email);
    if (!user || !verifyPassword(parsedBody.data.password, user.passwordHash)) {
      return reply.code(401).send({ error: "AuthError", message: "Invalid email or password." });
    }

    return reply.code(200).send({
      token: signAuthToken(user, jwtSecret, "web", webTokenTtlSeconds),
      tokenType: "Bearer",
      expiresIn: webTokenTtlSeconds,
    });
  });

  app.post("/api/plugin/auth/login", async (request, reply) => {
    const parsedBody = loginRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "ValidationError", issues: formatZodError(parsedBody.error) });
    }

    const user = await users.findByEmail(parsedBody.data.email);
    if (!user || !verifyPassword(parsedBody.data.password, user.passwordHash)) {
      return reply.code(401).send({ error: "AuthError", message: "Invalid email or password." });
    }

    return reply.code(200).send({
      token: signAuthToken(user, jwtSecret, "plugin", pluginTokenTtlSeconds),
      tokenType: "Bearer",
      expiresIn: pluginTokenTtlSeconds,
    });
  });

  app.post("/api/search-runs/one-time", async (request, reply) => {
    const currentUser = await authenticateRequest(request.headers.authorization, "web");
    if (authEnabled && currentUser.status !== "valid") {
      return sendAuthFailure(reply, currentUser.status, "Authentication is required.");
    }

    const idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
    const searchRunId = idGenerator();
    const parsedBody = oneTimeSearchRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "ValidationError",
        issues: formatZodError(parsedBody.error),
      });
    }

    const body = parsedBody.data;
    const jobProfile = body.jobProfile.currentVersionId
      ? body.jobProfile
      : {
          ...body.jobProfile,
          currentVersionId: createDefaultJobProfileVersionId(body.jobProfile.id),
        };

    assertJobProfileConfirmed(jobProfile);
    const ownedJobProfile: JobProfile = currentUser.status === "valid"
      ? { ...jobProfile, createdByUserId: jobProfile.createdByUserId ?? currentUser.payload.sub }
      : jobProfile;
    await jobProfiles.save(ownedJobProfile);
    await jobProfileVersions.save(createConfirmedJobProfileVersion(ownedJobProfile));

    if (body.sourceType === "plugin") {
      let searchRun = createSearchRun(ownedJobProfile, searchRunId, {
        targetResultCount: body.targetResultCount,
        ownerId: currentUser.status === "valid" ? currentUser.payload.sub : undefined,
      });
      searchRun = await searchRuns.save(startSearchRun(searchRun));

      return reply.code(202).send({
        searchRunId: searchRun.id,
        status: searchRun.status,
        statusUrl: `/api/search-runs/${searchRun.id}`,
      });
    }

    const queued = await searchRunQueue.enqueueOneTimeSearch({
      searchRunId,
      jobProfile: ownedJobProfile,
      source:
        body.sourceType === "csv"
          ? {
              type: "csv",
              csvFilePath: body.csvFilePath,
            }
          : {
              type: "mock",
              candidates: body.candidates,
              riskSignal: body.riskSignal,
            },
    });

    return reply.code(202).send({
      jobId: queued.jobId,
      searchRunId: queued.searchRunId,
      status: "Queued",
      statusUrl: `/api/search-runs/${queued.searchRunId}`,
    });
  });

  app.post<{ Params: { id: string } }>("/api/plugin/search-runs/:id/candidates", async (request, reply) => {
    const currentUser = await authenticateRequest(request.headers.authorization, "plugin");
    if (currentUser.status !== "valid") {
      return sendAuthFailure(reply, currentUser.status, "Plugin authentication is required.");
    }

    const searchRun = await searchRuns.findById(request.params.id);
    if (!searchRun) {
      return reply.code(404).send({ error: "SearchRunNotFound", message: "Search run was not found." });
    }
    if (searchRun.ownerId && searchRun.ownerId !== currentUser.payload.sub) {
      return reply.code(403).send({ error: "AuthError", message: "Plugin cannot submit to this search run." });
    }
    if (["Completed", "Cancelled", "Failed"].includes(searchRun.status)) {
      return reply.code(409).send({ error: `SearchRun${searchRun.status}`, message: `Search run is ${searchRun.status}.` });
    }

    const parsedBody = pluginCandidateSubmissionSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "ValidationError", issues: formatZodError(parsedBody.error) });
    }

    const jobProfile = await jobProfiles.findById(searchRun.jobProfileId);
    if (!jobProfile) {
      return reply.code(422).send({ error: "SearchRunInvalid", message: "Search run job profile was not found." });
    }

    const accepted = await acceptSubmittedCandidates(searchRun, jobProfile, parsedBody.data.candidates);
    const shouldProcessImmediately =
      countAcquiredCandidates(accepted) >= pluginAggregationThreshold ||
      accepted.rawSubmittedCount >= accepted.targetResultCount;

    if (shouldProcessImmediately) {
      clearPluginAggregationTimer(accepted.id);
      await processPendingCandidates(accepted, jobProfile);
    } else {
      schedulePluginAggregation(accepted.id);
    }

    const latest = await searchRuns.findById(accepted.id);
    return reply.code(202).send({
      searchRunId: latest?.id ?? accepted.id,
      status: latest?.status ?? accepted.status,
      rawSubmittedCount: latest?.rawSubmittedCount ?? accepted.rawSubmittedCount,
      acceptedCount: accepted.rawSubmittedCount - searchRun.rawSubmittedCount,
      candidateCount: latest?.candidates.length ?? accepted.candidates.length,
    });
  });

  app.post<{ Params: { id: string; candidateId: string } }>(
    "/api/plugin/search-runs/:id/candidates/:candidateId/resume-attachment",
    async (request, reply) => {
      const currentUser = await authenticateRequest(request.headers.authorization, "plugin");
      if (currentUser.status !== "valid") {
        return sendAuthFailure(reply, currentUser.status, "Plugin authentication is required.");
      }

      const searchRun = await searchRuns.findById(request.params.id);
      if (!searchRun) {
        return reply.code(404).send({ error: "SearchRunNotFound", message: "Search run was not found." });
      }
      if (searchRun.ownerId && searchRun.ownerId !== currentUser.payload.sub) {
        return reply.code(403).send({ error: "AuthError", message: "Plugin cannot upload to this search run." });
      }

      const candidate = searchRun.candidates.find((item) => item.id === request.params.candidateId);
      if (!candidate) {
        return reply.code(404).send({ error: "CandidateNotFound", message: "Candidate was not found." });
      }

      const parsedBody = resumeAttachmentUploadSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "ValidationError", issues: formatZodError(parsedBody.error) });
      }

      const content = decodeResumeAttachment(parsedBody.data.contentBase64);
      if (content.length > maxResumeAttachmentBytes) {
        return reply.code(413).send({ error: "AttachmentTooLarge", message: "Resume attachment must be 20MB or smaller." });
      }

      const safeFilename = sanitizeFilename(parsedBody.data.filename);
      const searchRunDirectory = join(attachmentStorageDir, searchRun.id);
      const storagePath = join(searchRunDirectory, `${candidate.id}-${safeFilename}`);
      await mkdir(searchRunDirectory, { recursive: true });
      await writeFile(storagePath, content);

      const updatedSearchRun = {
        ...searchRun,
        candidates: searchRun.candidates.map((item) =>
          item.id === candidate.id
            ? {
                ...item,
                resumeAttachment: {
                  filename: safeFilename,
                  contentType: parsedBody.data.contentType,
                  sizeBytes: content.length,
                  storagePath,
                  uploadedAt: new Date(),
                },
              }
            : item,
        ),
        updatedAt: new Date(),
      };
      await searchRuns.save(updatedSearchRun);

      return reply.code(200).send({
        searchRunId: searchRun.id,
        candidateId: candidate.id,
        filename: safeFilename,
        contentType: parsedBody.data.contentType,
        sizeBytes: content.length,
        downloadUrl: `/api/search-runs/${searchRun.id}/candidates/${candidate.id}/resume-attachment`,
      });
    },
  );

  app.get<{ Params: { id: string } }>("/api/search-runs/:id", async (request, reply) => {
    const searchRun = await searchRuns.findById(request.params.id);

    if (!searchRun) {
      return reply.code(404).send({
        error: "SearchRunNotFound",
        message: "Search run was not found.",
      });
    }

    return reply.code(200).send(searchRun);
  });

  app.get<{ Params: { id: string; candidateId: string } }>(
    "/api/search-runs/:id/candidates/:candidateId/resume-attachment",
    async (request, reply) => {
      const currentUser = await authenticateRequest(request.headers.authorization, "web");
      if (authEnabled && currentUser.status !== "valid") {
        return sendAuthFailure(reply, currentUser.status, "Authentication is required.");
      }

      const searchRun = await searchRuns.findById(request.params.id);
      if (!searchRun) {
        return reply.code(404).send({ error: "SearchRunNotFound", message: "Search run was not found." });
      }

      const candidate = searchRun.candidates.find((item) => item.id === request.params.candidateId);
      if (!candidate?.resumeAttachment) {
        return reply.code(404).send({ error: "AttachmentNotFound", message: "Resume attachment was not found." });
      }

      const content = await readFile(candidate.resumeAttachment.storagePath);
      reply.header("content-type", candidate.resumeAttachment.contentType);
      reply.header("content-disposition", `attachment; filename="${candidate.resumeAttachment.filename}"`);
      return reply.code(200).send(content);
    },
  );

  app.post<{ Params: { id: string } }>("/api/search-runs/:id/cancel", async (request, reply) => {
    const currentUser = await authenticateRequest(request.headers.authorization, "web");
    if (authEnabled && currentUser.status !== "valid") {
      return sendAuthFailure(reply, currentUser.status, "Authentication is required.");
    }

    const searchRun = await searchRuns.findById(request.params.id);
    if (!searchRun) {
      return reply.code(404).send({ error: "SearchRunNotFound", message: "Search run was not found." });
    }
    if (searchRun.status !== "Running" && searchRun.status !== "Acquired") {
      return reply.code(409).send({
        error: "SearchRunNotCancellable",
        message: "Only Running or Acquired search runs can be cancelled.",
      });
    }

    clearPluginAggregationTimer(searchRun.id);
    const cancelled = await searchRuns.save(cancelSearchRun(searchRun, "User cancelled search run."));
    return reply.code(200).send(cancelled);
  });

  app.get<{ Params: { id: string } }>("/api/job-profiles/:id/candidates", async (request, reply) => {
    const jobProfile = await jobProfiles.findById(request.params.id);
    if (!jobProfile) {
      return reply.code(404).send({ error: "JobProfileNotFound", message: "Job profile was not found." });
    }

    const currentVersion = jobProfile.currentVersionId
      ? await jobProfileVersions.findById(jobProfile.currentVersionId)
      : await jobProfileVersions.findLatestConfirmedByJobProfileId(jobProfile.id);
    if (!currentVersion) {
      return reply.code(422).send({ error: "JobProfileVersionMissing", message: "Confirmed version was not found." });
    }

    const runs = await searchRuns.findByJobProfileId(jobProfile.id);
    return reply.code(200).send({
      jobProfileId: jobProfile.id,
      jobProfileVersionId: currentVersion.id,
      ...summarizeJobProfileCandidates(runs, currentVersion.id),
    });
  });

  app.get<{ Params: { id: string } }>("/api/job-profiles/:id/versions", async (request, reply) => {
    const jobProfile = await jobProfiles.findById(request.params.id);
    if (!jobProfile) {
      return reply.code(404).send({ error: "JobProfileNotFound", message: "Job profile was not found." });
    }

    return reply.code(200).send({
      jobProfileId: jobProfile.id,
      currentVersionId: jobProfile.currentVersionId,
      versions: await jobProfileVersions.findByJobProfileId(jobProfile.id),
    });
  });

  app.post<{ Params: { id: string } }>("/api/job-profiles/:id/versions/draft", async (request, reply) => {
    const jobProfile = await jobProfiles.findById(request.params.id);
    if (!jobProfile) {
      return reply.code(404).send({ error: "JobProfileNotFound", message: "Job profile was not found." });
    }

    const parsedBody = jobProfileVersionDraftRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "ValidationError", issues: formatZodError(parsedBody.error) });
    }

    const versions = await jobProfileVersions.findByJobProfileId(jobProfile.id);
    const nextVersionNumber = Math.max(0, ...versions.map((version) => version.version)) + 1;
    const draftProfile = {
      ...jobProfile,
      ...parsedBody.data,
      status: "Draft" as const,
      currentVersionId: undefined,
      confirmedAt: undefined,
    };
    const draftVersion = await jobProfileVersions.save(
      createDraftJobProfileVersion(draftProfile, `${jobProfile.id}-v${nextVersionNumber}`, nextVersionNumber),
    );

    return reply.code(201).send(draftVersion);
  });

  app.post<{ Params: { id: string; versionId: string } }>(
    "/api/job-profiles/:id/versions/:versionId/confirm",
    async (request, reply) => {
      const jobProfile = await jobProfiles.findById(request.params.id);
      if (!jobProfile) {
        return reply.code(404).send({ error: "JobProfileNotFound", message: "Job profile was not found." });
      }

      const version = await jobProfileVersions.findById(request.params.versionId);
      if (!version || version.jobProfileId !== jobProfile.id) {
        return reply.code(404).send({ error: "JobProfileVersionNotFound", message: "Job profile version was not found." });
      }

      const confirmed = confirmJobProfileVersion(jobProfile, version);
      const savedJobProfile = await jobProfiles.save(confirmed.jobProfile);
      const savedVersion = await jobProfileVersions.save(confirmed.version);

      return reply.code(200).send({
        jobProfile: savedJobProfile,
        version: savedVersion,
      });
    },
  );

  app.post<{ Params: { id: string } }>("/api/job-profiles/:id/reassess-candidates", async (request, reply) => {
    const jobProfile = await jobProfiles.findById(request.params.id);
    if (!jobProfile) {
      return reply.code(404).send({ error: "JobProfileNotFound", message: "Job profile was not found." });
    }
    if (jobProfile.status !== "Confirmed" || !jobProfile.currentVersionId) {
      return reply.code(422).send({ error: "JobProfileNotConfirmed", message: "Job profile must be confirmed." });
    }

    const result = await reassessJobProfileCandidates(jobProfile, {
      searchRuns,
      aiAssessment,
      aiAssessmentAudit: aiAssessmentAudits,
      auditIdGenerator: () => crypto.randomUUID(),
    });

    return reply.code(202).send(result);
  });

  app.get<{ Params: { id: string } }>("/api/search-runs/:id/ai-assessment-audits", async (request, reply) => {
    const searchRun = await searchRuns.findById(request.params.id);

    if (!searchRun) {
      return reply.code(404).send({
        error: "SearchRunNotFound",
        message: "Search run was not found.",
      });
    }

    const records = await aiAssessmentAudits.findBySearchRunId(request.params.id);
    return reply.code(200).send({
      searchRunId: request.params.id,
      records,
    });
  });

  app.setErrorHandler(async (error, _request, reply) => {
    if (error.name === "DomainError") {
      return reply.code(422).send({
        error: error.name,
        message: error.message,
      });
    }

    return reply.code(500).send({
      error: "InternalServerError",
      message: "Unexpected server error.",
    });
  });

  return app;

  async function authenticateRequest(
    authorization: string | undefined,
    tokenType: "web" | "plugin",
  ): Promise<{ status: "valid"; payload: AuthTokenPayload } | { status: "missing" | "invalid" | "expired" }> {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
    if (!token) {
      return { status: "missing" };
    }

    const result = verifyAuthTokenResult(token, jwtSecret, tokenType);
    if (result.status !== "valid") {
      return result;
    }

    return (await users.findById(result.payload.sub)) ? result : { status: "invalid" };
  }

  async function acceptSubmittedCandidates(
    searchRun: SearchRun,
    jobProfile: JobProfile,
    candidates: Parameters<typeof acquireCandidateResults>[2],
  ): Promise<SearchRun> {
    const next = acquireCandidateResults(searchRun, jobProfile, candidates);
    return searchRuns.save(next);
  }

  async function processPendingCandidates(
    searchRun: SearchRun,
    jobProfile: JobProfile,
  ): Promise<SearchRun> {
    let next = searchRun;
    next = deduplicateWithinSearchRun(next);
    next = applyHardFilter(next, jobProfile);

    const hardPassedCandidates = next.candidates.filter((candidate) => candidate.status === "HardPassed");

    const assessmentStartedAt = Date.now();
    try {
      const assessments = normalizeAIAssessments(
        hardPassedCandidates,
        await aiAssessment.assessCandidates(jobProfile, hardPassedCandidates),
      );
      await recordAIAudit(next, jobProfile, hardPassedCandidates, assessments, Date.now() - assessmentStartedAt, undefined);
      next = applySoftAssessments(next, assessments);

      if (next.rawSubmittedCount >= next.targetResultCount) {
        next = completeSearchRun(next);
      }

      return searchRuns.save(next);
    } catch (error) {
      await recordAIAudit(next, jobProfile, hardPassedCandidates, new Map(), Date.now() - assessmentStartedAt, error);
      const failed = failSearchRun(next, error instanceof Error ? `${error.name}: ${error.message}` : "UnknownError");
      await searchRuns.save(failed);
      throw error;
    }
  }

  function schedulePluginAggregation(searchRunId: string): void {
    if (pluginAggregationTimers.has(searchRunId)) {
      return;
    }

    const timer = setTimeout(() => {
      void processScheduledPluginAggregation(searchRunId);
    }, pluginAggregationWindowMs);
    timer.unref();
    pluginAggregationTimers.set(searchRunId, timer);
  }

  function clearPluginAggregationTimer(searchRunId: string): void {
    const timer = pluginAggregationTimers.get(searchRunId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    pluginAggregationTimers.delete(searchRunId);
  }

  async function processScheduledPluginAggregation(searchRunId: string): Promise<void> {
    clearPluginAggregationTimer(searchRunId);

    const searchRun = await searchRuns.findById(searchRunId);
    if (!searchRun || ["Completed", "Cancelled", "Failed"].includes(searchRun.status)) {
      return;
    }

    const jobProfile = await jobProfiles.findById(searchRun.jobProfileId);
    if (!jobProfile) {
      await searchRuns.save(failSearchRun(searchRun, "SearchRunInvalid: Search run job profile was not found."));
      return;
    }

    await processPendingCandidates(searchRun, jobProfile);
  }

  function countAcquiredCandidates(searchRun: SearchRun): number {
    return searchRun.candidates.filter((candidate) => candidate.status === "Acquired").length;
  }

  async function recordAIAudit(
    searchRun: SearchRun,
    jobProfile: JobProfile,
    candidates: SearchRun["candidates"],
    assessments: Map<string, MatchAssessment>,
    durationMs: number,
    error: unknown | undefined,
  ): Promise<void> {
    if (candidates.length === 0) {
      return;
    }

    const prompt = createMatchAssessmentPrompt(jobProfile, candidates);
    await aiAssessmentAudits.record({
      id: crypto.randomUUID(),
      searchRunId: searchRun.id,
      jobProfileId: jobProfile.id,
      jobProfileVersionId: searchRun.jobProfileVersionId,
      agentType: "match-assessment",
      provider: aiAssessment.providerName ?? "unknown",
      model: aiAssessment.modelName ?? "unknown",
      promptVersion: MATCH_ASSESSMENT_PROMPT_VERSION,
      agentVersion: MATCH_ASSESSMENT_AGENT_VERSION,
      prompt,
      candidateIds: candidates.map((candidate) => candidate.id),
      inputSnapshot: {
        jobProfile: {
          id: jobProfile.id,
          title: jobProfile.title,
          searchCondition: jobProfile.searchCondition,
          hardRequirements: jobProfile.hardRequirements,
          softRequirements: jobProfile.softRequirements,
        },
        candidates: candidates.map((candidate) => ({
          id: candidate.id,
          fingerprint: candidate.fingerprint,
          resume: candidate.resume,
        })),
      },
      outputSnapshot: Array.from(assessments.entries()).map(([candidateId, assessment]) => ({
        candidateId,
        assessment,
      })),
      durationMs,
      status: error ? "failure" : "success",
      errorType: error instanceof Error ? error.name : error ? "UnknownError" : undefined,
      errorMessage: error instanceof Error ? error.message : error ? "Unknown AI assessment error." : undefined,
      createdAt: new Date(),
    });
  }
}

function createMatchAssessmentPrompt(jobProfile: JobProfile, candidates: SearchRun["candidates"]): string {
  return JSON.stringify({
    task: "match-assessment",
    jobProfileVersionId: jobProfile.currentVersionId,
    jobProfile: {
      title: jobProfile.title,
      hardRequirements: jobProfile.hardRequirements,
      softRequirements: jobProfile.softRequirements,
    },
    candidateIds: candidates.map((candidate) => candidate.id),
  });
}

function decodeResumeAttachment(contentBase64: string): Buffer {
  return Buffer.from(contentBase64, "base64");
}

function sanitizeFilename(filename: string): string {
  const safeName = basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeName || "resume";
}

function sendAuthFailure(
  reply: FastifyReply,
  status: "missing" | "invalid" | "expired",
  message: string,
): FastifyReply {
  if (status === "expired") {
    return reply.code(401).send({ error: "TokenExpired", message: "Token expired. Please login again." });
  }

  return reply.code(401).send({ error: "AuthError", message });
}
