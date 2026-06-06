import Fastify, { type FastifyInstance } from "fastify";
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
import { signAuthToken, verifyAuthToken, verifyPassword, type AuthTokenPayload } from "../application/auth.js";
import {
  assertJobProfileConfirmed,
  createConfirmedJobProfileVersion,
  createDefaultJobProfileVersionId,
} from "../domain/job-profile.js";
import {
  acquireCandidateResults,
  applyHardFilter,
  applySoftAssessments,
  completeSearchRun,
  createSearchRun,
  deduplicateWithinSearchRun,
  failSearchRun,
  startSearchRun,
} from "../domain/search-run.js";
import { normalizeAIAssessments } from "../domain/ai-assessment-contract.js";
import type { JobProfile, MatchAssessment, SearchRun } from "../domain/types.js";
import {
  InMemoryAIAssessmentAuditSink,
  InMemoryHardConditionConfigRepository,
  InMemoryJobProfileRepository,
  InMemorySearchRunRepository,
  InMemoryUserRepository,
} from "../infrastructure/memory/in-memory-repositories.js";
import { InMemorySearchRunQueue } from "../infrastructure/memory/in-memory-search-run-queue.js";
import { MockAIAssessment } from "../infrastructure/mock/mock-ai-assessment.js";
import { formatZodError, loginRequestSchema, oneTimeSearchRequestSchema, pluginCandidateSubmissionSchema } from "./schemas.js";

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
    if (authEnabled && !currentUser) {
      return reply.code(401).send({ error: "AuthError", message: "Authentication is required." });
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
    const ownedJobProfile: JobProfile = currentUser
      ? { ...jobProfile, createdByUserId: jobProfile.createdByUserId ?? currentUser.sub }
      : jobProfile;
    await jobProfiles.save(ownedJobProfile);
    await options.jobProfileVersions?.save(createConfirmedJobProfileVersion(ownedJobProfile));

    if (body.sourceType === "plugin") {
      let searchRun = createSearchRun(ownedJobProfile, searchRunId, {
        targetResultCount: body.targetResultCount,
        ownerId: currentUser?.sub,
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
    if (!currentUser) {
      return reply.code(401).send({ error: "AuthError", message: "Plugin authentication is required." });
    }

    const searchRun = await searchRuns.findById(request.params.id);
    if (!searchRun) {
      return reply.code(404).send({ error: "SearchRunNotFound", message: "Search run was not found." });
    }
    if (searchRun.ownerId && searchRun.ownerId !== currentUser.sub) {
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

    const processed = await processSubmittedCandidates(searchRun, jobProfile, parsedBody.data.candidates);
    return reply.code(202).send({
      searchRunId: processed.id,
      status: processed.status,
      rawSubmittedCount: processed.rawSubmittedCount,
      acceptedCount: processed.rawSubmittedCount - searchRun.rawSubmittedCount,
      candidateCount: processed.candidates.length,
    });
  });

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
  ): Promise<AuthTokenPayload | undefined> {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
    if (!token) {
      return undefined;
    }

    const payload = verifyAuthToken(token, jwtSecret, tokenType);
    if (!payload) {
      return undefined;
    }

    return (await users.findById(payload.sub)) ? payload : undefined;
  }

  async function processSubmittedCandidates(
    searchRun: SearchRun,
    jobProfile: JobProfile,
    candidates: Parameters<typeof acquireCandidateResults>[2],
  ): Promise<SearchRun> {
    let next = acquireCandidateResults(searchRun, jobProfile, candidates);
    next = deduplicateWithinSearchRun(next);
    next = applyHardFilter(next, jobProfile);

    const hardPassedCandidates = next.candidates.filter((candidate) => candidate.status === "HardPassed");

    try {
      const assessments = normalizeAIAssessments(
        hardPassedCandidates,
        await aiAssessment.assessCandidates(jobProfile, hardPassedCandidates),
      );
      await recordAIAudit(next, jobProfile, hardPassedCandidates, assessments);
      next = applySoftAssessments(next, assessments);

      if (next.rawSubmittedCount >= next.targetResultCount) {
        next = completeSearchRun(next);
      }

      return searchRuns.save(next);
    } catch (error) {
      const failed = failSearchRun(next, error instanceof Error ? `${error.name}: ${error.message}` : "UnknownError");
      await searchRuns.save(failed);
      throw error;
    }
  }

  async function recordAIAudit(
    searchRun: SearchRun,
    jobProfile: JobProfile,
    candidates: SearchRun["candidates"],
    assessments: Map<string, MatchAssessment>,
  ): Promise<void> {
    if (candidates.length === 0) {
      return;
    }

    await aiAssessmentAudits.record({
      id: crypto.randomUUID(),
      searchRunId: searchRun.id,
      jobProfileId: jobProfile.id,
      jobProfileVersionId: searchRun.jobProfileVersionId,
      provider: aiAssessment.providerName ?? "unknown",
      model: aiAssessment.modelName ?? "unknown",
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
      createdAt: new Date(),
    });
  }
}
