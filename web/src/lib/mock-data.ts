import type {
  AIAudit,
  Candidate,
  CandidateSummary,
  CreateSearchRunResponse,
  JobProfile,
  SearchRun,
  SearchRunStatus,
} from "./types.js";

let mockSearchRunCounter = 0;

export function createMockSearchRun(jobProfile: JobProfile, targetResultCount: number): CreateSearchRunResponse {
  mockSearchRunCounter += 1;
  const searchRunId = `mock-run-${Date.now().toString(36)}-${mockSearchRunCounter}`;

  return {
    searchRunId,
    status: "Running",
    statusUrl: `/api/search-runs/${searchRunId}`,
  };
}

export function buildMockSearchRun(
  id: string,
  jobProfile: JobProfile,
  targetResultCount: number,
  candidates: Candidate[],
  status: SearchRunStatus = "Running",
): SearchRun {
  const now = new Date().toISOString();
  return {
    id,
    jobProfileId: jobProfile.id,
    jobProfileTitle: jobProfile.title,
    status,
    targetResultCount,
    rawSubmittedCount: candidates.length,
    createdAt: now,
    updatedAt: now,
    events: [],
    candidates,
    searchRunUrl: `/search-runs/${id}`,
  };
}

export const mockAudit: AIAudit = {
  id: "audit-001",
  provider: "mock-ai",
  model: "mock-match-v1",
  promptVersion: "match-assessment-2026-06",
  agentVersion: "agent-1",
  durationMs: 1260,
  status: "success",
  candidateIds: ["candidate-001", "candidate-002"],
  inputSnapshot: {
    jobProfileId: "job-001",
    hardRequirements: ["5 年以上经验", "本科及以上", "企业服务行业"],
    softRequirements: "复杂项目推动能力；客户业务理解能力；跨团队沟通能力。",
  },
  outputSnapshot: {
    candidateResults: [
      { candidateId: "candidate-001", recommendation: "推荐", score: 88 },
      { candidateId: "candidate-002", recommendation: "待定", score: 72 },
    ],
  },
};

export const baseProfile: JobProfile = {
  id: "job-001",
  title: "高级解决方案顾问",
  version: 3,
  status: "Confirmed",
  owner: "hunter@example.com",
  updatedAt: "2026-06-08 10:30",
  searchRunCount: 3,
  jdText: "负责企业服务客户的解决方案设计、复杂项目推动和客户成功协作。",
  searchCondition: {
    keywords: "解决方案, 客户成功",
    cities: "上海",
    industries: "企业服务",
    educationLevels: "本科, 硕士",
    minYearsOfExperience: 5,
  },
  hardRequirements: ["5 年以上经验", "本科及以上", "企业服务行业", "关键词包含解决方案或客户成功"],
  softRequirements: "复杂项目推动能力；客户业务理解能力；跨团队沟通能力。",
};

const baseProfile2: JobProfile = {
  ...baseProfile,
  id: "job-002",
  title: "客户成功负责人",
  version: 1,
  updatedAt: "2026-06-07 16:20",
  searchRunCount: 0,
  searchCondition: {
    keywords: "客户成功, 续费",
    cities: "北京, 上海",
    industries: "SaaS",
    educationLevels: "本科",
    minYearsOfExperience: 6,
  },
  hardRequirements: ["6 年以上经验", "本科及以上", "SaaS 行业"],
  softRequirements: "续费增长；团队管理；关键客户经营。",
};

export const draftProfile: JobProfile = {
  ...baseProfile,
  id: "job-003",
  title: "高级 DevOps 工程师",
  version: 1,
  status: "Draft",
  updatedAt: "2026-06-08 14:00",
  searchRunCount: 0,
  searchCondition: {
    keywords: "Kubernetes, CI/CD",
    cities: "上海, 杭州",
    industries: "云计算",
    educationLevels: "本科",
    minYearsOfExperience: 3,
  },
  hardRequirements: ["3 年以上 DevOps 经验", "本科及以上"],
  softRequirements: "K8s 生产实践经验；CI/CD 工具链搭建能力。",
};

