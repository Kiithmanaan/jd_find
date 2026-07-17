import { z } from "zod";
import type { ClarificationInterviewPort } from "../../application/ports.js";
import {
  LangGraphOpenAIClarificationInterview,
  type LangGraphOpenAIClarificationInterviewOptions,
} from "../langgraph/langgraph-openai-clarification-interview.js";
import { MockClarificationInterview } from "../mock/mock-clarification-interview.js";

const clarificationInterviewEnvSchema = z.discriminatedUnion("CLARIFICATION_INTERVIEW_PROVIDER", [
  z.object({
    CLARIFICATION_INTERVIEW_PROVIDER: z.literal("mock"),
  }),
  z.object({
    CLARIFICATION_INTERVIEW_PROVIDER: z.literal("langgraph-openai"),
    OPENAI_API_KEY: z.string().min(1),
    CLARIFICATION_INTERVIEW_MODEL: z.string().min(1),
    CLARIFICATION_INTERVIEW_TEMPERATURE: z.coerce.number().min(0).max(2),
    CLARIFICATION_INTERVIEW_MAX_RETRIES: z.coerce.number().int().min(0).max(10),
    CLARIFICATION_INTERVIEW_TIMEOUT_MS: z.coerce.number().int().positive(),
  }),
]);

export interface ClarificationInterviewFactoryOverrides {
  createLangGraphOpenAI?: (
    options: LangGraphOpenAIClarificationInterviewOptions,
  ) => ClarificationInterviewPort;
}

export function createClarificationInterviewFromEnv(
  env: NodeJS.ProcessEnv,
  overrides?: ClarificationInterviewFactoryOverrides,
): ClarificationInterviewPort {
  const provider = env.CLARIFICATION_INTERVIEW_PROVIDER ?? "mock";
  const parsed = clarificationInterviewEnvSchema.safeParse({
    ...env,
    CLARIFICATION_INTERVIEW_PROVIDER: provider,
  });

  if (!parsed.success) {
    throw new Error(`Invalid clarification interview environment: ${parsed.error.message}`);
  }

  switch (parsed.data.CLARIFICATION_INTERVIEW_PROVIDER) {
    case "mock":
      return new MockClarificationInterview();
    case "langgraph-openai": {
      const options = {
        apiKey: parsed.data.OPENAI_API_KEY,
        modelName: parsed.data.CLARIFICATION_INTERVIEW_MODEL,
        temperature: parsed.data.CLARIFICATION_INTERVIEW_TEMPERATURE,
        maxRetries: parsed.data.CLARIFICATION_INTERVIEW_MAX_RETRIES,
        timeoutMs: parsed.data.CLARIFICATION_INTERVIEW_TIMEOUT_MS,
      };
      return overrides?.createLangGraphOpenAI
        ? overrides.createLangGraphOpenAI(options)
        : new LangGraphOpenAIClarificationInterview(options);
    }
  }
}
