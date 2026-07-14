import { Queue, type ConnectionOptions } from "bullmq";
import type { OneTimeSearchJob, PluginAggregationJob, PluginAggregationQueue, SearchRunQueue } from "../../application/ports.js";

export const ONE_TIME_SEARCH_JOB_NAME = "one-time-search";
export const PLUGIN_AGGREGATION_JOB_NAME = "plugin-aggregation";

export interface BullMqSearchRunQueueOptions {
  queueName?: string;
  connection: ConnectionOptions;
}

export class BullMqSearchRunQueue implements SearchRunQueue, PluginAggregationQueue {
  private readonly queue: Queue<OneTimeSearchJob | PluginAggregationJob>;

  constructor(options: BullMqSearchRunQueueOptions) {
    this.queue = new Queue<OneTimeSearchJob | PluginAggregationJob>(options.queueName ?? "search-runs", {
      connection: options.connection,
    });
  }

  async enqueueOneTimeSearch(job: OneTimeSearchJob): Promise<{ jobId: string; searchRunId: string }> {
    const queuedJob = await this.queue.add(ONE_TIME_SEARCH_JOB_NAME, job, {
      jobId: `${ONE_TIME_SEARCH_JOB_NAME}-${job.searchRunId}`,
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    });

    return { jobId: String(queuedJob.id), searchRunId: job.searchRunId };
  }

  async schedule(searchRunId: string, delayMs: number): Promise<void> {
    const jobId = `${PLUGIN_AGGREGATION_JOB_NAME}-${searchRunId}`;
    if (await this.queue.getJob(jobId)) return;
    await this.queue.add(PLUGIN_AGGREGATION_JOB_NAME, { searchRunId }, { jobId, delay: delayMs, removeOnComplete: true, removeOnFail: 100 });
  }

  async cancel(searchRunId: string): Promise<void> {
    const job = await this.queue.getJob(`${PLUGIN_AGGREGATION_JOB_NAME}-${searchRunId}`);
    if (job) await job.remove();
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
