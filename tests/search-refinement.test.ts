import assert from "node:assert/strict";
import test from "node:test";
import {
  SEARCH_REFINEMENT_PROMPT_VERSION,
  normalizeSearchRefinement,
} from "../src/domain/search-refinement-contract.js";
import { generateSearchRefinement } from "../src/application/generate-search-refinement.js";
import { DomainError } from "../src/domain/errors.js";
import { MockSearchRefinement } from "../src/infrastructure/mock/mock-search-refinement.js";
import { LangGraphOpenAISearchRefinement } from "../src/infrastructure/langgraph/langgraph-openai-search-refinement.js";
import { createSearchRefinementFromEnv } from "../src/infrastructure/ai/create-search-refinement.js";
import {
  InMemoryAIAssessmentAuditSink,
  InMemorySearchRefinementSuggestionRepository,
} from "../src/infrastructure/memory/in-memory-repositories.js";
import type { CandidateResult, JobProfile, MatchAssessment, SearchRun } from "../src/domain/types.js";
import { createConfirmedJobProfile, createMatchAssessment } from "./fixtures.js";

function candidate(
  id: string,
  status: CandidateResult["status"],
  keywords: string[],
  assessment?: MatchAssessment,
): CandidateResult {
  return {
    id,
    fingerprint: id,
    jobProfileId: "job-1",
    searchRunId: "run-refine",
    status,
    resume: {
      name: id,
      title: "顾问",
      city: "上海",
      educationLevel: "本科",
      yearsOfExperience: 8,
      industries: ["企业服务"],
      keywords,
      summary: "摘要",
    },
    intent: "高",
    activityLevel: "高",
    sourceLead: {
      platform: "MockPlatform",
      url: `https://example.test/${id}`,
      searchContext: "关键词",
      fallbackClues: ["线索"],
    },
    hardRejectReasons: status === "HardRejected" ? ["学历不满足"] : [],
    matchAssessment: assessment,
  };
}

