import { createRequire } from "node:module";
import { z } from "zod";
import type { ClarificationInterviewPort } from "../../application/ports.js";
import {
  CLARIFICATION_INTERVIEW_PROMPT_VERSION,
  type InterviewQuestionDraft,
  type InterviewTopic,
} from "../../domain/clarification-interview-contract.js";
import type { InterviewDraftOutput, InterviewTurn } from "../../domain/clarification-interview.js";
import { DomainError } from "../../domain/errors.js";
import type { JobProfile } from "../../domain/types.js";

export const CLARIFICATION_INTERVIEW_GRAPH_VERSION = "clarification-interview-graph-v1";

const questionResponseSchema = z.object({
  question: z.string().min(1),
  suggestedAnswer: z.string().min(1),
});

const draftResponseSchema = z.object({
  jdText: z.string().min(1),
  hardRequirementNotes: z.array(z.string()),
  softRequirements: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      weight: z.number(),
      description: z.string().min(1),
      verificationHint: z.string().optional(),
    }),
  ).min(1),
  negativeSignals: z.array(z.string()),
  searchKeywords: z.array(z.string()).min(1),
});

export type LangGraphInterviewMode = "question" | "draft";

export interface LangGraphInterviewState {
  mode: LangGraphInterviewMode;
  jobProfile: Pick<JobProfile, "id" | "title" | "jdText" | "searchCondition" | "negativeSignals">;
  topic?: InterviewTopic;
  turns: Array<Pick<InterviewTurn, "topicKey" | "question" | "answer">>;
  prompt: string;
  structuredResponse?: unknown;
  output?: InterviewQuestionDraft | InterviewDraftOutput;
  nodeTrace: string[];
}

export interface StructuredInterviewModel {
  invoke(input: string): Promise<unknown>;
}

interface StructuredChatModel {
  withStructuredOutput(schema: unknown, options: { name: string; method: string; strict: boolean }): StructuredInterviewModel;
}

export interface LangGraphInterviewGraph {
  invoke(input: LangGraphInterviewState): Promise<LangGraphInterviewState>;
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
    node: (state: LangGraphInterviewState) => Partial<LangGraphInterviewState> | Promise<Partial<LangGraphInterviewState>>,
  ): StateGraphBuilder;
  addEdge(start: string, end: string): StateGraphBuilder;
  compile(): LangGraphInterviewGraph;
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

export interface LangGraphOpenAIClarificationInterviewOptions {
  apiKey: string;
  modelName: string;
  temperature: number;
  maxRetries: number;
  timeoutMs: number;
  graph?: LangGraphInterviewGraph;
  questionModel?: StructuredInterviewModel;
  draftModel?: StructuredInterviewModel;
}

export class LangGraphOpenAIClarificationInterview implements ClarificationInterviewPort {
  readonly providerName = "langgraph-openai";
  readonly modelName: string;
  readonly graphVersion = CLARIFICATION_INTERVIEW_GRAPH_VERSION;
  private readonly graph: LangGraphInterviewGraph;

  constructor(options: LangGraphOpenAIClarificationInterviewOptions) {
    this.modelName = options.modelName;
    this.graph =
      options.graph ??
      createLangGraphInterviewGraph(
        options.questionModel ?? createStructuredModel(options, questionResponseSchema, "InterviewQuestionResponse"),
        options.draftModel ?? createStructuredModel(options, draftResponseSchema, "InterviewDraftResponse"),
      );
  }

  async nextQuestion(input: {
    jobProfile: JobProfile;
    topic: InterviewTopic;
    turns: InterviewTurn[];
  }): Promise<InterviewQuestionDraft> {
    const state = await invokeGraph(this.graph, {
      mode: "question",
      jobProfile: toJobProfileSnapshot(input.jobProfile),
      topic: input.topic,
      turns: input.turns.map(toTurnSnapshot),
      prompt: "",
      nodeTrace: [],
    });

    return questionResponseSchema.parse(state.output);
  }

  async produceDraft(input: {
    jobProfile: JobProfile;
    turns: InterviewTurn[];
  }): Promise<InterviewDraftOutput> {
    const state = await invokeGraph(this.graph, {
      mode: "draft",
      jobProfile: toJobProfileSnapshot(input.jobProfile),
      turns: input.turns.map(toTurnSnapshot),
      prompt: "",
      nodeTrace: [],
    });

    return draftResponseSchema.parse(state.output);
  }
}

