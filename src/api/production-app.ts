import type { FastifyInstance } from "fastify";
import { BullMqSearchRunQueue } from "../infrastructure/bullmq/bullmq-search-run-queue.js";
import {
  createPrismaClient,
  PrismaHardConditionConfigRepository,
  PrismaJobProfileRepository,
  PrismaJobProfileVersionRepository,
  PrismaSearchRunRepository,
  PrismaUserRepository,
  PrismaPluginCandidateBatchRepository,
  PrismaCandidateAssessmentRepository,
  PrismaReassessmentLockRepository,
} from "../infrastructure/prisma/prisma-repositories.js";
import { PrismaAIAssessmentAuditSink } from "../infrastructure/prisma/prisma-ai-assessment-audit-sink.js";
import { createAIAssessmentFromEnv } from "../infrastructure/ai/create-ai-assessment.js";
import { createApp } from "./app.js";

export interface CreateProductionAppOptions {
  queueName?: string;
  redisHost?: string;
  redisPort?: number;
}

export function createProductionApp(options: CreateProductionAppOptions = {}): FastifyInstance {
  const prisma = createPrismaClient();
  const jwtSecret = readRequiredEnv("JWT_SECRET");
  const searchRunQueue = new BullMqSearchRunQueue({
    queueName: options.queueName ?? process.env.SEARCH_RUN_QUEUE_NAME ?? "search-runs",
    connection: {
      host: options.redisHost ?? process.env.REDIS_HOST ?? "127.0.0.1",
      port: options.redisPort ?? Number(process.env.REDIS_PORT ?? 6379),
      lazyConnect: true,
    },
  });

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
    candidateAssessments: new PrismaCandidateAssessmentRepository(prisma),
    reassessmentLocks: new PrismaReassessmentLockRepository(prisma),
    auth: {
      enabled: true,
      jwtSecret,
    },
  });

  app.addHook("onClose", async () => {
    await searchRunQueue.close();
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
