import Fastify, { type FastifyInstance } from "fastify";
import type {
  AIAssessmentAuditRepository,
  HardConditionConfigRepository,
  JobProfileRepository,
  JobProfileVersionRepository,
  SearchRunQueue,
  SearchRunRepository,
} from "../application/ports.js";
import {
  assertJobProfileConfirmed,
  createConfirmedJobProfileVersion,
  createDefaultJobProfileVersionId,
} from "../domain/job-profile.js";
import {
  InMemoryAIAssessmentAuditSink,
  InMemoryHardConditionConfigRepository,
  InMemoryJobProfileRepository,
  InMemorySearchRunRepository,
} from "../infrastructure/memory/in-memory-repositories.js";
import { InMemorySearchRunQueue } from "../infrastructure/memory/in-memory-search-run-queue.js";
import { formatZodError, oneTimeSearchRequestSchema } from "./schemas.js";

export interface CreateAppOptions {
  idGenerator?: () => string;
  jobProfiles?: JobProfileRepository;
  jobProfileVersions?: JobProfileVersionRepository;
  hardConditionConfig?: HardConditionConfigRepository;
  searchRuns?: SearchRunRepository;
  aiAssessmentAudits?: AIAssessmentAuditRepository;
  searchRunQueue?: SearchRunQueue;
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

  app.get("/api/health", async () => {
    return { status: "ok" };
  });

  app.get("/api/hard-condition-config", async () => {
    return {
      dimensions: await hardConditionConfig.findAll(),
    };
  });

  app.post("/api/search-runs/one-time", async (request, reply) => {
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
    await jobProfiles.save(jobProfile);
    await options.jobProfileVersions?.save(createConfirmedJobProfileVersion(jobProfile));

    const queued = await searchRunQueue.enqueueOneTimeSearch({
      searchRunId,
      jobProfile,
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
}
