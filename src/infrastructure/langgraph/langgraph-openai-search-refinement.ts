import { createRequire } from "node:module";
import { z } from "zod";
import type { SearchRefinementPort } from "../../application/ports.js";
import {
  SEARCH_REFINEMENT_PROMPT_VERSION,
  type SearchRefinementDraft,
} from "../../domain/search-refinement-contract.js";
import { DomainError } from "../../domain/errors.js";
import type { CandidateResult, JobProfile } from "../../domain/types.js";

export const SEARCH_REFINEMENT_GRAPH_VERSION = "search-refinement-graph-v1";

const refinementResponseSchema = z.object({
  suggestedSearchCondition: z.object({
    keywords: z.array(z.string()).min(1),
    cities: z.array(z.string()),
    industries: z.array(z.string()),
    educationLevels: z.array(z.string()),
    minYearsOfExperience: z.number().int().min(0).optional(),
  }),
  addedKeywords: z.array(z.string()),
  droppedKeywords: z.array(z.string()),
  reasoning: z.string().min(1),
});

export interface LangGraphRefinementState {
  jobProfile: Pick<JobProfile, "id" | "title" | "searchCondition" | "negativeSignals">;
  recommended: Array<Pick<CandidateResult, "id" | "resume">>;
  eliminated: Array<Pick<CandidateResult, "id" | "resume" | "hardRejectReasons">>;
  prompt: string;
  structuredResponse?: unknown;
  refinement?: SearchRefinementDraft;
  nodeTrace: string[];
}

export interface StructuredRefinementModel {
  invoke(input: string): Promise<unknown>;
}

interface StructuredChatModel {
  withStructuredOutput(schema: unknown, options: { name: string; method: string; strict: boolean }): StructuredRefinementModel;
}

export interface LangGraphRefinementGraph {
  invoke(input: LangGraphRefinementState): Promise<LangGraphRefinementState>;
}

interface AnnotationFunction {
  <ValueType>(): unknown;
  <ValueType, UpdateType>(annotation: {
    reducer: (left: ValueType, right: UpdateType) => ValueType;
    default: () => ValueType;
  }): unknown;
  Root(stateDefinition: Record<string, unknown>): unknown;
}

interface StateGraphBuilder {
  addNode(
    name: string,
    node: (state: LangGraphRefinementState) => Partial<LangGraphRefinementState> | Promise<Partial<LangGraphRefinementState>>,
  ): StateGraphBuilder;
  addEdge(start: string, end: string): StateGraphBuilder;
  compile(): LangGraphRefinementGraph;
}

interface LangGraphRuntime {
  Annotation: AnnotationFunction;
  START: string;
  END: string;
  StateGraph: new (state: unknown) => StateGraphBuilder;
}

interface OpenAIRuntime {
  ChatOpenAI: new (fields: {
    apiKey: string;
    model: string;
    temperature: number;
    maxRetries: number;
    timeout: number;
  }) => StructuredChatModel;
}

export interface LangGraphOpenAISearchRefinementOptions {
  apiKey: string;
  modelName: string;
  temperature: number;
  maxRetries: number;
  timeoutMs: number;
  graph?: LangGraphRefinementGraph;
  structuredModel?: StructuredRefinementModel;
}

export class LangGraphOpenAISearchRefinement implements SearchRefinementPort {
  readonly providerName = "langgraph-openai";
  readonly modelName: string;
  readonly graphVersion = SEARCH_REFINEMENT_GRAPH_VERSION;
  private readonly graph: LangGraphRefinementGraph;

  constructor(options: LangGraphOpenAISearchRefinementOptions) {
    this.modelName = options.modelName;
    this.graph = options.graph ?? createLangGraphRefinementGraph(options.structuredModel ?? createStructuredModel(options));
  }

  async suggestRefinement(input: {
    jobProfile: JobProfile;
    recommended: CandidateResult[];
    eliminated: CandidateResult[];
  }): Promise<SearchRefinementDraft> {
    const state = await invokeGraph(this.graph, {
      jobProfile: {
        id: input.jobProfile.id,
        title: input.jobProfile.title,
        searchCondition: input.jobProfile.searchCondition,
        negativeSignals: input.jobProfile.negativeSignals,
      },
      recommended: input.recommended.map((candidate) => ({ id: candidate.id, resume: candidate.resume })),
      eliminated: input.eliminated.map((candidate) => ({
        id: candidate.id,
        resume: candidate.resume,
        hardRejectReasons: candidate.hardRejectReasons,
      })),
      prompt: "",
      nodeTrace: [],
    });

    if (!state.refinement) {
      throw new DomainError("LangGraph search refinement produced no output.");
    }

    return state.refinement;
  }
}

