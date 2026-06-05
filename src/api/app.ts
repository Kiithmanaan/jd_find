import Fastify, { type FastifyInstance } from "fastify";
import type {
  AIAssessmentAuditRepository,
  JobProfileRepository,
  SearchRunQueue,
  SearchRunRepository,
} from "../application/ports.js";
import { assertJobProfileConfirmed } from "../domain/job-profile.js";
import {
  InMemoryAIAssessmentAuditSink,
  InMemoryJobProfileRepository,
  InMemorySearchRunRepository,
} from "../infrastructure/memory/in-memory-repositories.js";
import { InMemorySearchRunQueue } from "../infrastructure/memory/in-memory-search-run-queue.js";
import { formatZodError, oneTimeSearchRequestSchema } from "./schemas.js";

export interface CreateAppOptions {
  idGenerator?: () => string;
  jobProfiles?: JobProfileRepository;
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
  const searchRunQueue = options.searchRunQueue ?? new InMemorySearchRunQueue();

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.post("/search-runs/one-time", async (request, reply) => {
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

    assertJobProfileConfirmed(body.jobProfile);
    await jobProfiles.save(body.jobProfile);

    const queued = await searchRunQueue.enqueueOneTimeSearch({
      searchRunId,
      jobProfile: body.jobProfile,
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
      statusUrl: `/search-runs/${queued.searchRunId}`,
    });
  });

  app.get<{ Params: { id: string } }>("/search-runs/:id", async (request, reply) => {
    const searchRun = await searchRuns.findById(request.params.id);

    if (!searchRun) {
      return reply.code(404).send({
        error: "SearchRunNotFound",
        message: "Search run was not found.",
      });
    }

    return reply.code(200).send(searchRun);
  });

  app.get<{ Params: { id: string } }>("/search-runs/:id/ai-assessment-audits", async (request, reply) => {
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
