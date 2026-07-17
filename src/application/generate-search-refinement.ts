import {
  SEARCH_REFINEMENT_AGENT_VERSION,
  SEARCH_REFINEMENT_PROMPT_VERSION,
  createSearchRefinementPrompt,
  normalizeSearchRefinement,
  type SearchRefinementSuggestion,
} from "../domain/search-refinement-contract.js";
import { DomainError } from "../domain/errors.js";
import type { CandidateResult, JobProfile, SearchRun } from "../domain/types.js";
import type {
  AIAssessmentAuditSink,
  SearchRefinementPort,
  SearchRefinementSuggestionRepository,
} from "./ports.js";

export interface GenerateSearchRefinementDependencies {
  refinementAI: SearchRefinementPort;
  suggestions: SearchRefinementSuggestionRepository;
  aiAssessmentAudit?: AIAssessmentAuditSink;
  idGenerator?: () => string;
  auditIdGenerator?: () => string;
}

export async function generateSearchRefinement(
  searchRun: SearchRun,
  jobProfile: JobProfile,
  dependencies: GenerateSearchRefinementDependencies,
): Promise<SearchRefinementSuggestion> {
  if (searchRun.status !== "Completed") {
    throw new DomainError("Search refinement requires a completed search run.");
  }

  const assessedCandidates = searchRun.candidates.filter((candidate) => candidate.matchAssessment);
  if (assessedCandidates.length === 0) {
    throw new DomainError("Search refinement requires at least one assessed candidate.");
  }

  const recommended = assessedCandidates.filter(
    (candidate) => candidate.matchAssessment?.recommendation === "推荐",
  );
  const eliminated = searchRun.candidates.filter(
    (candidate) =>
      candidate.status === "HardRejected" || candidate.matchAssessment?.recommendation === "不推荐",
  );

  const startedAt = Date.now();
  let draft: SearchRefinementSuggestion | undefined;
  let failure: unknown;
  try {
    const normalized = normalizeSearchRefinement(
      await dependencies.refinementAI.suggestRefinement({ jobProfile, recommended, eliminated }),
    );
    draft = {
      ...normalized,
      id: dependencies.idGenerator?.() ?? crypto.randomUUID(),
      searchRunId: searchRun.id,
      jobProfileId: jobProfile.id,
      jobProfileVersionId: searchRun.jobProfileVersionId,
      analysisSnapshot: {
        recommendedCount: recommended.length,
        eliminatedCount: eliminated.length,
        recommendedTraits: collectTraits(recommended),
        eliminatedTraits: collectTraits(eliminated),
      },
      provider: dependencies.refinementAI.providerName ?? "unknown",
      model: dependencies.refinementAI.modelName ?? "unknown",
      promptVersion: SEARCH_REFINEMENT_PROMPT_VERSION,
      agentVersion: SEARCH_REFINEMENT_AGENT_VERSION,
      createdAt: new Date(),
    };
  } catch (error) {
    failure = error;
  }

  await recordRefinementAudit(searchRun, jobProfile, recommended, eliminated, draft, Date.now() - startedAt, failure, dependencies);

  if (failure || !draft) {
    throw failure instanceof Error ? failure : new DomainError("Search refinement failed.");
  }

  return dependencies.suggestions.save(draft);
}

function collectTraits(candidates: CandidateResult[]): string[] {
  const frequency = new Map<string, number>();
  for (const candidate of candidates) {
    for (const keyword of candidate.resume.keywords) {
      const normalized = keyword.trim();
      if (!normalized) continue;
      frequency.set(normalized, (frequency.get(normalized) ?? 0) + 1);
    }
  }
  return [...frequency.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([keyword]) => keyword);
}

async function recordRefinementAudit(
  searchRun: SearchRun,
  jobProfile: JobProfile,
  recommended: CandidateResult[],
  eliminated: CandidateResult[],
  suggestion: SearchRefinementSuggestion | undefined,
  durationMs: number,
  failure: unknown,
  dependencies: GenerateSearchRefinementDependencies,
): Promise<void> {
  if (!dependencies.aiAssessmentAudit) {
    return;
  }

  const candidates = [...recommended, ...eliminated];
  await dependencies.aiAssessmentAudit.record({
    id: dependencies.auditIdGenerator?.() ?? crypto.randomUUID(),
    searchRunId: searchRun.id,
    jobProfileId: jobProfile.id,
    jobProfileVersionId: searchRun.jobProfileVersionId,
    agentType: "search-refinement",
    provider: dependencies.refinementAI.providerName ?? "unknown",
    model: dependencies.refinementAI.modelName ?? "unknown",
    promptVersion: SEARCH_REFINEMENT_PROMPT_VERSION,
    agentVersion: SEARCH_REFINEMENT_AGENT_VERSION,
    graphVersion: dependencies.refinementAI.graphVersion,
    prompt: createSearchRefinementPrompt(jobProfile, recommended, eliminated),
    candidateIds: candidates.map((candidate) => candidate.id),
    inputSnapshot: {
      jobProfile: {
        id: jobProfile.id,
        title: jobProfile.title,
        searchCondition: jobProfile.searchCondition,
        hardRequirements: jobProfile.hardRequirements,
        softRequirements: jobProfile.softRequirements,
        negativeSignals: jobProfile.negativeSignals,
      },
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        fingerprint: candidate.fingerprint,
        resume: candidate.resume,
      })),
    },
    outputSnapshot: [],
    durationMs,
    status: failure ? "failure" : "success",
    errorType: failure instanceof Error ? failure.name : failure ? "UnknownError" : undefined,
    errorMessage: failure instanceof Error ? failure.message : failure ? "Unknown refinement error." : undefined,
    createdAt: new Date(),
  });
}
