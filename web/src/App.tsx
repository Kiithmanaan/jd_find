import {
  Activity,
  BadgeCheck,
  Database,
  FileJson,
  KeyRound,
  Play,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

type AuthTokenType = "web" | "plugin";
type RequestMethod = "GET" | "POST";
type SearchRunStatus =
  | "Created"
  | "Running"
  | "Acquired"
  | "Deduplicated"
  | "HardFiltered"
  | "Assessed"
  | "Completed"
  | "Interrupted"
  | "Failed"
  | "Cancelled";
type CandidateResultStatus = "Pending" | "Acquired" | "Deduplicated" | "HardPassed" | "HardRejected" | "Assessed" | "Displayable";

interface LoginResponse {
  token: string;
  tokenType: "Bearer";
  expiresIn: number;
}

interface ApiErrorResponse {
  error: string;
  message?: string;
  issues?: Array<{
    path: string;
    message: string;
  }>;
}

interface JobProfile {
  id: string;
  title: string;
  jdText: string;
  status: "Confirmed";
  searchCondition: {
    keywords: string[];
    cities: string[];
    industries: string[];
    educationLevels: string[];
    minYearsOfExperience: number;
  };
  hardRequirements: Array<{
    key: string;
    label: string;
    weight: number;
    predicate:
      | { type: "minYearsOfExperience"; value: number }
      | { type: "educationIn"; values: string[] }
      | { type: "keywordAny"; values: string[] }
      | { type: "industryIn"; values: string[] };
  }>;
  softRequirements: Array<{
    key: string;
    label: string;
    weight: number;
    description: string;
  }>;
  confirmedAt: string;
}

interface CandidateDraft {
  fingerprint: string;
  resume: {
    name: string;
    title: string;
    city: string;
    educationLevel: string;
    yearsOfExperience: number;
    industries: string[];
    keywords: string[];
    summary: string;
  };
  intent: string;
  activityLevel: string;
  sourceLead: {
    platform: string;
    url?: string;
    searchContext: string;
    fallbackClues: string[];
  };
}

interface MatchAssessment {
  score: number;
  fitPoints: string[];
  riskPoints: string[];
  assessedAt: string;
  jobProfileVersionId?: string;
}

interface CandidateResult {
  id: string;
  fingerprint: string;
  status: CandidateResultStatus;
  resume: CandidateDraft["resume"];
  intent: string;
  activityLevel: string;
  sourceLead: CandidateDraft["sourceLead"];
  hardRejectReasons: string[];
  matchAssessment?: MatchAssessment;
}

interface SearchRun {
  id: string;
  jobProfileId: string;
  jobProfileVersionId: string;
  ownerId?: string;
  status: SearchRunStatus;
  targetResultCount: number;
  rawSubmittedCount: number;
  candidates: CandidateResult[];
  failureReason?: string;
  interruptedReason?: string;
}

interface CreateSearchRunResponse {
  searchRunId: string;
  status: SearchRunStatus;
  statusUrl: string;
}

interface SubmitCandidatesResponse {
  searchRunId: string;
  status: SearchRunStatus;
  rawSubmittedCount: number;
  acceptedCount: number;
  candidateCount: number;
}

interface AIAuditRecord {
  id: string;
  provider: string;
  model: string;
  candidateIds: string[];
  createdAt: string;
}

interface AIAuditResponse {
  searchRunId: string;
  records: AIAuditRecord[];
}

interface ApiRequestOptions {
  apiBase: string;
  method: RequestMethod;
  path: string;
  token: string | undefined;
  body: unknown | undefined;
}

interface MessageState {
  type: "idle" | "success" | "error";
  text: string;
}

const defaultJobProfile: JobProfile = {
  id: "job-console-demo",
  title: "高级解决方案顾问",
  jdText: "需要具备企业服务、复杂项目推动和客户理解能力。",
  status: "Confirmed",
  confirmedAt: new Date().toISOString(),
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

const defaultCandidates: CandidateDraft[] = [
  {
    fingerprint: "console-candidate-a",
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
      platform: "BrowserPlugin",
      url: "https://example.test/console-candidate-a",
      searchContext: "关键词：解决方案；城市：上海",
      fallbackClues: ["解决方案顾问", "企业服务", "上海"],
    },
  },
  {
    fingerprint: "console-candidate-b",
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
      platform: "BrowserPlugin",
      url: "https://example.test/console-candidate-b",
      searchContext: "关键词：客户成功；城市：上海",
      fallbackClues: ["客户成功经理", "企业服务", "上海"],
    },
  },
];

