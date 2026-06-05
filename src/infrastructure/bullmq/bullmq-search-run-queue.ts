import { Queue, type ConnectionOptions } from "bullmq";
import type { OneTimeSearchJob, SearchRunQueue } from "../../application/ports.js";

export const ONE_TIME_SEARCH_JOB_NAME = "one-time-search";

export interface BullMqSearchRunQueueOptions {
  queueName?: string;
  connection: ConnectionOptions;
}

export class BullMqSearchRunQueue implements SearchRunQueue {
  private readonly queue: Queue<OneTimeSearchJob>;

  constructor(options: BullMqSearchRunQueueOptions) {
    this.queue = new Queue<OneTimeSearchJob>(options.queueName ?? "search-runs", {
      connection: options.connection,
    });
  }

  async enqueueOneTimeSearch(job: OneTimeSearchJob): Promise<{ jobId: string; searchRunId: string }> {
    const queuedJob = await this.queue.add(ONE_TIME_SEARCH_JOB_NAME, job, {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    });

    return { jobId: String(queuedJob.id), searchRunId: job.searchRunId };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
