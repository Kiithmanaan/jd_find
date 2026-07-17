import assert from "node:assert/strict";
import test from "node:test";
import {
  answerCurrentTurn,
  appendQuestionTurn,
  completeSession,
  createInterviewSession,
  currentUnansweredTurn,
  type ClarificationInterviewSession,
  type InterviewDraftOutput,
  type InterviewTurn,
} from "../src/domain/clarification-interview.js";
import {
  CLARIFICATION_INTERVIEW_PROMPT_VERSION,
  INTERVIEW_TOPICS,
  normalizeInterviewDraft,
  normalizeInterviewQuestion,
} from "../src/domain/clarification-interview-contract.js";
import { ClarificationInterviewService } from "../src/application/clarification-interview.service.js";
import { DomainError } from "../src/domain/errors.js";
import { MockClarificationInterview } from "../src/infrastructure/mock/mock-clarification-interview.js";
import {
  InMemoryClarificationInterviewSessionRepository,
  InMemoryJobProfileRepository,
} from "../src/infrastructure/memory/in-memory-repositories.js";
import { LangGraphOpenAIClarificationInterview } from "../src/infrastructure/langgraph/langgraph-openai-clarification-interview.js";
import { createClarificationInterviewFromEnv } from "../src/infrastructure/ai/create-clarification-interview.js";
import { createConfirmedJobProfile } from "./fixtures.js";

function questionTurn(topicIndex: number): Omit<InterviewTurn, "answer" | "answeredAt"> {
  return {
    topicKey: INTERVIEW_TOPICS[topicIndex]!.key,
    question: `问题${topicIndex}`,
    suggestedAnswer: `建议${topicIndex}`,
    askedAt: new Date(),
    ai: {
      provider: "mock",
      model: "mock-model",
      promptVersion: CLARIFICATION_INTERVIEW_PROMPT_VERSION,
      agentVersion: "jd-clarification-interview-v1",
      durationMs: 1,
    },
  };
}

function createSession(): ClarificationInterviewSession {
  return createInterviewSession({
    id: "session-1",
    jobProfileId: "job-1",
    provider: "mock",
    model: "mock-model",
    promptVersion: CLARIFICATION_INTERVIEW_PROMPT_VERSION,
  });
}

const validDraft: InterviewDraftOutput = {
  jdText: "岗位描述",
  hardRequirementNotes: ["5 年以上经验"],
  softRequirements: [{ key: "s1", label: "命脉技能", weight: 60, description: "描述" }],
  negativeSignals: ["频繁跳槽"],
  searchKeywords: ["解决方案"],
};

test("访谈状态机按顺序推进话题并在完成后拒绝修改", () => {
  let session = createSession();
  session = appendQuestionTurn(session, questionTurn(0));
  assert.equal(currentUnansweredTurn(session)?.question, "问题0");

  assert.throws(() => appendQuestionTurn(session, questionTurn(1)), DomainError);

  session = answerCurrentTurn(session, "回答0");
  assert.equal(session.currentTopicIndex, 1);
  assert.equal(currentUnansweredTurn(session), undefined);

  assert.throws(() => answerCurrentTurn(session, "多余回答"), DomainError);
  assert.throws(() => answerCurrentTurn({ ...session }, "  "), DomainError);

  const completed = completeSession(session, validDraft);
  assert.equal(completed.status, "Completed");
  assert.ok(completed.completedAt);
  assert.throws(() => answerCurrentTurn(completed, "再答"), DomainError);
  assert.throws(() => appendQuestionTurn(completed, questionTurn(1)), DomainError);
});

test("访谈契约校验问题与草稿", () => {
  assert.throws(() => normalizeInterviewQuestion({ question: " ", suggestedAnswer: "a" }), DomainError);
  assert.throws(() => normalizeInterviewQuestion({ question: "q", suggestedAnswer: " " }), DomainError);

  const normalized = normalizeInterviewDraft({
    ...validDraft,
    negativeSignals: [" 频繁跳槽 ", ""],
    searchKeywords: [" 解决方案 "],
  });
  assert.deepEqual(normalized.negativeSignals, ["频繁跳槽"]);
  assert.deepEqual(normalized.searchKeywords, ["解决方案"]);

  assert.throws(() => normalizeInterviewDraft({ ...validDraft, searchKeywords: [" "] }), DomainError);
  assert.throws(() => normalizeInterviewDraft({ ...validDraft, softRequirements: [] }), DomainError);
});

