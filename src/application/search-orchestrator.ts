import { normalizeConfirmedJobProfileVersion } from "../domain/job-profile.js";
import { formatFailureReason } from "../domain/errors.js";
import type { JobProfile, SearchRun } from "../domain/types.js";
import type {
  AIAssessmentAuditSink,
  AIAssessmentPort,
  JobProfileRepository,
  JobProfileVersionRepository,
  SearchRunRepository,
  SourceAdapter,
} from "./ports.js";
import {
  AcquirePhaseService,
  AssessmentPhaseService,
  CompletionPhaseService,
  SetupSearchRunService,
} from "./search-run-phases.js";

export interface SearchOrchestratorDependencies {
  sourceAdapter: SourceAdapter;
  aiAssessment: AIAssessmentPort;
  aiAssessmentAudit?: AIAssessmentAuditSink;
  jobProfiles?: JobProfileRepository;
  jobProfileVersions?: JobProfileVersionRepository;
  searchRuns?: SearchRunRepository;
  idGenerator: () => string;
  auditIdGenerator?: () => string;
}

export class SearchOrchestrator {
  constructor(private readonly dependencies: SearchOrchestratorDependencies) {}

  async runOneTimeSearch(jobProfile: JobProfile): Promise<SearchRun> {
    const runnableJobProfile = normalizeConfirmedJobProfileVersion(jobProfile);
    const deps = this.dependencies;

    const setupService = new SetupSearchRunService({
      jobProfiles: deps.jobProfiles,
      jobProfileVersions: deps.jobProfileVersions,
      searchRuns: deps.searchRuns,
      idGenerator: deps.idGenerator,
    });

    const acquireService = new AcquirePhaseService({
      sourceAdapter: deps.sourceAdapter,
      searchRuns: deps.searchRuns,
    });

    const assessmentService = new AssessmentPhaseService({
      aiAssessment: deps.aiAssessment,
      aiAssessmentAudit: deps.aiAssessmentAudit,
      searchRuns: deps.searchRuns,
      auditIdGenerator: deps.auditIdGenerator ?? (() => crypto.randomUUID()),
    });

    const completionService = new CompletionPhaseService({
      searchRuns: deps.searchRuns,
    });

    let searchRun = await setupService.execute(runnableJobProfile, undefined);

    try {
      const acquired = await acquireService.execute(runnableJobProfile, searchRun);
      if (acquired.riskTriggered) {
        return acquired.searchRun;
      }

      searchRun = await assessmentService.execute(runnableJobProfile, acquired.searchRun);
      return await completionService.complete(searchRun);
    } catch (error) {
      await completionService.fail(searchRun, error);
      throw error;
    }
  }
}
