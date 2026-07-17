import { z } from "zod";
import type { SearchRefinementPort } from "../../application/ports.js";
import {
  LangGraphOpenAISearchRefinement,
  type LangGraphOpenAISearchRefinementOptions,
} from "../langgraph/langgraph-openai-search-refinement.js";
import { MockSearchRefinement } from "../mock/mock-search-refinement.js";

const searchRefinementEnvSchema = z.discriminatedUnion("SEARCH_REFINEMENT_PROVIDER", [
  z.object({
    SEARCH_REFINEMENT_PROVIDER: z.literal("mock"),
  }),
  z.object({
    SEARCH_REFINEMENT_PROVIDER: z.literal("langgraph-openai"),
    OPENAI_API_KEY: z.string().min(1),
    SEARCH_REFINEMENT_MODEL: z.string().min(1),
    SEARCH_REFINEMENT_TEMPERATURE: z.coerce.number().min(0).max(2),
    SEARCH_REFINEMENT_MAX_RETRIES: z.coerce.number().int().min(0).max(10),
    SEARCH_REFINEMENT_TIMEOUT_MS: z.coerce.number().int().positive(),
  }),
]);

export interface SearchRefinementFactoryOverrides {
  createLangGraphOpenAI?: (options: LangGraphOpenAISearchRefinementOptions) => SearchRefinementPort;
}

export function createSearchRefinementFromEnv(
  env: NodeJS.ProcessEnv,
  overrides?: SearchRefinementFactoryOverrides,
): SearchRefinementPort {
  const provider = env.SEARCH_REFINEMENT_PROVIDER ?? "mock";
  const parsed = searchRefinementEnvSchema.safeParse({
    ...env,
    SEARCH_REFINEMENT_PROVIDER: provider,
  });

  if (!parsed.success) {
    throw new Error(`Invalid search refinement environment: ${parsed.error.message}`);
  }

  switch (parsed.data.SEARCH_REFINEMENT_PROVIDER) {
    case "mock":
      return new MockSearchRefinement();
    case "langgraph-openai": {
      const options = {
        apiKey: parsed.data.OPENAI_API_KEY,
        modelName: parsed.data.SEARCH_REFINEMENT_MODEL,
        temperature: parsed.data.SEARCH_REFINEMENT_TEMPERATURE,
        maxRetries: parsed.data.SEARCH_REFINEMENT_MAX_RETRIES,
        timeoutMs: parsed.data.SEARCH_REFINEMENT_TIMEOUT_MS,
      };
      return overrides?.createLangGraphOpenAI
        ? overrides.createLangGraphOpenAI(options)
        : new LangGraphOpenAISearchRefinement(options);
    }
  }
}
