import type {
  AIAudit,
  Candidate,
  CandidateSummary,
  CreateSearchRunRequest,
  CreateSearchRunResponse,
  JobProfile,
  SearchRun,
} from "./types.js";
import {
  mockAudit,
  mockCandidateSummary,
  mockCandidates,
  mockProfiles,
  createMockSearchRun,
  buildMockSearchRun,
  mockHardConditionConfig,
} from "./mock-data.js";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJobProfiles(): Promise<JobProfile[]> {
  await delay(200);
  return structuredClone(mockProfiles);
}

export async function fetchJobProfile(id: string): Promise<JobProfile | undefined> {
  await delay(100);
  const profile = mockProfiles.find((p) => p.id === id);
  return profile ? structuredClone(profile) : undefined;
}

// ─── SearchRun 内存 store ──────────────────────────────────────────

const searchRunStore = new Map<string, SearchRun>();
const simulationTimers = new Map<string, ReturnType<typeof setInterval>>();

export async function createSearchRun(request: CreateSearchRunRequest): Promise<CreateSearchRunResponse> {
  await delay(400);

  const response = createMockSearchRun(request.jobProfile, request.targetResultCount);
  const searchRun = buildMockSearchRun(
    response.searchRunId,
    request.jobProfile,
    request.targetResultCount,
    [],
    "Running",
  );
  searchRun.events = [{ type: "SearchStarted", occurredAt: new Date().toISOString() }];
  searchRunStore.set(response.searchRunId, searchRun);

  return response;
}

export async function fetchSearchRun(id: string): Promise<SearchRun | undefined> {
  await delay(80);
  const cached = searchRunStore.get(id);
  return cached ? structuredClone(cached) : undefined;
}

/** 模拟重评估 — 微调已评估候选人的分数 */
export async function reassessSearchRun(id: string): Promise<SearchRun | undefined> {
  await delay(1500);
  const existing = searchRunStore.get(id);
  if (!existing) {
    return undefined;
  }

  const candidates = existing.candidates.map((candidate) => {
    if (!candidate.matchAssessment) {
      return candidate;
    }

    const scoreShift = Math.round((Math.random() - 0.5) * 12);
    const newScore = Math.max(0, Math.min(100, candidate.matchAssessment.score + scoreShift));
    let recommendation = candidate.matchAssessment.recommendation;
    if (newScore >= 85) recommendation = '推荐';
    else if (newScore >= 60) recommendation = '待定';
    else recommendation = '不推荐';

    return {
      ...candidate,
      matchAssessment: {
        ...candidate.matchAssessment,
        score: newScore,
        recommendation,
        trace: candidate.matchAssessment.trace + '; 重评估 v' + String(Date.now()).slice(-4),
      },
    };
  });

  const updated = {
    ...existing,
    candidates,
    updatedAt: new Date().toISOString(),
  };
  searchRunStore.set(id, updated);
  return structuredClone(updated);
}

/** 模拟插件一次提交 */
export function simulatePluginSubmit(searchRunId: string, count: number): SearchRun | undefined {
  const existing = searchRunStore.get(searchRunId);
  if (!existing) {
    return undefined;
  }

  const submitted = mockCandidates.slice(0, Math.min(count, mockCandidates.length));
  const now = new Date().toISOString();
  const progressEvents = [
    { type: "CandidateResultsAcquired", occurredAt: now },
    { type: "CandidateResultsDeduplicated", occurredAt: now },
    { type: "HardFilterCompleted", occurredAt: now },
    { type: "SoftMatchAssessed", occurredAt: now },
  ];
  if (count >= existing.targetResultCount) {
    progressEvents.push({ type: "SearchCompleted", occurredAt: new Date().toISOString() });
  }
  const updated: SearchRun = {
    ...existing,
    status: count >= existing.targetResultCount ? "Completed" : "Assessed",
    rawSubmittedCount: count,
    updatedAt: now,
    events: [...existing.events, ...progressEvents],
    candidates: submitted.map((c) => ({
      ...c,
      status: c.status as SearchRun["candidates"][number]["status"],
    })),
  };

  searchRunStore.set(searchRunId, updated);
  return structuredClone(updated);
}

/** 启动渐进式自动模拟寻访 */
export function startAutoSimulation(
  searchRunId: string,
  targetCount: number,
  onUpdate: (updated: SearchRun) => void,
): void {
  stopAutoSimulation(searchRunId);

  let currentCount = 0;
  const stepSize = 2;
  const STEP_INTERVAL_MS = 2500;

  const timer = setInterval(() => {
    currentCount = Math.min(currentCount + stepSize, targetCount);
    const updated = simulatePluginSubmit(searchRunId, currentCount);
    if (updated) {
      onUpdate(updated);
    }
    if (currentCount >= targetCount || !updated) {
      clearInterval(timer);
      simulationTimers.delete(searchRunId);
    }
  }, STEP_INTERVAL_MS);

  simulationTimers.set(searchRunId, timer);
}

