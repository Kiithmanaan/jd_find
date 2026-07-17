import {
  answerCurrentTurn,
  appendQuestionTurn,
  completeSession,
  createInterviewSession,
  currentUnansweredTurn,
  type ClarificationInterviewSession,
  type InterviewTurn,
} from "../domain/clarification-interview.js";
import {
  CLARIFICATION_INTERVIEW_AGENT_VERSION,
  CLARIFICATION_INTERVIEW_PROMPT_VERSION,
  INTERVIEW_TOPICS,
  normalizeInterviewDraft,
  normalizeInterviewQuestion,
} from "../domain/clarification-interview-contract.js";
import { DomainError } from "../domain/errors.js";
import type { JobProfile } from "../domain/types.js";
import type {
  ClarificationInterviewPort,
  ClarificationInterviewSessionRepository,
  JobProfileRepository,
} from "./ports.js";

export interface ClarificationInterviewServiceDependencies {
  sessions: ClarificationInterviewSessionRepository;
  jobProfiles: JobProfileRepository;
  interviewAI: ClarificationInterviewPort;
  idGenerator?: () => string;
}

export class ClarificationInterviewService {
  constructor(private readonly deps: ClarificationInterviewServiceDependencies) {}

  async start(jobProfile: JobProfile, createdByUserId?: string): Promise<ClarificationInterviewSession> {
    let session = createInterviewSession({
      id: this.deps.idGenerator?.() ?? crypto.randomUUID(),
      jobProfileId: jobProfile.id,
      createdByUserId,
      provider: this.deps.interviewAI.providerName ?? "unknown",
      model: this.deps.interviewAI.modelName ?? "unknown",
      promptVersion: CLARIFICATION_INTERVIEW_PROMPT_VERSION,
    });

    session = appendQuestionTurn(session, await this.createQuestionTurn(session, jobProfile));
    return this.deps.sessions.save(session);
  }

  async answer(sessionId: string, answer: string): Promise<ClarificationInterviewSession> {
    const existing = await this.deps.sessions.findById(sessionId);
    if (!existing) {
      throw new SessionNotFoundError(sessionId);
    }

    const jobProfile = await this.deps.jobProfiles.findById(existing.jobProfileId);
    if (!jobProfile) {
      throw new DomainError("Interview session job profile was not found.");
    }

    // 幂等重试：最后一轮已回答且尚无新问题（上次 AI 调用失败）时，
    // 重发同一答案视为重试，不追加新回答。
    let session = existing;
    const lastTurn = session.turns[session.turns.length - 1];
    const isRetry =
      session.status === "InProgress" &&
      !currentUnansweredTurn(session) &&
      lastTurn?.answer === answer.trim();
    if (!isRetry) {
      session = answerCurrentTurn(session, answer);
      session = await this.deps.sessions.save(session);
    }

    if (session.currentTopicIndex < INTERVIEW_TOPICS.length) {
      session = appendQuestionTurn(session, await this.createQuestionTurn(session, jobProfile));
    } else {
      const draft = normalizeInterviewDraft(
        await this.deps.interviewAI.produceDraft({ jobProfile, turns: session.turns }),
      );
      session = completeSession(session, draft);
    }

    return this.deps.sessions.save(session);
  }

  async get(sessionId: string): Promise<ClarificationInterviewSession | undefined> {
    return this.deps.sessions.findById(sessionId);
  }

  async listByJobProfile(jobProfileId: string): Promise<ClarificationInterviewSession[]> {
    return this.deps.sessions.findByJobProfileId(jobProfileId);
  }

  private async createQuestionTurn(
    session: ClarificationInterviewSession,
    jobProfile: JobProfile,
  ): Promise<Omit<InterviewTurn, "answer" | "answeredAt">> {
    const topic = INTERVIEW_TOPICS[session.currentTopicIndex];
    if (!topic) {
      throw new DomainError("Interview has no remaining topics.");
    }

    const startedAt = Date.now();
    const question = normalizeInterviewQuestion(
      await this.deps.interviewAI.nextQuestion({ jobProfile, topic, turns: session.turns }),
    );

    return {
      topicKey: topic.key,
      question: question.question,
      suggestedAnswer: question.suggestedAnswer,
      askedAt: new Date(),
      ai: {
        provider: this.deps.interviewAI.providerName ?? "unknown",
        model: this.deps.interviewAI.modelName ?? "unknown",
        promptVersion: CLARIFICATION_INTERVIEW_PROMPT_VERSION,
        agentVersion: CLARIFICATION_INTERVIEW_AGENT_VERSION,
        graphVersion: this.deps.interviewAI.graphVersion,
        durationMs: Date.now() - startedAt,
      },
    };
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Clarification interview session ${sessionId} was not found.`);
    this.name = "SessionNotFoundError";
  }
}