export function createLangGraphRefinementGraph(
  structuredModel: StructuredRefinementModel,
): LangGraphRefinementGraph {
  const langGraphRuntime = loadLangGraphRuntime();
  const refinementState = langGraphRuntime.Annotation.Root({
    jobProfile: langGraphRuntime.Annotation<LangGraphRefinementState["jobProfile"]>(),
    recommended: langGraphRuntime.Annotation<LangGraphRefinementState["recommended"]>(),
    eliminated: langGraphRuntime.Annotation<LangGraphRefinementState["eliminated"]>(),
    prompt: langGraphRuntime.Annotation<string>(),
    structuredResponse: langGraphRuntime.Annotation<unknown>(),
    refinement: langGraphRuntime.Annotation<SearchRefinementDraft | undefined>(),
    nodeTrace: langGraphRuntime.Annotation<string[], string[]>({
      reducer: (left: string[], right: string[]) => left.concat(right),
      default: () => [],
    }),
  });

  const buildPrompt = (state: LangGraphRefinementState): Partial<LangGraphRefinementState> => ({
    prompt: createLangGraphRefinementPrompt(state),
    nodeTrace: ["buildPrompt"],
  });

  const callModel = async (state: LangGraphRefinementState): Promise<Partial<LangGraphRefinementState>> => {
    try {
      return {
        structuredResponse: await structuredModel.invoke(state.prompt),
        nodeTrace: ["callModel"],
      };
    } catch (error) {
      throw new DomainError(`LangGraph search refinement callModel failed. ${formatErrorMessage(error)}`);
    }
  };

  const parseRefinement = (state: LangGraphRefinementState): Partial<LangGraphRefinementState> => {
    if (state.structuredResponse === undefined) {
      throw new DomainError("LangGraph search refinement response was not produced by callModel node.");
    }

    return {
      refinement: refinementResponseSchema.parse(state.structuredResponse),
      nodeTrace: ["parseRefinement"],
    };
  };

  const mapToDomain = (state: LangGraphRefinementState): Partial<LangGraphRefinementState> => ({
    refinement: state.refinement,
    nodeTrace: ["mapToDomain"],
  });

  return new langGraphRuntime.StateGraph(refinementState)
    .addNode("buildPrompt", buildPrompt)
    .addNode("callModel", callModel)
    .addNode("parseRefinement", parseRefinement)
    .addNode("mapToDomain", mapToDomain)
    .addEdge(langGraphRuntime.START, "buildPrompt")
    .addEdge("buildPrompt", "callModel")
    .addEdge("callModel", "parseRefinement")
    .addEdge("parseRefinement", "mapToDomain")
    .addEdge("mapToDomain", langGraphRuntime.END)
    .compile();
}

export function createLangGraphRefinementPrompt(state: LangGraphRefinementState): string {
  return JSON.stringify({
    task: "search-refinement",
    promptVersion: SEARCH_REFINEMENT_PROMPT_VERSION,
    graphVersion: SEARCH_REFINEMENT_GRAPH_VERSION,
    instruction:
      "对比推荐候选人（recommended）与淘汰候选人（eliminated）的简历特征，为下一轮寻访产出搜索条件建议。" +
      "addedKeywords 是推荐组高频且当前搜索条件未覆盖的关键词；droppedKeywords 是主要命中淘汰组的现有关键词。" +
      "suggestedSearchCondition 是完整的建议搜索条件（keywords 至少 1 个）。" +
      "推荐组为空时也要给出结论：说明当前关键词可能过宽或过窄。reasoning 必须引用具体特征证据。",
    jobProfile: state.jobProfile,
    recommended: state.recommended,
    eliminated: state.eliminated,
    outputContract: {
      suggestedSearchCondition: "完整建议搜索条件",
      addedKeywords: "建议新增关键词数组",
      droppedKeywords: "建议移除关键词数组",
      reasoning: "调整依据说明",
    },
  });
}

function createStructuredModel(options: LangGraphOpenAISearchRefinementOptions): StructuredRefinementModel {
  const openAIRuntime = loadOpenAIRuntime();
  const model = new openAIRuntime.ChatOpenAI({
    apiKey: options.apiKey,
    model: options.modelName,
    temperature: options.temperature,
    maxRetries: options.maxRetries,
    timeout: options.timeoutMs,
  });

  return model.withStructuredOutput(refinementResponseSchema, {
    name: "SearchRefinementResponse",
    method: "jsonSchema",
    strict: true,
  });
}

function loadLangGraphRuntime(): LangGraphRuntime {
  const require = createRequire(import.meta.url);
  return require("@langchain/langgraph") as LangGraphRuntime;
}

function loadOpenAIRuntime(): OpenAIRuntime {
  const require = createRequire(import.meta.url);
  return require("@langchain/openai") as OpenAIRuntime;
}

async function invokeGraph(
  graph: LangGraphRefinementGraph,
  state: LangGraphRefinementState,
): Promise<LangGraphRefinementState> {
  try {
    return await graph.invoke(state);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }

    throw new DomainError(`LangGraph search refinement failed. ${formatErrorMessage(error)}`);
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return "UnknownError";
}