export function App(): ReactElement {
  const [apiBase, setApiBase] = useState<string>(() => window.localStorage.getItem("jd-search-api-base") ?? "/api");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [webToken, setWebToken] = useState<string>("");
  const [pluginToken, setPluginToken] = useState<string>("");
  const [targetResultCount, setTargetResultCount] = useState<number>(50);
  const [jobProfileJson, setJobProfileJson] = useState<string>(formatJson(defaultJobProfile));
  const [candidateJson, setCandidateJson] = useState<string>(formatJson(defaultCandidates));
  const [searchRunId, setSearchRunId] = useState<string>("");
  const [searchRun, setSearchRun] = useState<SearchRun | undefined>(undefined);
  const [audits, setAudits] = useState<AIAuditRecord[]>([]);
  const [message, setMessage] = useState<MessageState>({ type: "idle", text: "" });
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateResult | undefined>(undefined);

  const progressPercent = useMemo<number>(() => {
    if (!searchRun || searchRun.targetResultCount === 0) {
      return 0;
    }

    return Math.min(100, Math.round((searchRun.rawSubmittedCount / searchRun.targetResultCount) * 100));
  }, [searchRun]);

  async function handleLogin(tokenType: AuthTokenType): Promise<void> {
    setIsBusy(true);
    setMessage({ type: "idle", text: "" });
    try {
      const path = tokenType === "web" ? "/auth/login" : "/plugin/auth/login";
      const result = await apiRequest<LoginResponse>({
        apiBase,
        method: "POST",
        path,
        token: undefined,
        body: { email, password },
      });

      if (tokenType === "web") {
        setWebToken(result.token);
      } else {
        setPluginToken(result.token);
      }

      setMessage({ type: "success", text: tokenType === "web" ? "Web 登录已完成。" : "插件登录已完成。" });
    } catch (error) {
      setMessage({ type: "error", text: toErrorMessage(error) });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateSearchRun(): Promise<void> {
    setIsBusy(true);
    setMessage({ type: "idle", text: "" });
    try {
      const jobProfile = parseJson<JobProfile>(jobProfileJson);
      const result = await apiRequest<CreateSearchRunResponse>({
        apiBase,
        method: "POST",
        path: "/search-runs/one-time",
        token: webToken,
        body: {
          jobProfile,
          sourceType: "plugin",
          targetResultCount,
        },
      });

      setSearchRunId(result.searchRunId);
      setMessage({ type: "success", text: `SearchRun 已创建：${result.searchRunId}` });
      await loadSearchRun(result.searchRunId);
    } catch (error) {
      setMessage({ type: "error", text: toErrorMessage(error) });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSubmitCandidates(): Promise<void> {
    if (!searchRunId) {
      setMessage({ type: "error", text: "缺少 SearchRun ID。" });
      return;
    }

    setIsBusy(true);
    setMessage({ type: "idle", text: "" });
    try {
      const candidates = parseJson<CandidateDraft[]>(candidateJson);
      const result = await apiRequest<SubmitCandidatesResponse>({
        apiBase,
        method: "POST",
        path: `/plugin/search-runs/${encodeURIComponent(searchRunId)}/candidates`,
        token: pluginToken,
        body: {
          batchId: `console-${Date.now()}`,
          sourcePlatform: "BrowserPlugin",
          candidates,
        },
      });

      setMessage({ type: "success", text: `已提交 ${result.acceptedCount} 条候选人。` });
      await loadSearchRun(result.searchRunId);
      await loadAudits(result.searchRunId);
    } catch (error) {
      setMessage({ type: "error", text: toErrorMessage(error) });
    } finally {
      setIsBusy(false);
    }
  }

  async function loadSearchRun(id: string): Promise<void> {
    const result = await apiRequest<SearchRun>({
      apiBase,
      method: "GET",
      path: `/search-runs/${encodeURIComponent(id)}`,
      token: webToken || pluginToken || undefined,
      body: undefined,
    });
    setSearchRun(result);
  }

  async function loadAudits(id: string): Promise<void> {
    const result = await apiRequest<AIAuditResponse>({
      apiBase,
      method: "GET",
      path: `/search-runs/${encodeURIComponent(id)}/ai-assessment-audits`,
      token: webToken || pluginToken || undefined,
      body: undefined,
    });
    setAudits(result.records);
  }

  async function handleRefresh(): Promise<void> {
    if (!searchRunId) {
      setMessage({ type: "error", text: "缺少 SearchRun ID。" });
      return;
    }

    setIsBusy(true);
    setMessage({ type: "idle", text: "" });
    try {
      await loadSearchRun(searchRunId);
      await loadAudits(searchRunId);
      setMessage({ type: "success", text: "数据已刷新。" });
    } catch (error) {
      setMessage({ type: "error", text: toErrorMessage(error) });
    } finally {
      setIsBusy(false);
    }
  }

  function handleApiBaseChange(value: string): void {
    setApiBase(value);
    window.localStorage.setItem("jd-search-api-base", value);
  }

  return (
    <main className="app-shell">
      <section className="top-bar">
        <div>
          <p className="eyebrow">JD Search Console</p>
          <h1>寻访运维工作台</h1>
        </div>
        <div className="api-base">
          <Database size={18} />
          <input value={apiBase} onChange={(event) => handleApiBaseChange(event.target.value)} aria-label="API Base" />
        </div>
      </section>

      <section className="workspace-grid">
        <section className="panel auth-panel">
          <PanelTitle icon={<UserRound size={18} />} title="账号" />
          <div className="field-grid">
            <label>
              <span>邮箱</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
            </label>
            <label>
              <span>密码</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </label>
          </div>
          <div className="button-row">
            <button onClick={() => void handleLogin("web")} disabled={isBusy}>
              <KeyRound size={16} />
              Web 登录
            </button>
            <button onClick={() => void handleLogin("plugin")} disabled={isBusy} className="secondary-button">
              <ShieldCheck size={16} />
              插件登录
            </button>
          </div>
          <div className="token-grid">
            <TokenBadge label="Web" active={Boolean(webToken)} />
            <TokenBadge label="Plugin" active={Boolean(pluginToken)} />
          </div>
        </section>

        <section className="panel run-panel">
          <PanelTitle icon={<Play size={18} />} title="SearchRun" />
          <div className="field-grid compact">
            <label>
              <span>目标数量</span>
              <input
                value={targetResultCount}
                type="number"
                min={10}
                max={500}
                onChange={(event) => setTargetResultCount(Number(event.target.value))}
              />
            </label>
            <label>
              <span>SearchRun ID</span>
              <input value={searchRunId} onChange={(event) => setSearchRunId(event.target.value)} />
            </label>
          </div>
          <div className="button-row">
            <button onClick={() => void handleCreateSearchRun()} disabled={isBusy || !webToken}>
              <Play size={16} />
              创建
            </button>
            <button onClick={() => void handleRefresh()} disabled={isBusy || !searchRunId} className="secondary-button">
              <RefreshCw size={16} />
              刷新
            </button>
          </div>
          {searchRun ? (
            <div className="run-summary">
              <div>
                <span>状态</span>
                <strong>{searchRun.status}</strong>
              </div>
              <div>
                <span>原始提交</span>
                <strong>
                  {searchRun.rawSubmittedCount}/{searchRun.targetResultCount}
                </strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          ) : null}
        </section>
      </section>

      <section className="editor-grid">
        <JsonPanel
          title="岗位画像"
          icon={<FileJson size={18} />}
          value={jobProfileJson}
          onChange={setJobProfileJson}
        />
        <JsonPanel
          title="候选人批次"
          icon={<Send size={18} />}
          value={candidateJson}
          onChange={setCandidateJson}
          action={
            <button onClick={() => void handleSubmitCandidates()} disabled={isBusy || !pluginToken || !searchRunId}>
              <Send size={16} />
              提交
            </button>
          }
        />
      </section>

      {message.type !== "idle" ? <div className={`message ${message.type}`}>{message.text}</div> : null}

      <section className="result-grid">
        <section className="panel wide-panel">
          <PanelTitle icon={<Search size={18} />} title="候选人" />
          <CandidateTable candidates={searchRun?.candidates ?? []} onSelect={setSelectedCandidate} />
        </section>
        <section className="panel audit-panel">
          <PanelTitle icon={<Activity size={18} />} title="AI 审计" />
          <div className="audit-list">
            {audits.map((audit) => (
              <div key={audit.id} className="audit-item">
                <strong>{audit.provider}</strong>
                <span>{audit.model}</span>
                <small>{audit.candidateIds.length} candidates</small>
              </div>
            ))}
            {audits.length === 0 ? <div className="empty-state">暂无记录</div> : null}
          </div>
        </section>
      </section>

      {selectedCandidate ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedCandidate(undefined)}>
          <section className="detail-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">{selectedCandidate.fingerprint}</p>
                <h2>{selectedCandidate.resume.name}</h2>
              </div>
              <button className="icon-button" onClick={() => setSelectedCandidate(undefined)} aria-label="关闭">
                ×
              </button>
            </div>
            <MatchDetail candidate={selectedCandidate} />
          </section>
        </div>
      ) : null}
    </main>
  );
}

function PanelTitle(props: { icon: ReactElement; title: string }): ReactElement {
  return (
    <div className="panel-title">
      {props.icon}
      <h2>{props.title}</h2>
    </div>
  );
}

function TokenBadge(props: { label: string; active: boolean }): ReactElement {
  return (
    <div className={props.active ? "token-badge active" : "token-badge"}>
      <BadgeCheck size={15} />
      <span>{props.label}</span>
    </div>
  );
}

function JsonPanel(props: {
  title: string;
  icon: ReactElement;
  value: string;
  onChange: (value: string) => void;
  action?: ReactElement;
}): ReactElement {
  return (
    <section className="panel json-panel">
      <div className="panel-title with-action">
        <div className="title-left">
          {props.icon}
          <h2>{props.title}</h2>
        </div>
        {props.action}
      </div>
      <textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} spellCheck={false} />
    </section>
  );
}

function CandidateTable(props: {
  candidates: CandidateResult[];
  onSelect: (candidate: CandidateResult) => void;
}): ReactElement {
  if (props.candidates.length === 0) {
    return <div className="empty-state">暂无候选人</div>;
  }

  return (
    <div className="candidate-table">
      <div className="table-head">
        <span>姓名</span>
        <span>职位</span>
        <span>状态</span>
        <span>匹配分</span>
      </div>
      {props.candidates.map((candidate) => (
        <button key={candidate.id} className="table-row" onClick={() => props.onSelect(candidate)}>
          <span>{candidate.resume.name}</span>
          <span>{candidate.resume.title}</span>
          <StatusPill status={candidate.status} />
          <span className="score-cell">{candidate.matchAssessment?.score ?? "—"}</span>
        </button>
      ))}
    </div>
  );
}

function StatusPill(props: { status: CandidateResultStatus }): ReactElement {
  return <span className={`status-pill status-${props.status}`}>{props.status}</span>;
}

function MatchDetail(props: { candidate: CandidateResult }): ReactElement {
  const assessment = props.candidate.matchAssessment;

  return (
    <div className="match-detail">
      <div className="detail-grid">
        <div>
          <span>城市</span>
          <strong>{props.candidate.resume.city}</strong>
        </div>
        <div>
          <span>学历</span>
          <strong>{props.candidate.resume.educationLevel}</strong>
        </div>
        <div>
          <span>年限</span>
          <strong>{props.candidate.resume.yearsOfExperience}</strong>
        </div>
        <div>
          <span>意向</span>
          <strong>{props.candidate.intent}</strong>
        </div>
      </div>
      {assessment ? (
        <>
          <section>
            <h3>合适点</h3>
            <TextList values={assessment.fitPoints} />
          </section>
          <section>
            <h3>风险点</h3>
            <TextList values={assessment.riskPoints} />
          </section>
        </>
      ) : (
        <section>
          <h3>硬性条件</h3>
          <TextList values={props.candidate.hardRejectReasons} />
        </section>
      )}
      <section>
        <h3>来源</h3>
        <p>{props.candidate.sourceLead.searchContext}</p>
      </section>
    </div>
  );
}

function TextList(props: { values: string[] }): ReactElement {
  if (props.values.length === 0) {
    return <p className="muted-text">暂无</p>;
  }

  return (
    <ul>
      {props.values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

async function apiRequest<TResponse>(options: ApiRequestOptions): Promise<TResponse> {
  const response = await fetch(`${options.apiBase}${options.path}`, {
    method: options.method,
    headers: createHeaders(options.token, options.body),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = (await response.json()) as TResponse | ApiErrorResponse;

  if (!response.ok) {
    throw new Error(formatApiError(body as ApiErrorResponse, response.status));
  }

  return body as TResponse;
}

function createHeaders(token: string | undefined, body: unknown | undefined): HeadersInit {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function parseJson<TValue>(value: string): TValue {
  return JSON.parse(value) as TValue;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatApiError(error: ApiErrorResponse, status: number): string {
  const issueText = error.issues?.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${status} ${error.error}${error.message ? `: ${error.message}` : ""}${issueText ? ` (${issueText})` : ""}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