/** 停止自动模拟寻访 */
export function stopAutoSimulation(searchRunId: string): void {
  const timer = simulationTimers.get(searchRunId);
  if (timer) {
    clearInterval(timer);
    simulationTimers.delete(searchRunId);
  }
}

// ─── 手动添加候选人 ──────────────────────────────────────────────

export interface ManualCandidateForm {
  name: string;
  title: string;
  city: string;
  educationLevel: string;
  yearsOfExperience: number;
  industries: string;
  keywords: string;
  summary: string;
  intent: string;
  activityLevel: string;
  sourcePlatform: string;
  sourceUrl: string;
}

export async function addManualCandidate(searchRunId: string, form: ManualCandidateForm): Promise<SearchRun> {
  await delay(300);
  const run = searchRunStore.get(searchRunId);
  if (!run) throw new Error("SearchRun not found");

  const candidate: Candidate = {
    id: "manual-" + Date.now(),
    name: form.name,
    title: form.title,
    city: form.city,
    educationLevel: form.educationLevel,
    yearsOfExperience: form.yearsOfExperience,
    industries: form.industries.split(",").map((s) => s.trim()).filter(Boolean),
    keywords: form.keywords.split(",").map((s) => s.trim()).filter(Boolean),
    summary: form.summary,
    intent: form.intent,
    activityLevel: form.activityLevel,
    sourcePlatform: form.sourcePlatform,
    sourceUrl: form.sourceUrl || "",
    fallbackClues: [],
    status: "Acquired",
    hardRejectReasons: [],
    hasAttachment: false,
    assessedVersion: 0,
  };

  run.candidates.push(candidate);
  run.rawSubmittedCount += 1;
  run.updatedAt = new Date().toISOString();
  searchRunStore.set(searchRunId, run);
  return structuredClone(run);
}

// ─── 附件上传 ──────────────────────────────────────────────────────

export async function uploadAttachment(
  searchRunId: string,
  candidateId: string,
  filename: string,
  contentType: string,
  sizeBytes: number,
): Promise<SearchRun> {
  await delay(400);
  const run = searchRunStore.get(searchRunId);
  if (!run) throw new Error("SearchRun not found");

  const idx = run.candidates.findIndex((c) => c.id === candidateId);
  if (idx === -1) throw new Error("Candidate not found");

  run.candidates[idx] = {
    ...run.candidates[idx],
    hasAttachment: true,
    resumeAttachment: {
      filename,
      contentType: contentType || "application/octet-stream",
      sizeBytes,
      receivedAt: new Date().toISOString(),
    },
  };

  searchRunStore.set(searchRunId, run);
  return structuredClone(run);
}

// ─── 其他 mock 接口 ────────────────────────────────────────────────

export async function fetchCandidates(): Promise<Candidate[]> {
  await delay(200);
  return structuredClone(mockCandidates);
}

export async function fetchAIAudits(): Promise<AIAudit[]> {
  await delay(100);
  return [structuredClone(mockAudit)];
}

export async function fetchCandidateSummary(_profileId: string): Promise<CandidateSummary> {
  await delay(150);
  return structuredClone(mockCandidateSummary);
}


// ─── 硬筛配置 ──────────────────────────────────────────────────────

export async function fetchHardConditionConfig(): Promise<{ dimensions: import("./types.js").HardConditionConfigDimension[] }> {
  await delay(120);
  return structuredClone(mockHardConditionConfig);
}



/** 导出 SearchRun 候选人为 CSV */
export async function exportSearchRunCsv(id: string): Promise<string> {
  await delay(300);
  const run = searchRunStore.get(id);
  if (!run || run.candidates.length === 0) {
    throw new Error("没有可导出的候选人。");
  }

  const headers = ["姓名","职位","城市","学历","工作年限","行业","状态","匹配分","推荐结论","来源平台","来源URL"];
  const rows = run.candidates.map((c) => [
    escapeCsv(c.name),
    escapeCsv(c.title),
    escapeCsv(c.city),
    escapeCsv(c.educationLevel),
    String(c.yearsOfExperience),
    escapeCsv(c.industries.join(";")),
    c.status,
    c.matchAssessment ? String(c.matchAssessment.score) : "-",
    c.matchAssessment ? c.matchAssessment.recommendation : "-",
    escapeCsv(c.sourcePlatform),
    escapeCsv(c.sourceUrl),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** 重试失败的 SearchRun — 重置为 Running */
export async function retrySearchRun(id: string): Promise<SearchRun | undefined> {
  await delay(300);
  const existing = searchRunStore.get(id);
  if (!existing) {
    return undefined;
  }
  if (existing.status !== "Failed" && existing.status !== "Cancelled") {
    return undefined;
  }

  const updated: SearchRun = {
    ...existing,
    status: "Running",
    failureReason: undefined,
    updatedAt: new Date().toISOString(),
    events: [...existing.events, { type: "SearchStarted", occurredAt: new Date().toISOString() }],
  };
  searchRunStore.set(id, updated);
  return structuredClone(updated);
}

export async function login(_email: string, _password: string): Promise<{ token: string }> {
  await delay(300);
  return { token: "mock-jwt-token" };
}
