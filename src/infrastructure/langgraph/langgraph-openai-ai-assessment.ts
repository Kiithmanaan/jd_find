import { createRequire } from "node:module";
import { z } from "zod";
import type { AIAssessmentPort } from "../../application/ports.js";
import {
  MATCH_ASSESSMENT_AGENT_VERSION,
  MATCH_ASSESSMENT_PROMPT_VERSION,
} from "../../domain/ai-assessment-contract.js";
import { DomainError } from "../../domain/errors.js";
import type { CandidateResult, JobProfile, MatchAssessment } from "../../domain/types.js";

export const MATCH_ASSESSMENT_GRAPH_VERSION = "match-assessment-graph-v1";

const recommendationSchema = z.enum(["推荐", "待定", "不推荐"]);

const langGraphAssessmentResponseSchema = z.object({
  assessments: z.array(
    z.object({
      candidateId: z.string().min(1),
      score: z.number(),
      recommendation: recommendationSchema,
      recommendationReason: z.string().min(1),
      matchedPoints: z.array(z.string()).max(3),
      unmatchedPoints: z.array(z.string()).max(3),
      riskPoints: z.array(z.string()).max(3),
      trace: z.string().min(1),
    }),
  ),
});

export type LangGraphAssessmentResponse = z.infer<typeof langGraphAssessmentResponseSchema>;

export interface LangGraphJobProfileSnapshot {
  id: string;
  title: string;
  currentVersionId?: string;
  searchCondition: JobProfile["searchCondition"];
  hardRequirements: JobProfile["hardRequirements"];
  softRequirements: JobProfile["softRequirements"];
}

export interface LangGraphCandidateSnapshot {
  id: string;
  fingerprint: string;
  resume: CandidateResult["resume"];
}

export interface LangGraphAssessmentState {
  jobProfile: LangGraphJobProfileSnapshot;
  candidates: LangGraphCandidateSnapshot[];
  prompt: string;
  structuredResponse?: LangGraphAssessmentResponse;
  assessments: Array<LangGraphAssessmentResponse["assessments"][number]>;
  nodeTrace: string[];
}

export interface StructuredAssessmentModel {
  invoke(input: string): Promise<unknown>;
}

interface StructuredChatModel {
  withStructuredOutput(schema: unknown, options: StructuredOutputOptions): StructuredAssessmentModel;
}

interface ChatOpenAIFields {
  apiKey: string;
  model: string;
  temperature: number;
  maxRetries: number;
  timeout: number;
}

interface StructuredOutputOptions {
  name: string;
  method: string;
  strict: boolean;
}

export interface LangGraphAssessmentGraph {
  invoke(input: LangGraphAssessmentState): Promise<LangGraphAssessmentState>;
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
    node: (state: LangGraphAssessmentState) => Partial<LangGraphAssessmentState> | Promise<Partial<LangGraphAssessmentState>>,
  ): StateGraphBuilder;
  addEdge(start: string, end: string): StateGraphBuilder;
  compile(): LangGraphAssessmentGraph;
}

interface LangGraphRuntime {
  Annotation: AnnotationFunction;
  START: string;
  END: string;
  StateGraph: new (state: unknown) => StateGraphBuilder;
}

interface OpenAIRuntime {
  ChatOpenAI: new (fields: ChatOpenAIFields) => StructuredChatModel;
}

export interface LangGraphOpenAIAssessmentOptions {
  apiKey: string;
  modelName: string;
  temperature: number;
  maxRetries: number;
  timeoutMs: number;
  graph?: LangGraphAssessmentGraph;
  structuredModel?: StructuredAssessmentModel;
}

export class LangGraphOpenAIAssessment implements AIAssessmentPort {
  readonly providerName = "langgraph-openai";
  readonly modelName: string;
  readonly graphVersion = MATCH_ASSESSMENT_GRAPH_VERSION;
  private readonly graph: LangGraphAssessmentGraph;