export const mockProfiles: JobProfile[] = [baseProfile, baseProfile2, draftProfile];

export const mockCandidates: Candidate[] = [
  {
    id: "candidate-001",
    name: "陈明",
    title: "解决方案顾问",
    city: "上海",
    educationLevel: "本科",
    yearsOfExperience: 8,
    industries: ["企业服务"],
    intent: "高",
    activityLevel: "低",
    sourcePlatform: "BrowserPlugin",
    sourceUrl: "https://example.test/candidate-001",
    fallbackClues: ["解决方案顾问", "企业服务", "上海"],
    status: "Displayable",
    matchAssessment: {
      score: 88,
      recommendation: "推荐",
      recommendationReason: "经验、行业和项目推动能力均贴近岗位要求。",
      matchedPoints: ["8 年企业服务经验", "有解决方案设计经历", "客户成功关键词明确"],
      unmatchedPoints: [],
      riskPoints: ["近期活跃度较低"],
      trace: "命中年限、行业、关键词与软性条件。",
    },
    hardRejectReasons: [],
    hasAttachment: true,
    resumeAttachment: {
      filename: "chen_ming_resume.pdf",
      contentType: "application/pdf",
      sizeBytes: 245760,
      receivedAt: "2026-06-08T11:00:00.000Z",
    },
    assessedVersion: 3,
  },
  {
    id: "candidate-002",
    name: "李然",
    title: "客户成功经理",
    city: "上海",
    educationLevel: "硕士",
    yearsOfExperience: 6,
    industries: ["企业服务", "SaaS"],
    intent: "中",
    activityLevel: "高",
    sourcePlatform: "BrowserPlugin",
    sourceUrl: "https://example.test/candidate-002",
    fallbackClues: ["客户成功", "SaaS", "上海"],
    status: "Displayable",
    matchAssessment: {
      score: 72,
      recommendation: "待定",
      recommendationReason: "客户成功背景匹配，但解决方案经验需要进一步确认。",
      matchedPoints: ["客户成功经验明确", "学历与年限符合"],
      unmatchedPoints: ["解决方案设计证据不足"],
      riskPoints: ["项目复杂度未知"],
      trace: "通过硬筛，软性条件只部分命中。",
    },
    hardRejectReasons: [],
    hasAttachment: false,
    assessedVersion: 3,
  },
  {
    id: "candidate-003",
    name: "王磊",
    title: "销售代表",
    city: "杭州",
    educationLevel: "大专",
    yearsOfExperience: 3,
    industries: ["零售"],
    intent: "低",
    activityLevel: "中",
    sourcePlatform: "BrowserPlugin",
    sourceUrl: "https://example.test/candidate-003",
    fallbackClues: ["销售", "杭州"],
    status: "HardRejected",
    hardRejectReasons: ["工作年限不足", "学历不满足", "行业不匹配"],
    hasAttachment: false,
    assessedVersion: 2,
  },
];


// ─── 硬筛配置 mock ─────────────────────────────────────────────────

