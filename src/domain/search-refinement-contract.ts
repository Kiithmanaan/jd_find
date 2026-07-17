import { DomainError } from "./errors.js";
import type { CandidateResult, Identifier, JobProfile, SearchCondition } from "./types.js";

export const SEARCH_REFINEMENT_PROMPT_VERSION = "search-refinement-v1";
export const SEARCH_REFINEMENT_AGENT_VERSION = "jd-search-refinement-v1";

/** AI 产出的搜索条件建议草稿（未落库）。 */
export interface SearchRefinementDraft {
  suggestedSearchCondition: SearchCondition;
  addedKeywords: string[];
  droppedKeywords: string[];
  reasoning: string;
}

export interface SearchRefinementAnalysisSnapshot {
  recommendedCount: number;
  eliminatedCount: number;
  recommendedTraits: string[];
  eliminatedTraits: string[];
}

/** 落库的搜索条件建议记录。 */
export interface SearchRefinementSuggestion extends SearchRefinementDraft {
  id: Identifier;
  searchRunId: Identifier;
  jobProfileId: Identifier;
  jobProfileVersionId: Identifier;
  analysisSnapshot: SearchRefinementAnalysisSnapshot;
  provider: string;
  model: string;
  promptVersion: string;
  agentVersion: string;
  createdAt: Date;
}

export function normalizeSearchRefinement(draft: SearchRefinementDraft): SearchRefinementDraft {
  const reasoning = draft.reasoning.trim();
  const addedKeywords = normalizeKeywordList(draft.addedKeywords);
  const droppedKeywords = normalizeKeywordList(draft.droppedKeywords);
  const suggestedKeywords = normalizeKeywordList(draft.suggestedSearchCondition.keywords);

  if (!reasoning) {
    throw new DomainError("Search refinement must include reasoning.");
  }
  if (suggestedKeywords.length === 0) {
    throw new DomainError("Search refinement suggested search condition must include at least one keyword.");
  }

  return {
    suggestedSearchCondition: {
      ...draft.suggestedSearchCondition,
      keywords: suggestedKeywords,
    },
    addedKeywords,
    droppedKeywords,
    reasoning,
  };
}

export function createSearchRefinementPrompt(
  jobProfile: JobProfile,
  recommended: CandidateResult[],
  eliminated: CandidateResult[],
): string {
  return JSON.stringify({
    task: "search-refinement",
    promptVersion: SEARCH_REFINEMENT_PROMPT_VERSION,
    jobProfileVersionId: jobProfile.currentVersionId,
    jobProfile: {
      title: jobProfile.title,
      searchCondition: jobProfile.searchCondition,
      negativeSignals: jobProfile.negativeSignals,
    },
    recommendedCandidateIds: recommended.map((candidate) => candidate.id),
    eliminatedCandidateIds: eliminated.map((candidate) => candidate.id),
  });
}

function normalizeKeywordList(keywords: string[]): string[] {
  const normalized = keywords.map((keyword) => keyword.trim()).filter(Boolean);
  return normalized.filter((keyword, index) => normalized.indexOf(keyword) === index);
}
