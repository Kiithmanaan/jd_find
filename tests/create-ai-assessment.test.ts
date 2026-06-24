import assert from "node:assert/strict";
import test from "node:test";
import type { AIAssessmentPort } from "../src/application/ports.js";
import type { MatchAssessment } from "../src/domain/types.js";
import { createAIAssessmentFromEnv } from "../src/infrastructure/ai/create-ai-assessment.js";

test("createAIAssessmentFromEnv creates mock provider by default", () => {
  const aiAssessment = createAIAssessmentFromEnv({});

  assert.equal(aiAssessment.providerName, "mock");
});

test("createAIAssessmentFromEnv creates HTTP provider", () => {
  const aiAssessment = createAIAssessmentFromEnv({
    AI_ASSESSMENT_PROVIDER: "http",
    AI_ASSESSMENT_ENDPOINT: "https://ai.example.test/assess",
    AI_ASSESSMENT_PROVIDER_NAME: "test-http",
    AI_ASSESSMENT_MODEL: "test-model",
    AI_ASSESSMENT_TIMEOUT_MS: "1000",
  });

  assert.equal(aiAssessment.providerName, "test-http");
  assert.equal(aiAssessment.modelName, "test-model");
});

test("createAIAssessmentFromEnv creates LangGraph OpenAI provider", () => {
  const aiAssessment = createAIAssessmentFromEnv({
    AI_ASSESSMENT_PROVIDER: "langgraph-openai",
    OPENAI_API_KEY: "test-key",
    AI_ASSESSMENT_MODEL: "gpt-test",
    AI_ASSESSMENT_TEMPERATURE: "0",
    AI_ASSESSMENT_MAX_RETRIES: "2",
    AI_ASSESSMENT_TIMEOUT_MS: "30000",
  }, {
    createLangGraphOpenAI: (options): AIAssessmentPort => ({
      providerName: "langgraph-openai",
      modelName: options.modelName,
      graphVersion: "match-assessment-graph-v1",
      assessCandidates: async (): Promise<Map<string, MatchAssessment>> => new Map<string, MatchAssessment>(),
    }),
  });

  assert.equal(aiAssessment.providerName, "langgraph-openai");
  assert.equal(aiAssessment.modelName, "gpt-test");
  assert.equal(aiAssessment.graphVersion, "match-assessment-graph-v1");
});

test("createAIAssessmentFromEnv rejects invalid LangGraph OpenAI config", () => {
  assert.throws(
    () =>
      createAIAssessmentFromEnv({
        AI_ASSESSMENT_PROVIDER: "langgraph-openai",
        AI_ASSESSMENT_MODEL: "gpt-test",
        AI_ASSESSMENT_TEMPERATURE: "0",
        AI_ASSESSMENT_MAX_RETRIES: "2",
        AI_ASSESSMENT_TIMEOUT_MS: "30000",
      }),
    /Invalid AI assessment environment/,
  );
});