  constructor(options: LangGraphOpenAIAssessmentOptions) {
    this.modelName = options.modelName;
    this.graph = options.graph ?? createLangGraphAssessmentGraph(options.structuredModel ?? createStructuredModel(options));
  }

  async assessCandidates(
    jobProfile: JobProfile,
    candidates: CandidateResult[],
  ): Promise<Map<string, MatchAssessment>> {
    if (candidates.length === 0) {
      return new Map();
    }

    const state = await invokeGraph(this.graph, {
      jobProfile: toJobProfileSnapshot(jobProfile),
      candidates: candidates.map(toCandidateSnapshot),
      prompt: "",
      structuredResponse: undefined,
      assessments: [],
      nodeTrace: [],
    });

    return mapStructuredAssessments(jobProfile, candidates, state.assessments);
  }
}

export function createLangGraphAssessmentGraph(
  structuredModel: StructuredAssessmentModel,
): LangGraphAssessmentGraph {
  const langGraphRuntime = loadLangGraphRuntime();
  const assessmentState = langGraphRuntime.Annotation.Root({
    jobProfile: langGraphRuntime.Annotation<LangGraphJobProfileSnapshot>(),
    candidates: langGraphRuntime.Annotation<LangGraphCandidateSnapshot[]>(),
    prompt: langGraphRuntime.Annotation<string>(),
    structuredResponse: langGraphRuntime.Annotation<LangGraphAssessmentResponse | undefined>(),
    assessments: langGraphRuntime.Annotation<Array<LangGraphAssessmentResponse["assessments"][number]>>(),
    nodeTrace: langGraphRuntime.Annotation<string[], string[]>({
      reducer: (left: string[], right: string[]) => left.concat(right),
      default: () => [],
    }),
  });
  const buildPrompt = (state: LangGraphAssessmentState): Partial<LangGraphAssessmentState> => ({
    prompt: createLangGraphAssessmentPrompt(state.jobProfile, state.candidates),
    nodeTrace: ["buildPrompt"],
  });

  const callModel = async (state: LangGraphAssessmentState): Promise<Partial<LangGraphAssessmentState>> => {
    try {
      const rawResponse = await structuredModel.invoke(state.prompt);
      const structuredResponse = parseLangGraphAssessmentResponse(rawResponse);

      return {
        structuredResponse,
        nodeTrace: ["callModel"],
      };
    } catch (error) {
      throw createLangGraphModelError(state.candidates, error);
    }
  };

  const parseAssessments = (state: LangGraphAssessmentState): Partial<LangGraphAssessmentState> => {
    if (!state.structuredResponse) {
      throw new DomainError("LangGraph assessment response was not produced by callModel node.");
    }

    return {
      assessments: state.structuredResponse.assessments,
      nodeTrace: ["parseAssessments"],
    };
  };

  const mapToDomain = (state: LangGraphAssessmentState): Partial<LangGraphAssessmentState> => ({
    assessments: state.assessments,
    nodeTrace: ["mapToDomain"],
  });

  return new langGraphRuntime.StateGraph(assessmentState)
    .addNode("buildPrompt", buildPrompt)
    .addNode("callModel", callModel)
    .addNode("parseAssessments", parseAssessments)
    .addNode("mapToDomain", mapToDomain)
    .addEdge(langGraphRuntime.START, "buildPrompt")
    .addEdge("buildPrompt", "callModel")
    .addEdge("callModel", "parseAssessments")
    .addEdge("parseAssessments", "mapToDomain")
    .addEdge("mapToDomain", langGraphRuntime.END)
    .compile();
}

