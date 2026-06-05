import type { FastifyInstance } from "fastify";
import { BullMqSearchRunQueue } from "../infrastructure/bullmq/bullmq-search-run-queue.js";
import {
  createPrismaClient,
  PrismaJobProfileRepository,
  PrismaSearchRunRepository,
} from "../infrastructure/prisma/prisma-repositories.js";
import { PrismaAIAssessmentAuditSink } from "../infrastructure/prisma/prisma-ai-assessment-audit-sink.js";
import { createApp } from "./app.js";

export interface CreateProductionAppOptions {
  queueName?: string;
  redisHost?: string;
  redisPort?: number;
}

export function createProductionApp(options: CreateProductionAppOptions = {}): FastifyInstance {
  const prisma = createPrismaClient();
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
    searchRuns: new PrismaSearchRunRepository(prisma),
    aiAssessmentAudits: new PrismaAIAssessmentAuditSink(prisma),
    searchRunQueue,
  });

  app.addHook("onClose", async () => {
    await searchRunQueue.close();
    await prisma.$disconnect();
  });

  return app;
}
