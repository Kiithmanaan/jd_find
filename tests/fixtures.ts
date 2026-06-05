import type { CandidateDraft, JobProfile } from "../src/domain/types.js";

export function createConfirmedJobProfile(): JobProfile {
  return {
    id: "job-1",
    title: "高级解决方案顾问",
    jdText: "需要具备企业服务、复杂项目推动和客户理解能力。",
    status: "Confirmed",
    confirmedAt: new Date(),
    searchCondition: {
      keywords: ["解决方案", "客户成功"],
      cities: ["上海"],
      industries: ["企业服务"],
      educationLevels: ["本科", "硕士"],
      minYearsOfExperience: 5,
    },
    hardRequirements: [
      {
        key: "years",
        label: "5年以上经验",
        weight: 40,
        predicate: { type: "minYearsOfExperience", value: 5 },
      },
      {
        key: "education",
        label: "本科及以上",
        weight: 20,
        predicate: { type: "educationIn", values: ["本科", "硕士", "博士"] },
      },
      {
        key: "industry",
        label: "企业服务行业",
        weight: 40,
        predicate: { type: "industryIn", values: ["企业服务"] },
      },
    ],
    softRequirements: [
      {
        key: "complex_project",
        label: "复杂项目推动",
        weight: 50,
        description: "能推动多方参与的复杂项目落地。",
      },
      {
        key: "customer_understanding",
        label: "客户理解能力",
        weight: 50,
        description: "能理解客户业务和组织需求。",
      },
    ],
  };
}

export function createDraftJobProfile(): JobProfile {
  return {
    ...createConfirmedJobProfile(),
    id: "job-draft",
    status: "Draft",
    confirmedAt: undefined,
  };
}

export function createCandidateDrafts(): CandidateDraft[] {
  return [
    {
      fingerprint: "candidate-a",
      resume: {
        name: "候选人A",
        title: "解决方案顾问",
        city: "上海",
        educationLevel: "本科",
        yearsOfExperience: 8,
        industries: ["企业服务"],
        keywords: ["解决方案", "客户成功"],
        summary: "负责复杂项目推动，具备客户理解能力。",
      },
      intent: "高",
      activityLevel: "低",
      sourceLead: {
        platform: "MockPlatform",
        url: "https://example.test/candidate-a",
        searchContext: "关键词：解决方案；城市：上海",
        fallbackClues: ["解决方案顾问", "企业服务", "上海"],
      },
    },
    {
      fingerprint: "candidate-b",
      resume: {
        name: "候选人B",
        title: "客户成功经理",
        city: "上海",
        educationLevel: "本科",
        yearsOfExperience: 6,
        industries: ["企业服务"],
        keywords: ["客户成功"],
        summary: "有客户理解能力，复杂项目经验需进一步判断。",
      },
      intent: "低",
      activityLevel: "高",
      sourceLead: {
        platform: "MockPlatform",
        url: "https://example.test/candidate-b",
        searchContext: "关键词：客户成功；城市：上海",
        fallbackClues: ["客户成功经理", "企业服务", "上海"],
      },
    },
    {
      fingerprint: "candidate-b",
      resume: {
        name: "候选人B重复",
        title: "客户成功经理",
        city: "上海",
        educationLevel: "本科",
        yearsOfExperience: 6,
        industries: ["企业服务"],
        keywords: ["客户成功"],
        summary: "重复来源。",
      },
      intent: "高",
      activityLevel: "高",
      sourceLead: {
        platform: "MockPlatform",
        url: "https://example.test/candidate-b-duplicate",
        searchContext: "重复候选人",
        fallbackClues: ["客户成功经理"],
      },
    },
    {
      fingerprint: "candidate-c",
      resume: {
        name: "候选人C",
        title: "销售专员",
        city: "上海",
        educationLevel: "大专",
        yearsOfExperience: 3,
        industries: ["零售"],
        keywords: ["销售"],
        summary: "销售执行经验。",
      },
      intent: "高",
      activityLevel: "高",
      sourceLead: {
        platform: "MockPlatform",
        url: "https://example.test/candidate-c",
        searchContext: "关键词：销售；城市：上海",
        fallbackClues: ["销售专员", "上海"],
      },
    },
  ];
}