export const mockHardConditionConfig = {
  dimensions: [
    {
      id: "hard-dimension-keyword",
      key: "keyword",
      label: "全文关键词",
      valueType: "text" as const,
      supportedMatchModes: ["exact", "normalizedContains"],
      allowMultiple: true,
      createdAt: "2026-06-06T00:00:00.000Z",
      options: [],
    },
    {
      id: "hard-dimension-city",
      key: "city",
      label: "城市",
      valueType: "option" as const,
      supportedMatchModes: ["optionAny"],
      allowMultiple: true,
      createdAt: "2026-06-06T00:00:00.000Z",
      options: [],
    },
    {
      id: "hard-dimension-industry",
      key: "industry",
      label: "行业",
      valueType: "option" as const,
      supportedMatchModes: ["optionAny"],
      allowMultiple: true,
      createdAt: "2026-06-06T00:00:00.000Z",
      options: [],
    },
    {
      id: "hard-dimension-education",
      key: "education",
      label: "学历",
      valueType: "option" as const,
      supportedMatchModes: ["rankAtLeast"],
      allowMultiple: false,
      createdAt: "2026-06-06T00:00:00.000Z",
      options: [
        { id: "hard-option-education-college", dimensionKey: "education", value: "大专", label: "大专", aliases: ["专科"], rank: 1, createdAt: "2026-06-06T00:00:00.000Z" },
        { id: "hard-option-education-bachelor", dimensionKey: "education", value: "本科", label: "本科", aliases: ["学士"], rank: 2, createdAt: "2026-06-06T00:00:00.000Z" },
        { id: "hard-option-education-master", dimensionKey: "education", value: "硕士", label: "硕士", aliases: ["研究生"], rank: 3, createdAt: "2026-06-06T00:00:00.000Z" },
        { id: "hard-option-education-doctor", dimensionKey: "education", value: "博士", label: "博士", aliases: ["博士研究生"], rank: 4, createdAt: "2026-06-06T00:00:00.000Z" },
      ],
    },
    {
      id: "hard-dimension-years",
      key: "yearsOfExperience",
      label: "最低工作年限",
      valueType: "number" as const,
      supportedMatchModes: ["min"],
      allowMultiple: false,
      createdAt: "2026-06-06T00:00:00.000Z",
      options: [],
    },
  ],
};

export const mockProfileVersions: Record<string, import("./types.js").JobProfileVersion[]> = {
  "job-001": [
    {
      id: "job-001-v1",
      jobProfileId: "job-001",
      version: 1,
      title: "高级解决方案顾问",
      jdText: "负责企业服务客户的解决方案设计。",
      searchCondition: { keywords: "解决方案, 企业服务", cities: "上海", industries: "企业服务", educationLevels: "本科", minYearsOfExperience: 3 },
      hardRequirements: ["3 年以上经验", "本科及以上"],
      softRequirements: "项目推动能力",
      status: "Draft",
      createdAt: "2026-06-01T10:00:00.000Z",
    },
    {
      id: "job-001-v2",
      jobProfileId: "job-001",
      version: 2,
      title: "高级解决方案顾问",
      jdText: "负责企业服务客户的解决方案设计、复杂项目推动和客户成功协作。",
      searchCondition: { keywords: "解决方案, 客户成功, 企业服务", cities: "上海", industries: "企业服务", educationLevels: "本科, 硕士", minYearsOfExperience: 5 },
      hardRequirements: ["5 年以上经验", "本科及以上", "企业服务行业"],
      softRequirements: "复杂项目推动能力；客户业务理解能力；跨团队沟通能力。",
      status: "Confirmed",
      createdAt: "2026-06-03T14:00:00.000Z",
      confirmedAt: "2026-06-03T14:00:00.000Z",
    },
    {
      id: "job-001-v3",
      jobProfileId: "job-001",
      version: 3,
      title: "高级解决方案顾问",
      jdText: baseProfile.jdText,
      searchCondition: baseProfile.searchCondition,
      hardRequirements: baseProfile.hardRequirements,
      softRequirements: baseProfile.softRequirements,
      status: "Confirmed",
      createdAt: "2026-06-06T09:00:00.000Z",
      confirmedAt: "2026-06-06T09:00:00.000Z",
    },
  ],
  "job-002": [
    {
      id: "job-002-v1",
      jobProfileId: "job-002",
      version: 1,
      title: baseProfile2.title,
      jdText: baseProfile2.jdText,
      searchCondition: baseProfile2.searchCondition,
      hardRequirements: baseProfile2.hardRequirements,
      softRequirements: baseProfile2.softRequirements,
      status: "Confirmed",
      createdAt: "2026-06-07T16:20:00.000Z",
      confirmedAt: "2026-06-07T16:20:00.000Z",
    },
  ],
};

export const mockCandidateSummary: CandidateSummary = {
  jobProfileId: "job-001",
  jobProfileVersionId: "job-1-v3",
  currentVersionCandidates: mockCandidates.filter((c) => c.assessedVersion === 3),
  staleVersionCandidates: mockCandidates.filter((c) => c.assessedVersion !== 3),
};
