import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../src/domain/errors.js";
import {
  acquireCandidateResults,
  applyHardFilter,
  createSearchRun,
  deduplicateWithinSearchRun,
  startSearchRun,
} from "../src/domain/search-run.js";
import {
  LangGraphOpenAIAssessment,
  MATCH_ASSESSMENT_GRAPH_VERSION,
  parseLangGraphAssessmentResponse,
  type LangGraphAssessmentGraph,
  type LangGraphAssessmentState,
} from "../src/infrastructure/langgraph/langgraph-openai-ai-assessment.js";
import { createCandidateDrafts, createConfirmedJobProfile } from "./fixtures.js";

test("LangGraphOpenAIAssessment maps structured graph output", async () => {
  const jobProfile = createConfirmedJobProfile();
  const hardPassedCandidates = createHardPassedCandidates();
  const adapter = new LangGraphOpenAIAssessment({
    apiKey: "test-key",
    modelName: "test-model",
    temperature: 0,
    maxRetries: 0,
    timeoutMs: 1_000,
    graph: createFakeGraph({
      assessments: hardPassedCandidates.map((candidate) => ({
        candidateId: candidate.id,
        score: 91,
        recommendation: "推荐",
        recommendationReason: "候选人与岗位画像匹配。",
        matchedPoints: ["具备复杂项目推动相关经历"],
        unmatchedPoints: [],
        riskPoints: ["需要人工确认意向"],
        trace: "根据候选人摘要和岗位画像评估。",
      })),
    }),
  });

  const assessments = await adapter.assessCandidates(jobProfile, hardPassedCandidates);
  const [candidate] = hardPassedCandidates;

  assert.equal(adapter.providerName, "langgraph-openai");
  assert.equal(adapter.modelName, "test-model");
  assert.equal(adapter.graphVersion, MATCH_ASSESSMENT_GRAPH_VERSION);
  assert.equal(assessments.get(candidate.id)?.score, 91);
  assert.equal(assessments.get(candidate.id)?.recommendation, "推荐");
});

test("LangGraphOpenAIAssessment rejects missing and out-of-scope candidates", async () => {
  const jobProfile = createConfirmedJobProfile();
  const hardPassedCandidates = createHardPassedCandidates();

  await assert.rejects(
    () =>
      new LangGraphOpenAIAssessment({
        apiKey: "test-key",
        modelName: "test-model",
        temperature: 0,
        maxRetries: 0,
        timeoutMs: 1_000,
        graph: createFakeGraph({ assessments: [] }),
      }).assessCandidates(jobProfile, hardPassedCandidates),
    DomainError,
  );

  await assert.rejects(
    () =>
      new LangGraphOpenAIAssessment({
        apiKey: "test-key",
        modelName: "test-model",
        temperature: 0,
        maxRetries: 0,
        timeoutMs: 1_000,
        graph: createFakeGraph({
          assessments: [
            {
              candidateId: "outside-candidate",
              score: 91,
              recommendation: "推荐",
              recommendationReason: "候选人与岗位画像匹配。",
              matchedPoints: ["具备复杂项目推动相关经历"],
              unmatchedPoints: [],
              riskPoints: [],
              trace: "根据候选人摘要和岗位画像评估。",
            },
          ],
        }),
      }).assessCandidates(jobProfile, hardPassedCandidates),
    DomainError,
  );
});

test("parseLangGraphAssessmentResponse rejects invalid structured model output", () => {
  assert.throws(
    () =>
      parseLangGraphAssessmentResponse({
      assessments: [
        {
          candidateId: "candidate-1",
          score: 91,
          recommendation: "强烈推荐",
          recommendationReason: "候选人与岗位画像匹配。",
          matchedPoints: [],
          unmatchedPoints: [],
          riskPoints: [],
          trace: "根据候选人摘要和岗位画像评估。",
        },
      ],
      }),
    /Invalid enum value/,
  );
});

test("LangGraphOpenAIAssessment model errors omit resume content", async () => {
  const jobProfile = createConfirmedJobProfile();
  const hardPassedCandidates = createHardPassedCandidates();
  const adapter = new LangGraphOpenAIAssessment({
    apiKey: "test-key",
    modelName: "test-model",
    temperature: 0,
    maxRetries: 0,
    timeoutMs: 1_000,
    graph: {
      invoke: async () => {
        throw new Error("upstream unavailable");
      },
    },
  });

  await assert.rejects(
    () => adapter.assessCandidates(jobProfile, hardPassedCandidates),
    (error: unknown) => {
      assert.equal(error instanceof DomainError, true);
      assert.match((error as Error).message, /LangGraph AI assessment failed/);
      assert.doesNotMatch((error as Error).message, /复杂项目推动/);
      return true;
    },
  );
});

function createFakeGraph(
  response: Pick<LangGraphAssessmentState, "assessments">,
): LangGraphAssessmentGraph {
  return {
    invoke: async (state: LangGraphAssessmentState): Promise<LangGraphAssessmentState> => ({
      ...state,
      assessments: response.assessments,
      nodeTrace: ["buildPrompt", "callModel", "parseAssessments", "mapToDomain"],
    }),
  };
}

function createHardPassedCandidates() {
  const jobProfile = createConfirmedJobProfile();
  let searchRun = startSearchRun(
    createSearchRun(jobProfile, "langgraph-run", {
      targetResultCount: undefined,
      ownerId: undefined,
    }),
  );
  searchRun = acquireCandidateResults(searchRun, jobProfile, createCandidateDrafts().slice(0, 1));
  searchRun = deduplicateWithinSearchRun(searchRun);
  searchRun = applyHardFilter(searchRun, jobProfile);
  return searchRun.candidates.filter((candidate) => candidate.status === "HardPassed");
}
