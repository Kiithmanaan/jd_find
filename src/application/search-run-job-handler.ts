import { SearchOrchestrator } from "./search-orchestrator.js";
import type {
  AIAssessmentPort,
  AIAssessmentAuditSink,
  JobProfileRepository,
  JobProfileVersionRepository,
  OneTimeSearchJob,
  SearchRunRepository,
  SourceAdapter,
  CandidateAssessmentRepository,
} from "./ports.js";
import type { SearchRun } from "../domain/types.js";

export interface SearchRunJobHandlerDependencies {
  aiAssessment: AIAssessmentPort;
  aiAssessmentAudit?: AIAssessmentAuditSink;
  jobProfiles?: JobProfileRepository;
  jobProfileVersions?: JobProfileVersionRepository;
  searchRuns?: SearchRunRepository;
  sourceAdapterFactory: (job: OneTimeSearchJob) => SourceAdapter;
  candidateAssessments?: CandidateAssessmentRepository;
}

export class SearchRunJobHandler {
  constructor(private readonly dependencies: SearchRunJobHandlerDependencies) {}

  async handleOneTimeSearch(job: OneTimeSearchJob): Promise<SearchRun> {
    const sourceAdapter = this.dependencies.sourceAdapterFactory(job);

    const orchestrator = new SearchOrchestrator({
      sourceAdapter,
      aiAssessment: this.dependencies.aiAssessment,
      aiAssessmentAudit: this.dependencies.aiAssessmentAudit,
      jobProfiles: this.dependencies.jobProfiles,
      jobProfileVersions: this.dependencies.jobProfileVersions,
      searchRuns: this.dependencies.searchRuns,
      idGenerator: () => job.searchRunId,
      candidateAssessments: this.dependencies.candidateAssessments,
    });

    return orchestrator.runOneTimeSearch(job.jobProfile, job.ownerId, job.targetResultCount);
  }
}
