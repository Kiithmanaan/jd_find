import { DomainError } from "./errors.js";
import type { InterviewDraftOutput, InterviewTopicKey } from "./clarification-interview.js";
import type { SoftRequirement } from "./types.js";

export const CLARIFICATION_INTERVIEW_PROMPT_VERSION = "clarification-interview-v1";
export const CLARIFICATION_INTERVIEW_AGENT_VERSION = "jd-clarification-interview-v1";

export interface InterviewTopic {
  key: InterviewTopicKey;
  label: string;
  /** 该话题要逼问出的内容，供 mock 题库与 langgraph prompt 共用。 */
  focus: string;
}

/** 七组固定话题，顺序有依赖关系，不可乱序。 */
export const INTERVIEW_TOPICS: readonly InterviewTopic[] = [
  {
    key: "role-purpose",
    label: "岗位存在意义",
    focus: "这个岗位为什么存在？3-6 个月要交付什么关键结果？向谁汇报？",
  },
  {
    key: "hard-gates",
    label: "硬门槛",
    focus: "年限、学历、城市/坐班、行业等一票否决的硬性边界，逼问出可判断的数字或枚举。",
  },
  {
    key: "vital-skills",
    label: "命脉技能与验证方式",
    focus: "岗位成败所系的 1-3 项核心技能，以及看简历中什么信号才算真的具备（验证方式）。",
  },
  {
    key: "negative-signals",
    label: "排除信号",
    focus: "哪些简历特征出现即提示风险或直接排除（如频繁跳槽、经历断档、方向漂移）。",
  },
  {
    key: "target-companies",
    label: "目标公司与人才来源",
    focus: "目标候选人现在最可能在哪些公司、什么团队；有没有明确不要的公司。",
  },
  {
    key: "search-keywords",
    label: "搜索关键词与渠道",
    focus: "用什么关键词能搜到这类人；哪些渠道最可能命中。",
  },
  {
    key: "soft-preferences",
    label: "软性偏好与加分项",
    focus: "非一票否决但影响排序的偏好和加分项。",
  },
];

export interface InterviewQuestionDraft {
  question: string;
  suggestedAnswer: string;
}

export function normalizeInterviewQuestion(draft: InterviewQuestionDraft): InterviewQuestionDraft {
  const question = draft.question.trim();
  const suggestedAnswer = draft.suggestedAnswer.trim();

  if (!question) {
    throw new DomainError("Interview question must not be empty.");
  }
  if (!suggestedAnswer) {
    throw new DomainError("Interview question must include a suggested answer.");
  }

  return { question, suggestedAnswer };
}

export function normalizeInterviewDraft(draft: InterviewDraftOutput): InterviewDraftOutput {
  const jdText = draft.jdText.trim();
  const hardRequirementNotes = normalizeStringList(draft.hardRequirementNotes);
  const negativeSignals = normalizeStringList(draft.negativeSignals);
  const searchKeywords = normalizeStringList(draft.searchKeywords);
  const softRequirements = draft.softRequirements.map(normalizeSoftRequirement);

  if (!jdText) {
    throw new DomainError("Interview draft must include jdText.");
  }
  if (searchKeywords.length === 0) {
    throw new DomainError("Interview draft must include at least one search keyword.");
  }
  if (softRequirements.length === 0) {
    throw new DomainError("Interview draft must include at least one soft requirement.");
  }

  return { jdText, hardRequirementNotes, softRequirements, negativeSignals, searchKeywords };
}

function normalizeSoftRequirement(requirement: SoftRequirement): SoftRequirement {
  const key = requirement.key.trim();
  const label = requirement.label.trim();
  const description = requirement.description.trim();
  const verificationHint = requirement.verificationHint?.trim();

  if (!key || !label || !description) {
    throw new DomainError("Interview draft soft requirement must include key, label and description.");
  }

  return {
    key,
    label,
    weight: requirement.weight,
    description,
    ...(verificationHint ? { verificationHint } : {}),
  };
}

function normalizeStringList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