test("Mock 访谈走完七轮后产出确定性草稿", async () => {
  const service = new ClarificationInterviewService({
    sessions: new InMemoryClarificationInterviewSessionRepository(),
    jobProfiles: seedJobProfiles(),
    interviewAI: new MockClarificationInterview(),
    idGenerator: () => "interview-1",
  });

  let session = await service.start(createConfirmedJobProfile());
  assert.equal(session.status, "InProgress");
  assert.equal(session.turns.length, 1);
  assert.equal(session.turns[0]?.topicKey, "role-purpose");
  assert.ok(session.turns[0]?.suggestedAnswer);

  const answers: Record<string, string> = {
    "role-purpose": "支撑企业服务业务增长",
    "hard-gates": "5 年以上经验；本科及以上",
    "vital-skills": "推动过多方参与的复杂项目并有可量化结果",
    "negative-signals": "频繁跳槽；经历断档",
    "target-companies": "企业服务头部公司",
    "search-keywords": "解决方案顾问；客户成功",
    "soft-preferences": "跨部门协作经验",
  };

  for (let index = 0; index < INTERVIEW_TOPICS.length; index += 1) {
    const pending = currentUnansweredTurn(session);
    assert.ok(pending, `第 ${index} 轮应有待回答问题`);
    session = await service.answer(session.id, answers[pending.topicKey]!);
  }

  assert.equal(session.status, "Completed");
  assert.equal(session.turns.length, 7);
  assert.equal(session.turns.every((turn) => turn.answer), true);
  assert.equal(session.turns.every((turn) => turn.ai.durationMs >= 0 && turn.ai.provider === "mock"), true);

  const draft = session.draftOutput;
  assert.ok(draft);
  assert.deepEqual(draft.negativeSignals, ["频繁跳槽", "经历断档"]);
  assert.equal(draft.searchKeywords.includes("解决方案顾问"), true);
  assert.equal(draft.softRequirements[0]?.verificationHint, answers["vital-skills"]);
  assert.match(draft.jdText, /高级解决方案顾问/);
});

test("访谈服务对不存在会话与空回答报错", async () => {
  const service = new ClarificationInterviewService({
    sessions: new InMemoryClarificationInterviewSessionRepository(),
    jobProfiles: seedJobProfiles(),
    interviewAI: new MockClarificationInterview(),
  });

  await assert.rejects(() => service.answer("missing", "回答"), /was not found/);

  const session = await service.start(createConfirmedJobProfile());
  await assert.rejects(() => service.answer(session.id, "  "), DomainError);
});

test("LangGraph 访谈按 mode 分派模型并注入逼问指令", async () => {
  const prompts: string[] = [];
  const adapter = new LangGraphOpenAIClarificationInterview({
    apiKey: "test-key",
    modelName: "test-model",
    temperature: 0,
    maxRetries: 0,
    timeoutMs: 1_000,
    questionModel: {
      invoke: async (prompt: string) => {
        prompts.push(prompt);
        return { question: "几年算资深？", suggestedAnswer: "建议 5 年以上。" };
      },
    },
    draftModel: {
      invoke: async (prompt: string) => {
        prompts.push(prompt);
        return {
          jdText: "岗位描述",
          hardRequirementNotes: ["5 年以上"],
          softRequirements: [{ key: "s1", label: "命脉技能", weight: 60, description: "描述", verificationHint: "可量化结果" }],
          negativeSignals: ["频繁跳槽"],
          searchKeywords: ["解决方案"],
        };
      },
    },
  });

  const jobProfile = createConfirmedJobProfile();
  const question = await adapter.nextQuestion({ jobProfile, topic: INTERVIEW_TOPICS[1]!, turns: [] });
  assert.equal(question.question, "几年算资深？");

  const draft = await adapter.produceDraft({ jobProfile, turns: [] });
  assert.deepEqual(draft.negativeSignals, ["频繁跳槽"]);

  const questionPrompt = JSON.parse(prompts[0]!) as { mode: string; instruction: string; topic: { key: string } };
  assert.equal(questionPrompt.mode, "question");
  assert.equal(questionPrompt.topic.key, "hard-gates");
  assert.match(questionPrompt.instruction, /一次只问一个问题/);

  const draftPrompt = JSON.parse(prompts[1]!) as { mode: string; instruction: string };
  assert.equal(draftPrompt.mode, "draft");
  assert.match(draftPrompt.instruction, /verificationHint/);
});

test("澄清访谈工厂按 env 装配 provider", () => {
  const mockAdapter = createClarificationInterviewFromEnv({} as NodeJS.ProcessEnv);
  assert.equal(mockAdapter.providerName, "mock");

  assert.throws(
    () =>
      createClarificationInterviewFromEnv({
        CLARIFICATION_INTERVIEW_PROVIDER: "langgraph-openai",
      } as NodeJS.ProcessEnv),
    /Invalid clarification interview environment/,
  );

  let capturedModel = "";
  const adapter = createClarificationInterviewFromEnv(
    {
      CLARIFICATION_INTERVIEW_PROVIDER: "langgraph-openai",
      OPENAI_API_KEY: "key",
      CLARIFICATION_INTERVIEW_MODEL: "gpt-test",
      CLARIFICATION_INTERVIEW_TEMPERATURE: "0",
      CLARIFICATION_INTERVIEW_MAX_RETRIES: "1",
      CLARIFICATION_INTERVIEW_TIMEOUT_MS: "1000",
    } as NodeJS.ProcessEnv,
    {
      createLangGraphOpenAI: (options) => {
        capturedModel = options.modelName;
        return new MockClarificationInterview();
      },
    },
  );
  assert.equal(adapter.providerName, "mock");
  assert.equal(capturedModel, "gpt-test");
});

function seedJobProfiles(): InMemoryJobProfileRepository {
  const jobProfiles = new InMemoryJobProfileRepository();
  void jobProfiles.save(createConfirmedJobProfile());
  return jobProfiles;
}
