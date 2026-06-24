import { z } from "zod";
import type { AIAssessmentPort } from "../../application/ports.js";
import { HttpAIAssessment } from "../http/http-ai-assessment.js";
import { LangGraphOpenAIAssessment, type LangGraphOpenAIAssessmentOptions } from "../langgraph/langgraph-openai-ai-assessment.js";
import { MockAIAssessment } from "../mock/mock-ai-assessment.js";

const aiAssessmentEnvSchema = z.discriminatedUnion("AI_ASSESSMENT_PROVIDER", [
  z.object({
    AI_ASSESSMENT_PROVIDER: z.literal("mock"),
  }),
  z.object({
    AI_ASSESSMENT_PROVIDER: z.literal("http"),
    AI_ASSESSMENT_ENDPOINT: z.string().min(1),
    AI_ASSESSMENT_API_KEY: z.string().optional(),
    AI_ASSESSMENT_PROVIDER_NAME: z.string().min(1).optional(),
    AI_ASSESSMENT_MODEL: z.string().min(1).optional(),
    AI_ASSESSMENT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  }),
  z.object({
    AI_ASSESSMENT_PROVIDER: z.literal("langgraph-openai"),
    OPENAI_API_KEY: z.string().min(1),
    AI_ASSESSMENT_MODEL: z.string().min(1),
    AI_ASSESSMENT_TEMPERATURE: z.coerce.number().min(0).max(2),
    AI_ASSESSMENT_MAX_RETRIES: z.coerce.number().int().min(0).max(10),
    AI_ASSESSMENT_TIMEOUT_MS: z.coerce.number().int().positive(),
  }),
]);

export type AIAssessmentEnvironment = NodeJS.ProcessEnv;

export interface AIAssessmentFactoryOverrides {
  createLangGraphOpenAI?: (options: LangGraphOpenAIAssessmentOptions) => AIAssessmentPort;
}

export function createAIAssessmentFromEnv(
  env: AIAssessmentEnvironment,
  overrides?: AIAssessmentFactoryOverrides,
): AIAssessmentPort {
  const provider = env.AI_ASSESSMENT_PROVIDER ?? "mock";
  const parsed = aiAssessmentEnvSchema.safeParse({
    ...env,
    AI_ASSESSMENT_PROVIDER: provider,
  });

  if (!parsed.success) {
    throw new Error(`Invalid AI assessment environment: ${parsed.error.message}`);
  }

  switch (parsed.data.AI_ASSESSMENT_PROVIDER) {
    case "mock":
      return new MockAIAssessment();
    case "http":
      return new HttpAIAssessment({
        endpoint: parsed.data.AI_ASSESSMENT_ENDPOINT,
        apiKey: parsed.data.AI_ASSESSMENT_API_KEY,
        providerName: parsed.data.AI_ASSESSMENT_PROVIDER_NAME ?? "http",
        modelName: parsed.data.AI_ASSESSMENT_MODEL ?? "external-ai-assessment",
        timeoutMs: parsed.data.AI_ASSESSMENT_TIMEOUT_MS,
      });
    case "langgraph-openai":
      const options = {
        apiKey: parsed.data.OPENAI_API_KEY,
        modelName: parsed.data.AI_ASSESSMENT_MODEL,
        temperature: parsed.data.AI_ASSESSMENT_TEMPERATURE,
        maxRetries: parsed.data.AI_ASSESSMENT_MAX_RETRIES,
        timeoutMs: parsed.data.AI_ASSESSMENT_TIMEOUT_MS,
      };
      return overrides?.createLangGraphOpenAI
        ? overrides.createLangGraphOpenAI(options)
        : new LangGraphOpenAIAssessment(options);
  }
}
