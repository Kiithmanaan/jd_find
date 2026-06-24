import { Worker } from "bullmq";
import { SearchRunJobHandler } from "../application/search-run-job-handler.js";
import { PrismaAIAssessmentAuditSink } from "../infrastructure/prisma/prisma-ai-assessment-audit-sink.js";
import {
  createPrismaClient,
  PrismaJobProfileRepository,
  PrismaJobProfileVersionRepository,
  PrismaSearchRunRepository,
} from "../infrastructure/prisma/prisma-repositories.js";
import { ONE_TIME_SEARCH_JOB_NAME } from "../infrastructure/bullmq/bullmq-search-run-queue.js";
import type { OneTimeSearchJob } from "../application/ports.js";
import { loadEnvFile } from "../config/load-env.js";
import { createAIAssessmentFromEnv } from "../infrastructure/ai/create-ai-assessment.js";

loadEnvFile();

const queueName = process.env.SEARCH_RUN_QUEUE_NAME ?? "search-runs";
const redisHost = process.env.REDIS_HOST ?? "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT ?? 6379);
const prisma = createPrismaClient();
const aiAssessment = createAIAssessmentFromEnv(process.env);

const handler = new SearchRunJobHandler({
  aiAssessment,
  aiAssessmentAudit: new PrismaAIAssessmentAuditSink(prisma),
  jobProfiles: new PrismaJobProfileRepository(prisma),
  jobProfileVersions: new PrismaJobProfileVersionRepository(prisma),
  searchRuns: new PrismaSearchRunRepository(prisma),
});

const worker = new Worker<OneTimeSearchJob>(
  queueName,
  async (job) => {
    if (job.name !== ONE_TIME_SEARCH_JOB_NAME) {
      throw new Error(`Unsupported search run job: ${job.name}`);
    }

    return handler.handleOneTimeSearch(job.data);
  },
  {
    connection: {
      host: redisHost,
      port: redisPort,
    },
  },
);

worker.on("failed", (job, error) => {
  console.error("Search run job failed", {
    jobId: job?.id,
    error: error.message,
  });
});

async function shutdown(): Promise<void> {
  await worker.close();
  await prisma.$disconnect();
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
