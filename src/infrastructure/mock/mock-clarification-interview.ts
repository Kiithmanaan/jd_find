import type { ClarificationInterviewPort } from "../../application/ports.js";
import type {
  InterviewDraftOutput,
  InterviewTopicKey,
  InterviewTurn,
} from "../../domain/clarification-interview.js";
import type {
  InterviewQuestionDraft,
  InterviewTopic,
} from "../../domain/clarification-interview-contract.js";
import type { JobProfile } from "../../domain/types.js";

const QUESTION_TEMPLATES: Record<InterviewTopicKey, (jobProfile: JobProfile) => InterviewQuestionDraft> = {
  "role-purpose": (jobProfile) => ({
    question: `「${jobProfile.title}」这个岗位为什么存在？3-6 个月要交付什么关键结果？`,
    suggestedAnswer: `建议：支撑${jobProfile.title}相关业务目标，3 个月内独立承担核心工作。`,
  }),
  "hard-gates": (jobProfile) => ({
    question: "哪些条件是一票否决的硬门槛？请给出可判断的数字或枚举（年限/学历/城市/行业）。",
    suggestedAnswer: `建议：${jobProfile.searchCondition.minYearsOfExperience ?? 5} 年以上经验，${jobProfile.searchCondition.cities.join("、") || "不限城市"}。`,
  }),
  "vital-skills": (jobProfile) => ({
    question: "岗位成败所系的 1-3 项命脉技能是什么？看简历中什么信号才算真的具备？",
    suggestedAnswer: `建议：围绕「${jobProfile.searchCondition.keywords[0] ?? jobProfile.title}」的可量化项目结果。`,
  }),
  "negative-signals": () => ({
    question: "哪些简历特征出现即提示风险或直接排除？（每行一条）",
    suggestedAnswer: "建议：频繁跳槽；经历断档超过一年。",
  }),
  "target-companies": (jobProfile) => ({
    question: "目标候选人现在最可能在哪些公司、什么团队？有没有明确不要的公司？",
    suggestedAnswer: `建议：${jobProfile.searchCondition.industries.join("、") || "同行业"}头部公司的对应团队。`,
  }),
  "search-keywords": (jobProfile) => ({
    question: "用什么搜索关键词能搜到这类人？（用分号分隔）",
    suggestedAnswer: `建议：${jobProfile.searchCondition.keywords.join("；") || jobProfile.title}。`,
  }),
  "soft-preferences": () => ({
    question: "有哪些非一票否决但影响排序的偏好和加分项？",
    suggestedAnswer: "建议：跨部门协作经验；行业头部公司背景加分。",
  }),
};

/**
 * 确定性 mock：题目按固定模板生成，草稿从对应话题的回答文本合成，
 * 便于测试断言完整访谈闭环。
 */
export class MockClarificationInterview implements ClarificationInterviewPort {
  readonly providerName = "mock";
  readonly modelName = "mock-clarification-interview-v1";

  async nextQuestion(input: {
    jobProfile: JobProfile;
    topic: InterviewTopic;
    turns: InterviewTurn[];
  }): Promise<InterviewQuestionDraft> {
    return QUESTION_TEMPLATES[input.topic.key](input.jobProfile);
  }

  async produceDraft(input: {
    jobProfile: JobProfile;
    turns: InterviewTurn[];
  }): Promise<InterviewDraftOutput> {
    const answers = new Map<InterviewTopicKey, string>(
      input.turns
        .filter((turn) => turn.answer)
        .map((turn) => [turn.topicKey, turn.answer as string]),
    );

    const vitalSkillAnswer = answers.get("vital-skills") ?? "";
    const softPreferenceAnswer = answers.get("soft-preferences") ?? "";
    const softRequirements = [
      {
        key: "vital-skill",
        label: "命脉技能",
        weight: 60,
        description: vitalSkillAnswer || `具备${input.jobProfile.title}核心能力。`,
        ...(vitalSkillAnswer ? { verificationHint: vitalSkillAnswer } : {}),
      },
      ...(softPreferenceAnswer
        ? [{ key: "soft-preference", label: "软性偏好", weight: 40, description: softPreferenceAnswer }]
        : []),
    ];

    return {
      jdText: [
        `岗位：${input.jobProfile.title}`,
        answers.get("role-purpose") ? `岗位使命：${answers.get("role-purpose")}` : "",
        answers.get("hard-gates") ? `硬性要求：${answers.get("hard-gates")}` : "",
        vitalSkillAnswer ? `核心能力：${vitalSkillAnswer}` : "",
      ].filter(Boolean).join("\n"),
      hardRequirementNotes: splitList(answers.get("hard-gates") ?? ""),
      softRequirements,
      negativeSignals: splitList(answers.get("negative-signals") ?? ""),
      searchKeywords: splitList(answers.get("search-keywords") ?? "")
        .concat(input.jobProfile.searchCondition.keywords)
        .filter((keyword, index, list) => list.indexOf(keyword) === index),
    };
  }
}

function splitList(text: string): string[] {
  return text
    .split(/[\n;；、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
