import { Worker } from "bullmq";
import { SearchRunJobHandler } from "../application/search-run-job-handler.js";
import type { AIAssessmentPort } from "../application/ports.js";
import { HttpAIAssessment } from "../infrastructure/http/http-ai-assessment.js";
import { MockAIAssessment } from "../infrastructure/mock/mock-ai-assessment.js";
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

loadEnvFile();

const queueName = process.env.SEARCH_RUN_QUEUE_NAME ?? "search-runs";
const redisHost = process.env.REDIS_HOST ?? "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT ?? 6379);
const prisma = createPrismaClient();
const aiAssessment = createAIAssessment();

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

function createAIAssessment(): AIAssessmentPort {
  if (process.env.AI_ASSESSMENT_PROVIDER === "http") {
    const endpoint = process.env.AI_ASSESSMENT_ENDPOINT;

    if (!endpoint) {
      throw new Error("AI_ASSESSMENT_ENDPOINT is required when AI_ASSESSMENT_PROVIDER=http.");
    }

    return new HttpAIAssessment({
      endpoint,
      apiKey: process.env.AI_ASSESSMENT_API_KEY,
      providerName: process.env.AI_ASSESSMENT_PROVIDER_NAME ?? "http",
      modelName: process.env.AI_ASSESSMENT_MODEL ?? "external-ai-assessment",
      timeoutMs: process.env.AI_ASSESSMENT_TIMEOUT_MS
        ? Number(process.env.AI_ASSESSMENT_TIMEOUT_MS)
        : undefined,
    });
  }

  return new MockAIAssessment();
}