function createLangGraphAssessmentPrompt(
  jobProfile: LangGraphJobProfileSnapshot,
  candidates: LangGraphCandidateSnapshot[],
): string {
  return JSON.stringify({
    task: "match-assessment",
    promptVersion: MATCH_ASSESSMENT_PROMPT_VERSION,
    graphVersion: MATCH_ASSESSMENT_GRAPH_VERSION,
    instruction:
      "请基于岗位画像和候选人摘要输出结构化匹配评估。必须覆盖每一个 candidateId，不得返回请求范围外的候选人。",
    jobProfile,
    candidates,
    outputContract: {
      score: "0 到 100 的数字",
      recommendation: "推荐、待定或不推荐",
      recommendationReason: "一句清晰原因",
      matchedPoints: "最多 3 条匹配点",
      unmatchedPoints: "最多 3 条不匹配点",
      riskPoints: "最多 3 条风险点",
      trace: "简要说明评分依据和证据来源",
    },
  });
}

function createStructuredModel(options: LangGraphOpenAIAssessmentOptions): StructuredAssessmentModel {
  const openAIRuntime = loadOpenAIRuntime();
  const model = new openAIRuntime.ChatOpenAI({
    apiKey: options.apiKey,
    model: options.modelName,
    temperature: options.temperature,
    maxRetries: options.maxRetries,
    timeout: options.timeoutMs,
  });

  return model.withStructuredOutput(langGraphAssessmentResponseSchema, {
    name: "MatchAssessmentResponse",
    method: "jsonSchema",
    strict: true,
  });
}

export function parseLangGraphAssessmentResponse(response: unknown): LangGraphAssessmentResponse {
  return langGraphAssessmentResponseSchema.parse(response);
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
  graph: LangGraphAssessmentGraph,
  state: LangGraphAssessmentState,
): Promise<LangGraphAssessmentState> {
  try {
    return await graph.invoke(state);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }

    throw new DomainError(`LangGraph AI assessment failed. ${formatErrorMessage(error)}`);
  }
}

function toJobProfileSnapshot(jobProfile: JobProfile): LangGraphJobProfileSnapshot {
  return {
    id: jobProfile.id,
    title: jobProfile.title,
    currentVersionId: jobProfile.currentVersionId,
    searchCondition: jobProfile.searchCondition,
    hardRequirements: jobProfile.hardRequirements,
    softRequirements: jobProfile.softRequirements,
  };
}

function toCandidateSnapshot(candidate: CandidateResult): LangGraphCandidateSnapshot {
  return {
    id: candidate.id,
    fingerprint: candidate.fingerprint,
    resume: candidate.resume,
  };
}

function mapStructuredAssessments(
  jobProfile: JobProfile,
  candidates: CandidateResult[],
  assessments: Array<LangGraphAssessmentResponse["assessments"][number]>,
): Map<string, MatchAssessment> {
  const allowedCandidateIds = new Set(candidates.map((candidate) => candidate.id));
  const mapped = new Map<string, MatchAssessment>();

  for (const assessment of assessments) {
    if (!allowedCandidateIds.has(assessment.candidateId)) {
      throw new DomainError("LangGraph assessment contains a candidate outside the requested assessment scope.");
    }

    mapped.set(assessment.candidateId, {
      score: assessment.score,
      recommendation: assessment.recommendation,
      recommendationReason: assessment.recommendationReason,
      matchedPoints: assessment.matchedPoints,
      unmatchedPoints: assessment.unmatchedPoints,
      riskPoints: assessment.riskPoints,
      trace: assessment.trace,
      assessedAt: new Date(),
      jobProfileVersionId: jobProfile.currentVersionId,
      promptVersion: MATCH_ASSESSMENT_PROMPT_VERSION,
      agentVersion: MATCH_ASSESSMENT_AGENT_VERSION,
    });
  }

  for (const candidate of candidates) {
    if (!mapped.has(candidate.id)) {
      throw new DomainError(`LangGraph assessment is missing for candidate ${candidate.id}.`);
    }
  }

  return mapped;
}

function createLangGraphModelError(
  candidates: LangGraphCandidateSnapshot[],
  error: unknown,
): DomainError {
  return new DomainError(
    `LangGraph callModel node failed for candidateIds=${JSON.stringify(candidates.map((candidate) => candidate.id))}. ${formatErrorMessage(error)}`,
  );
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return "UnknownError";
}
