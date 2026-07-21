import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { BullMqSearchRunQueue } from "../infrastructure/bullmq/bullmq-search-run-queue.js";
import { RedisRateLimiter } from "../infrastructure/redis/redis-rate-limiter.js";
import {
  createPrismaClient,
  PrismaHardConditionConfigRepository,
  PrismaJobProfileRepository,
  PrismaJobProfileVersionRepository,
  PrismaSearchRunRepository,
  PrismaUserRepository,
  PrismaPluginCandidateBatchRepository,
  PrismaParseDiagnosticsRepository,
  PrismaCandidateAssessmentRepository,
  PrismaReassessmentLockRepository,
  PrismaClarificationInterviewSessionRepository,
  PrismaSearchRefinementSuggestionRepository,
} from "../infrastructure/prisma/prisma-repositories.js";
import { PrismaAIAssessmentAuditSink } from "../infrastructure/prisma/prisma-ai-assessment-audit-sink.js";
import { createAIAssessmentFromEnv } from "../infrastructure/ai/create-ai-assessment.js";
import { createClarificationInterviewFromEnv } from "../infrastructure/ai/create-clarification-interview.js";
import { createSearchRefinementFromEnv } from "../infrastructure/ai/create-search-refinement.js";
import { createApp } from "./app.js";

export interface CreateProductionAppOptions {
  queueName?: string;
  redisHost?: string;
  redisPort?: number;
}

export function createProductionApp(options: CreateProductionAppOptions = {}): FastifyInstance {
  const prisma = createPrismaClient();
  const jwtSecret = readRequiredEnv("JWT_SECRET");
  const redisHost = options.redisHost ?? process.env.REDIS_HOST ?? "127.0.0.1";
  const redisPort = options.redisPort ?? Number(process.env.REDIS_PORT ?? 6379);
  const searchRunQueue = new BullMqSearchRunQueue({
    queueName: options.queueName ?? process.env.SEARCH_RUN_QUEUE_NAME ?? "search-runs",
    connection: {
      host: redisHost,
      port: redisPort,
      lazyConnect: true,
    },
  });

  const rateLimiterRedis = new Redis({ host: redisHost, port: redisPort, lazyConnect: true });
  const rateLimiter = new RedisRateLimiter(rateLimiterRedis);

  const app = createApp({
    jobProfiles: new PrismaJobProfileRepository(prisma),
    jobProfileVersions: new PrismaJobProfileVersionRepository(prisma),
    hardConditionConfig: new PrismaHardConditionConfigRepository(prisma),
    searchRuns: new PrismaSearchRunRepository(prisma),
    aiAssessmentAudits: new PrismaAIAssessmentAuditSink(prisma),
    aiAssessment: createAIAssessmentFromEnv(process.env),
    searchRunQueue,
    pluginAggregationQueue: searchRunQueue,
    users: new PrismaUserRepository(prisma),
    pluginCandidateBatches: new PrismaPluginCandidateBatchRepository(prisma),
    parseDiagnostics: new PrismaParseDiagnosticsRepository(prisma),
    candidateAssessments: new PrismaCandidateAssessmentRepository(prisma),
    reassessmentLocks: new PrismaReassessmentLockRepository(prisma),
    clarificationInterviews: new PrismaClarificationInterviewSessionRepository(prisma),
    clarificationInterviewAI: createClarificationInterviewFromEnv(process.env),
    refinementSuggestions: new PrismaSearchRefinementSuggestionRepository(prisma),
    searchRefinementAI: createSearchRefinementFromEnv(process.env),
    auth: {
      enabled: true,
      jwtSecret,
    },
    rateLimiter,
    pluginRateLimits: {
      candidateSubmissionPerWindow: Number(process.env.PLUGIN_CANDIDATE_RATE_LIMIT ?? 60),
      rawSubmissionPerWindow: Number(process.env.PLUGIN_RAW_RATE_LIMIT ?? 30),
      attachmentUploadPerWindow: Number(process.env.PLUGIN_ATTACHMENT_RATE_LIMIT ?? 30),
      windowSeconds: Number(process.env.PLUGIN_RATE_LIMIT_WINDOW_SECONDS ?? 60),
    },
  });

  app.addHook("onClose", async () => {
    await searchRunQueue.close();
    await rateLimiterRedis.quit();
    await prisma.$disconnect();
  });

  return app;
}

function readRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}