export function createLangGraphInterviewGraph(
  questionModel: StructuredInterviewModel,
  draftModel: StructuredInterviewModel,
): LangGraphInterviewGraph {
  const langGraphRuntime = loadLangGraphRuntime();
  const interviewState = langGraphRuntime.Annotation.Root({
    mode: langGraphRuntime.Annotation<LangGraphInterviewMode>(),
    jobProfile: langGraphRuntime.Annotation<LangGraphInterviewState["jobProfile"]>(),
    topic: langGraphRuntime.Annotation<InterviewTopic | undefined>(),
    turns: langGraphRuntime.Annotation<LangGraphInterviewState["turns"]>(),
    prompt: langGraphRuntime.Annotation<string>(),
    structuredResponse: langGraphRuntime.Annotation<unknown>(),
    output: langGraphRuntime.Annotation<LangGraphInterviewState["output"]>(),
    nodeTrace: langGraphRuntime.Annotation<string[], string[]>({
      reducer: (left: string[], right: string[]) => left.concat(right),
      default: () => [],
    }),
  });

  const buildPrompt = (state: LangGraphInterviewState): Partial<LangGraphInterviewState> => ({
    prompt: createClarificationInterviewPrompt(state),
    nodeTrace: ["buildPrompt"],
  });

  const callModel = async (state: LangGraphInterviewState): Promise<Partial<LangGraphInterviewState>> => {
    try {
      const model = state.mode === "question" ? questionModel : draftModel;
      return {
        structuredResponse: await model.invoke(state.prompt),
        nodeTrace: ["callModel"],
      };
    } catch (error) {
      throw new DomainError(`LangGraph clarification interview callModel failed. ${formatErrorMessage(error)}`);
    }
  };

  const parseResponse = (state: LangGraphInterviewState): Partial<LangGraphInterviewState> => {
    if (state.structuredResponse === undefined) {
      throw new DomainError("LangGraph clarification interview response was not produced by callModel node.");
    }

    const schema = state.mode === "question" ? questionResponseSchema : draftResponseSchema;
    return {
      output: schema.parse(state.structuredResponse),
      nodeTrace: ["parseResponse"],
    };
  };

  const mapToDomain = (state: LangGraphInterviewState): Partial<LangGraphInterviewState> => ({
    output: state.output,
    nodeTrace: ["mapToDomain"],
  });

  return new langGraphRuntime.StateGraph(interviewState)
    .addNode("buildPrompt", buildPrompt)
    .addNode("callModel", callModel)
    .addNode("parseResponse", parseResponse)
    .addNode("mapToDomain", mapToDomain)
    .addEdge(langGraphRuntime.START, "buildPrompt")
    .addEdge("buildPrompt", "callModel")
    .addEdge("callModel", "parseResponse")
    .addEdge("parseResponse", "mapToDomain")
    .addEdge("mapToDomain", langGraphRuntime.END)
    .compile();
}

export function createClarificationInterviewPrompt(state: LangGraphInterviewState): string {
  const shared = {
    task: "clarification-interview",
    promptVersion: CLARIFICATION_INTERVIEW_PROMPT_VERSION,
    graphVersion: CLARIFICATION_INTERVIEW_GRAPH_VERSION,
    jobProfile: state.jobProfile,
    turns: state.turns,
  };

  if (state.mode === "question") {
    return JSON.stringify({
      ...shared,
      mode: "question",
      topic: state.topic,
      instruction:
        "你是逼问式岗位需求梳理顾问。一次只问一个问题，聚焦当前话题（topic.focus），" +
        "参考已有问答（turns）避免重复并针对模糊回答追问。必须附带一条具体的推荐答案（suggestedAnswer），" +
        "让用户确认或纠正，而不是抛开放题。模糊词（资深、能力强等）必须逼问成可判断的标准。",
      outputContract: {
        question: "一个聚焦当前话题的问题",
        suggestedAnswer: "基于已知信息的具体推荐答案",
      },
    });
  }

  return JSON.stringify({
    ...shared,
    mode: "draft",
    instruction:
      "基于全部访谈问答产出岗位画像草稿。硬性条件只给文本建议（hardRequirementNotes），不生成结构化规则。" +
      "softRequirements 每条尽量附 verificationHint（看简历中什么信号才算满足）。" +
      "negativeSignals 是命中即提示风险的简历特征。searchKeywords 至少 1 个。",
    outputContract: {
      jdText: "可对外发布的 JD 文本",
      hardRequirementNotes: "硬性条件文本建议数组",
      softRequirements: "软性条件数组（key/label/weight/description/verificationHint）",
      negativeSignals: "排除信号数组",
      searchKeywords: "搜索关键词数组",
    },
  });
}

function createStructuredModel(
  options: LangGraphOpenAIClarificationInterviewOptions,
  schema: unknown,
  name: string,
): StructuredInterviewModel {
  const openAIRuntime = loadOpenAIRuntime();
  const model = new openAIRuntime.ChatOpenAI({
    apiKey: options.apiKey,
    model: options.modelName,
    temperature: options.temperature,
    maxRetries: options.maxRetries,
    timeout: options.timeoutMs,
  });

  return model.withStructuredOutput(schema, {
    name,
    method: "jsonSchema",
    strict: true,
  });
}

function toJobProfileSnapshot(jobProfile: JobProfile): LangGraphInterviewState["jobProfile"] {
  return {
    id: jobProfile.id,
    title: jobProfile.title,
    jdText: jobProfile.jdText,
    searchCondition: jobProfile.searchCondition,
    negativeSignals: jobProfile.negativeSignals,
  };
}

function toTurnSnapshot(turn: InterviewTurn): LangGraphInterviewState["turns"][number] {
  return {
    topicKey: turn.topicKey,
    question: turn.question,
    answer: turn.answer,
  };
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
  graph: LangGraphInterviewGraph,
  state: LangGraphInterviewState,
): Promise<LangGraphInterviewState> {
  try {
    return await graph.invoke(state);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }

    throw new DomainError(`LangGraph clarification interview failed. ${formatErrorMessage(error)}`);
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return "UnknownError";
}
