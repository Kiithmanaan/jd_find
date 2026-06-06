import { SearchOrchestrator } from "./search-orchestrator.js";
import type {
  AIAssessmentPort,
  AIAssessmentAuditSink,
  JobProfileRepository,
  JobProfileVersionRepository,
  OneTimeSearchJob,
  SearchRunRepository,
  SourceAdapter,
} from "./ports.js";
import { MockSourceAdapter } from "../infrastructure/mock/mock-source-adapter.js";
import { CsvSourceAdapter } from "../infrastructure/csv/csv-source-adapter.js";
import type { SearchRun } from "../domain/types.js";

export interface SearchRunJobHandlerDependencies {
  aiAssessment: AIAssessmentPort;
  aiAssessmentAudit?: AIAssessmentAuditSink;
  jobProfiles?: JobProfileRepository;
  jobProfileVersions?: JobProfileVersionRepository;
  searchRuns?: SearchRunRepository;
  sourceAdapterFactory?: (job: OneTimeSearchJob) => SourceAdapter;
}

export class SearchRunJobHandler {
  constructor(private readonly dependencies: SearchRunJobHandlerDependencies) {}

  async handleOneTimeSearch(job: OneTimeSearchJob): Promise<SearchRun> {
    const sourceAdapter =
      this.dependencies.sourceAdapterFactory?.(job) ??
      createSourceAdapterForJob(job);

    const orchestrator = new SearchOrchestrator({
      sourceAdapter,
      aiAssessment: this.dependencies.aiAssessment,
      aiAssessmentAudit: this.dependencies.aiAssessmentAudit,
      jobProfiles: this.dependencies.jobProfiles,
      jobProfileVersions: this.dependencies.jobProfileVersions,
      searchRuns: this.dependencies.searchRuns,
      idGenerator: () => job.searchRunId,
    });

    return orchestrator.runOneTimeSearch(job.jobProfile);
  }
}

function createSourceAdapterForJob(job: OneTimeSearchJob): SourceAdapter {
  switch (job.source.type) {
    case "mock":
      return new MockSourceAdapter({
        candidates: job.source.candidates,
        riskSignal: job.source.riskSignal,
      });
    case "csv":
      return new CsvSourceAdapter({
        filePath: job.source.csvFilePath,
      });
    case "plugin":
      throw new Error("Plugin search runs are processed through ingestion APIs.");
  }
}
