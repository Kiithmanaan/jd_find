import { Worker } from "bullmq";
import { SearchRunJobHandler } from "../application/search-run-job-handler.js";
import { PluginCandidateService } from "../application/plugin-candidate.service.js";
import { PrismaAIAssessmentAuditSink } from "../infrastructure/prisma/prisma-ai-assessment-audit-sink.js";
import {
  createPrismaClient,
  PrismaJobProfileRepository,
  PrismaJobProfileVersionRepository,
  PrismaSearchRunRepository,
  PrismaCandidateAssessmentRepository,
  PrismaPluginCandidateBatchRepository,
} from "../infrastructure/prisma/prisma-repositories.js";
import { ONE_TIME_SEARCH_JOB_NAME, PLUGIN_AGGREGATION_JOB_NAME } from "../infrastructure/bullmq/bullmq-search-run-queue.js";
import type { OneTimeSearchJob, PluginAggregationJob } from "../application/ports.js";
import { loadEnvFile } from "../config/load-env.js";
import { createAIAssessmentFromEnv } from "../infrastructure/ai/create-ai-assessment.js";
import { createSourceAdapter } from "../infrastructure/source/create-source-adapter.js";

loadEnvFile();

const queueName = process.env.SEARCH_RUN_QUEUE_NAME ?? "search-runs";
const redisHost = process.env.REDIS_HOST ?? "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT ?? 6379);
const prisma = createPrismaClient();
const aiAssessment = createAIAssessmentFromEnv(process.env);
const jobProfiles = new PrismaJobProfileRepository(prisma);
const jobProfileVersions = new PrismaJobProfileVersionRepository(prisma);
const searchRuns = new PrismaSearchRunRepository(prisma);
const aiAssessmentAudit = new PrismaAIAssessmentAuditSink(prisma);
const pluginBatches = new PrismaPluginCandidateBatchRepository(prisma);

const handler = new SearchRunJobHandler({
  aiAssessment,
  aiAssessmentAudit,
  jobProfiles,
  jobProfileVersions,
  searchRuns,
  candidateAssessments: new PrismaCandidateAssessmentRepository(prisma),
  sourceAdapterFactory: createSourceAdapter,
});
const pluginCandidateService = new PluginCandidateService({ searchRuns, jobProfiles, aiAssessment, aiAssessmentAudit, pluginBatches, candidateAssessments: new PrismaCandidateAssessmentRepository(prisma) });

const worker = new Worker<OneTimeSearchJob | PluginAggregationJob>(
  queueName,
  async (job) => {
    if (job.name === ONE_TIME_SEARCH_JOB_NAME) return handler.handleOneTimeSearch(job.data as OneTimeSearchJob);
    if (job.name === PLUGIN_AGGREGATION_JOB_NAME) return pluginCandidateService.processScheduledAggregation((job.data as PluginAggregationJob).searchRunId);
    throw new Error(`Unsupported search run job: ${job.name}`);
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
