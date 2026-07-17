import type { SearchRefinementPort } from "../../application/ports.js";
import type { SearchRefinementDraft } from "../../domain/search-refinement-contract.js";
import type { CandidateResult, JobProfile } from "../../domain/types.js";

const MAX_ADDED_KEYWORDS = 5;

/**
 * 确定性词频启发式：推荐组简历关键词频次减去淘汰组频次，
 * 净得分为正且不在当前搜索条件里的词作为新增建议；
 * 当前关键词在淘汰组高频且推荐组缺席时建议移除。
 * 本身即可用 baseline，也便于测试断言。
 */
export class MockSearchRefinement implements SearchRefinementPort {
  readonly providerName = "mock";
  readonly modelName = "mock-search-refinement-v1";

  async suggestRefinement(input: {
    jobProfile: JobProfile;
    recommended: CandidateResult[];
    eliminated: CandidateResult[];
  }): Promise<SearchRefinementDraft> {
    const recommendedFrequency = countKeywords(input.recommended);
    const eliminatedFrequency = countKeywords(input.eliminated);
    const currentKeywords = input.jobProfile.searchCondition.keywords;

    const addedKeywords = [...recommendedFrequency.entries()]
      .map(([keyword, count]) => ({ keyword, score: count - (eliminatedFrequency.get(keyword) ?? 0) }))
      .filter((entry) => entry.score > 0 && !currentKeywords.includes(entry.keyword))
      .sort((left, right) => right.score - left.score || left.keyword.localeCompare(right.keyword))
      .slice(0, MAX_ADDED_KEYWORDS)
      .map((entry) => entry.keyword);

    const droppedKeywords = currentKeywords.filter(
      (keyword) => !recommendedFrequency.has(keyword) && (eliminatedFrequency.get(keyword) ?? 0) > 0,
    );

    const suggestedKeywords = currentKeywords
      .filter((keyword) => !droppedKeywords.includes(keyword))
      .concat(addedKeywords);

    return {
      suggestedSearchCondition: {
        ...input.jobProfile.searchCondition,
        keywords: suggestedKeywords.length > 0 ? suggestedKeywords : currentKeywords,
      },
      addedKeywords,
      droppedKeywords,
      reasoning: buildReasoning(input.recommended.length, input.eliminated.length, addedKeywords, droppedKeywords),
    };
  }
}

function countKeywords(candidates: CandidateResult[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const candidate of candidates) {
    for (const keyword of candidate.resume.keywords) {
      const normalized = keyword.trim();
      if (!normalized) continue;
      frequency.set(normalized, (frequency.get(normalized) ?? 0) + 1);
    }
  }
  return frequency;
}

function buildReasoning(
  recommendedCount: number,
  eliminatedCount: number,
  addedKeywords: string[],
  droppedKeywords: string[],
): string {
  const parts = [`基于 ${recommendedCount} 个推荐候选人与 ${eliminatedCount} 个淘汰候选人的关键词词频对比。`];
  if (addedKeywords.length > 0) {
    parts.push(`推荐组高频且当前搜索条件未覆盖：${addedKeywords.join("、")}。`);
  }
  if (droppedKeywords.length > 0) {
    parts.push(`仅在淘汰组出现的现有关键词建议移除：${droppedKeywords.join("、")}。`);
  }
  if (addedKeywords.length === 0 && droppedKeywords.length === 0) {
    parts.push(
      recommendedCount === 0
        ? "推荐组为空：当前关键词可能过宽或过窄，建议先复核硬性条件与软性条件设置。"
        : "当前关键词与推荐候选人特征一致，暂无调整建议。",
    );
  }
  return parts.join("");
}
