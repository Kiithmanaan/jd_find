import type { OneTimeSearchJob, SearchRunQueue } from "../../application/ports.js";

export class InMemorySearchRunQueue implements SearchRunQueue {
  private readonly jobs = new Map<string, OneTimeSearchJob>();
  private sequence = 0;

  async enqueueOneTimeSearch(job: OneTimeSearchJob): Promise<{ jobId: string; searchRunId: string }> {
    this.sequence += 1;
    const jobId = `memory-search-job-${this.sequence}`;
    this.jobs.set(jobId, structuredClone(job));
    return { jobId, searchRunId: job.searchRunId };
  }

  findJobById(jobId: string): OneTimeSearchJob | undefined {
    const job = this.jobs.get(jobId);
    return job ? structuredClone(job) : undefined;
  }
}
