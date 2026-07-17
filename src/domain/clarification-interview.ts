import { DomainError } from "./errors.js";
import type { Identifier, SoftRequirement } from "./types.js";

export type InterviewTopicKey =
  | "role-purpose"
  | "hard-gates"
  | "vital-skills"
  | "negative-signals"
  | "target-companies"
  | "search-keywords"
  | "soft-preferences";

export type ClarificationInterviewStatus = "InProgress" | "Completed" | "Abandoned";

/** 单轮问答记录，同时承担该轮 AI 调用的审计信息。 */
export interface InterviewTurn {
  topicKey: InterviewTopicKey;
  question: string;
  suggestedAnswer: string;
  answer?: string;
  askedAt: Date;
  answeredAt?: Date;
  ai: {
    provider: string;
    model: string;
    promptVersion: string;
    agentVersion: string;
    graphVersion?: string;
    durationMs: number;
  };
}

/** 访谈完成后产出的画像草稿字段，硬性条件只给文本建议不生成结构化谓词。 */
export interface InterviewDraftOutput {
  jdText: string;
  hardRequirementNotes: string[];
  softRequirements: SoftRequirement[];
  negativeSignals: string[];
  searchKeywords: string[];
}

export interface ClarificationInterviewSession {
  id: Identifier;
  jobProfileId: Identifier;
  createdByUserId?: Identifier;
  status: ClarificationInterviewStatus;
  currentTopicIndex: number;
  turns: InterviewTurn[];
  draftOutput?: InterviewDraftOutput;
  provider: string;
  model: string;
  promptVersion: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export function createInterviewSession(input: {
  id: string;
  jobProfileId: string;
  createdByUserId?: string;
  provider: string;
  model: string;
  promptVersion: string;
}): ClarificationInterviewSession {
  const now = new Date();
  return {
    id: input.id,
    jobProfileId: input.jobProfileId,
    createdByUserId: input.createdByUserId,
    status: "InProgress",
    currentTopicIndex: 0,
    turns: [],
    provider: input.provider,
    model: input.model,
    promptVersion: input.promptVersion,
    createdAt: now,
    updatedAt: now,
  };
}

export function appendQuestionTurn(
  session: ClarificationInterviewSession,
  turn: Omit<InterviewTurn, "answer" | "answeredAt">,
): ClarificationInterviewSession {
  assertInProgress(session);
  if (currentUnansweredTurn(session)) {
    throw new DomainError("Current interview question has not been answered yet.");
  }

  return {
    ...session,
    turns: [...session.turns, turn],
    updatedAt: new Date(),
  };
}

export function answerCurrentTurn(
  session: ClarificationInterviewSession,
  answer: string,
): ClarificationInterviewSession {
  assertInProgress(session);
  const trimmed = answer.trim();
  if (!trimmed) {
    throw new DomainError("Interview answer must not be empty.");
  }

  const pending = currentUnansweredTurn(session);
  if (!pending) {
    throw new DomainError("There is no pending interview question to answer.");
  }

  const now = new Date();
  return {
    ...session,
    turns: session.turns.map((turn) =>
      turn === pending ? { ...turn, answer: trimmed, answeredAt: now } : turn,
    ),
    currentTopicIndex: session.currentTopicIndex + 1,
    updatedAt: now,
  };
}

export function completeSession(
  session: ClarificationInterviewSession,
  draftOutput: InterviewDraftOutput,
): ClarificationInterviewSession {
  assertInProgress(session);
  if (currentUnansweredTurn(session)) {
    throw new DomainError("Interview cannot complete while a question is unanswered.");
  }

  const now = new Date();
  return {
    ...session,
    status: "Completed",
    draftOutput,
    updatedAt: now,
    completedAt: now,
  };
}

export function currentUnansweredTurn(
  session: ClarificationInterviewSession,
): InterviewTurn | undefined {
  const lastTurn = session.turns[session.turns.length - 1];
  return lastTurn && lastTurn.answer === undefined ? lastTurn : undefined;
}

function assertInProgress(session: ClarificationInterviewSession): void {
  if (session.status !== "InProgress") {
    throw new DomainError(`Interview session is ${session.status} and cannot be modified.`);
  }
}