function completedRun(candidates: CandidateResult[]): SearchRun {
  return {
    id: "run-refine",
    jobProfileId: "job-1",
    jobProfileVersionId: "job-1-v1",
    status: "Completed",
    targetResultCount: 10,
    rawSubmittedCount: candidates.length,
    candidates,
    events: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function profile(): JobProfile {
  return { ...createConfirmedJobProfile(), currentVersionId: "job-1-v1" };
}

test("搜索建议契约拒绝空 reasoning 和空关键词并去重", () => {
  const base = {
    suggestedSearchCondition: {
      keywords: [" 解决方案 ", "解决方案", "售前"],
      cities: [],
      industries: [],
      educationLevels: [],
    },
    addedKeywords: ["售前", "售前"],
    droppedKeywords: [],
    reasoning: " 依据词频对比。 ",
  };

  const normalized = normalizeSearchRefinement(base);
  assert.deepEqual(normalized.suggestedSearchCondition.keywords, ["解决方案", "售前"]);
  assert.deepEqual(normalized.addedKeywords, ["售前"]);
  assert.equal(normalized.reasoning, "依据词频对比。");

  assert.throws(() => normalizeSearchRefinement({ ...base, reasoning: " " }), DomainError);
  assert.throws(
    () =>
      normalizeSearchRefinement({
        ...base,
        suggestedSearchCondition: { ...base.suggestedSearchCondition, keywords: [" "] },
      }),
    DomainError,
  );
});

test("Mock 词频启发式产出确定性的新增与移除建议", async () => {
  const jobProfile = profile();
  const recommended = [
    candidate("rec-1", "Displayable", ["售前方案", "企业服务"], createMatchAssessment({ recommendation: "推荐" })),
    candidate("rec-2", "Displayable", ["售前方案", "企业服务"], createMatchAssessment({ recommendation: "推荐" })),
  ];
  const eliminated = [
    candidate("elim-1", "HardRejected", ["客户成功", "电话销售"]),
  ];

  const draft = await new MockSearchRefinement().suggestRefinement({ jobProfile, recommended, eliminated });

  assert.equal(draft.addedKeywords.includes("售前方案"), true);
  assert.equal(draft.addedKeywords.includes("客户成功"), false);
  assert.deepEqual(draft.droppedKeywords, ["客户成功"]);
  assert.equal(draft.suggestedSearchCondition.keywords.includes("解决方案"), true);
  assert.equal(draft.suggestedSearchCondition.keywords.includes("客户成功"), false);
  assert.match(draft.reasoning, /词频对比/);
});

test("推荐组为空时 Mock 仍产出过宽或过窄结论", async () => {
  const draft = await new MockSearchRefinement().suggestRefinement({
    jobProfile: profile(),
    recommended: [],
    eliminated: [candidate("elim-1", "HardRejected", ["电话销售"])],
  });

  assert.match(draft.reasoning, /过宽或过窄/);
  assert.ok(draft.suggestedSearchCondition.keywords.length >= 1);
});

test("生成服务分组正确、落库并写入 search-refinement 审计", async () => {
  const suggestions = new InMemorySearchRefinementSuggestionRepository();
  const audits = new InMemoryAIAssessmentAuditSink();
  const run = completedRun([
    candidate("rec-1", "Displayable", ["售前方案"], createMatchAssessment({ recommendation: "推荐" })),
    candidate("pending-1", "Displayable", ["中性词"], createMatchAssessment({ recommendation: "待定", score: 70 })),
    candidate("no-1", "Displayable", ["电话销售"], createMatchAssessment({ recommendation: "不推荐", score: 40 })),
    candidate("hard-1", "HardRejected", ["电话销售"]),
  ]);

  const suggestion = await generateSearchRefinement(run, profile(), {
    refinementAI: new MockSearchRefinement(),
    suggestions,
    aiAssessmentAudit: audits,
    idGenerator: () => "suggestion-1",
    auditIdGenerator: () => "audit-1",
  });

  assert.equal(suggestion.id, "suggestion-1");
  assert.equal(suggestion.jobProfileVersionId, "job-1-v1");
  assert.equal(suggestion.analysisSnapshot.recommendedCount, 1);
  assert.equal(suggestion.analysisSnapshot.eliminatedCount, 2);
  assert.equal(suggestion.promptVersion, SEARCH_REFINEMENT_PROMPT_VERSION);

  const stored = await suggestions.findBySearchRunId("run-refine");
  assert.equal(stored.length, 1);

  const [audit] = await audits.findBySearchRunId("run-refine");
  assert.equal(audit?.agentType, "search-refinement");
  assert.equal(audit?.status, "success");
  // 待定候选人不参与对比
  assert.equal(audit?.candidateIds.includes("pending-1"), false);
  assert.deepEqual(audit?.candidateIds, ["rec-1", "no-1", "hard-1"]);
});

test("生成服务拒绝未完成或未评估的 SearchRun", async () => {
  const deps = {
    refinementAI: new MockSearchRefinement(),
    suggestions: new InMemorySearchRefinementSuggestionRepository(),
  };

  await assert.rejects(
    () => generateSearchRefinement({ ...completedRun([]), status: "Running" }, profile(), deps),
    DomainError,
  );
  await assert.rejects(
    () => generateSearchRefinement(completedRun([candidate("hard-1", "HardRejected", [])]), profile(), deps),
    DomainError,
  );
});

test("LangGraph 建议 prompt 注入对比指令与排除信号", async () => {
  let capturedPrompt = "";
  const adapter = new LangGraphOpenAISearchRefinement({
    apiKey: "test-key",
    modelName: "test-model",
    temperature: 0,
    maxRetries: 0,
    timeoutMs: 1_000,
    structuredModel: {
      invoke: async (prompt: string) => {
        capturedPrompt = prompt;
        return {
          suggestedSearchCondition: { keywords: ["售前方案"], cities: [], industries: [], educationLevels: [] },
          addedKeywords: ["售前方案"],
          droppedKeywords: [],
          reasoning: "推荐组高频。",
        };
      },
    },
  });

  const jobProfile: JobProfile = { ...profile(), negativeSignals: ["频繁跳槽"] };
  const draft = await adapter.suggestRefinement({
    jobProfile,
    recommended: [candidate("rec-1", "Displayable", ["售前方案"], createMatchAssessment({ recommendation: "推荐" }))],
    eliminated: [candidate("hard-1", "HardRejected", ["电话销售"])],
  });

  assert.deepEqual(draft.addedKeywords, ["售前方案"]);
  const parsed = JSON.parse(capturedPrompt) as {
    instruction: string;
    jobProfile: { negativeSignals: string[] };
    eliminated: Array<{ hardRejectReasons: string[] }>;
  };
  assert.match(parsed.instruction, /推荐候选人/);
  assert.deepEqual(parsed.jobProfile.negativeSignals, ["频繁跳槽"]);
  assert.deepEqual(parsed.eliminated[0]?.hardRejectReasons, ["学历不满足"]);
});

test("搜索建议工厂按 env 装配 provider", () => {
  assert.equal(createSearchRefinementFromEnv({} as NodeJS.ProcessEnv).providerName, "mock");

  assert.throws(
    () =>
      createSearchRefinementFromEnv({
        SEARCH_REFINEMENT_PROVIDER: "langgraph-openai",
      } as NodeJS.ProcessEnv),
    /Invalid search refinement environment/,
  );

  let capturedModel = "";
  const adapter = createSearchRefinementFromEnv(
    {
      SEARCH_REFINEMENT_PROVIDER: "langgraph-openai",
      OPENAI_API_KEY: "key",
      SEARCH_REFINEMENT_MODEL: "gpt-test",
      SEARCH_REFINEMENT_TEMPERATURE: "0",
      SEARCH_REFINEMENT_MAX_RETRIES: "1",
      SEARCH_REFINEMENT_TIMEOUT_MS: "1000",
    } as NodeJS.ProcessEnv,
    {
      createLangGraphOpenAI: (options) => {
        capturedModel = options.modelName;
        return new MockSearchRefinement();
      },
    },
  );
  assert.equal(adapter.providerName, "mock");
  assert.equal(capturedModel, "gpt-test");
});
