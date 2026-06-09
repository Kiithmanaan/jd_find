import React, { useMemo, useState, useCallback } from "react";
import { TopBar } from "./components/layout/TopBar.js";
import { SideNav } from "./components/layout/SideNav.js";
import { Button } from "./components/ui/button.js";
import { Input } from "./components/ui/input.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select.js";
import { Card, CardContent } from "./components/ui/card.js";
import { Badge } from "./components/ui/badge.js";
import { Separator } from "./components/ui/separator.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./components/ui/dialog.js";
import { KeyValue } from "./components/shared/KeyValue.js";
import { EmptyState } from "./components/shared/EmptyState.js";
import { ErrorState } from "./components/shared/ErrorState.js";
import { LoadingSkeleton } from "./components/shared/LoadingSkeleton.js";
import type { AIAudit, Candidate, CandidateStatus, JobProfile, JobProfileStatus, ProfileForm, Recommendation, SearchRun } from "./lib/types.js";
import { initialSearchRun, mockCandidates as mockData, baseProfile, mockProfiles, mockAudit } from "./lib/mock-data.js";

type PageId = "profiles" | "profile-editor" | "search-run" | "candidate-summary";

export function App(): React.ReactElement {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [page, setPage] = useState<PageId>("profiles");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | undefined>();
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | undefined>();
  const [selectedProfileId, setSelectedProfileId] = useState(baseProfile.id);
  const [searchRun, setSearchRun] = useState<SearchRun>(initialSearchRun);
  const [searchRunError, setSearchRunError] = useState<string | undefined>();
  const [profiles, setProfiles] = useState<JobProfile[]>(mockProfiles);
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | "All">("All");
  const [recFilter, setRecFilter] = useState<Recommendation | "All">("All");
  const [profileStatusFilter, setProfileStatusFilter] = useState<JobProfileStatus | "All">("All");
  const [profileKwFilter, setProfileKwFilter] = useState("");
  const [dialog, setDialog] = useState<"match" | "audit" | undefined>();
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const [form, setForm] = useState<ProfileForm>(createProfileForm(baseProfile));
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [msg, setMsg] = useState("本原型使用本地 mock 数据。");

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) ?? profiles[0],
    [profiles, selectedProfileId],
  );

  const visibleCandidates = useMemo(() => {
    return [...mockData]
      .filter(
        (c) =>
          (statusFilter === "All" || c.status === statusFilter) &&
          (recFilter === "All" || c.matchAssessment?.recommendation === recFilter),
      )
      .sort((a, b) => (b.matchAssessment?.score ?? 0) - (a.matchAssessment?.score ?? 0));
  }, [statusFilter, recFilter]);

  const visibleProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if (profileStatusFilter !== "All" && p.status !== profileStatusFilter) return false;
      if (profileKwFilter) {
        const kw = profileKwFilter.trim().toLowerCase();
        return (
          p.title.toLowerCase().includes(kw) ||
          p.owner.toLowerCase().includes(kw) ||
          p.searchCondition.keywords.toLowerCase().includes(kw)
        );
      }
      return true;
    });
  }, [profiles, profileStatusFilter, profileKwFilter]);

  // 模拟页面初始加载
  const handlePageChange = useCallback(
    (nextPage: PageId) => {
      setPage(nextPage);
      setPageError(undefined);
      setPageLoading(true);
      setTimeout(() => setPageLoading(false), 300);
    },
    [],
  );

  // 异步登录处理
  const handleLogin = useCallback(() => {
    setLoginLoading(true);
    setLoginError(undefined);

    // 模拟异步登录
    const mockLogin = async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      setIsLoggedIn(true);
      setPageLoading(false);
    };

    mockLogin().catch(() => {
      setLoginError("登录失败，请检查账号密码。");
      setLoginLoading(false);
    });
  }, []);

  if (!isLoggedIn) {
    return (
      <LoginPage
        loading={loginLoading}
        error={loginError}
        onLogin={handleLogin}
      />
    );
  }

  const selectedCandidate =
    dialog === "match" ? mockData.find((c) => c.id === selectedCandidateId) : undefined;
  const selectedAudit = dialog === "audit" ? mockAudit : undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar userEmail="hunter@example.com" onLogout={() => setIsLoggedIn(false)} />
      <div className="flex flex-1">
        <SideNav currentPath={page} onNavigate={handlePageChange} />
        <main className="flex-1 p-5 min-w-0">
          <div className="mb-3 text-xs text-muted-foreground">
            {selectedProfile.title} /{" "}
            {page === "profiles"
              ? "JobProfile 列表"
              : page === "profile-editor"
                ? "创建/编辑画像"
                : page === "search-run"
                  ? "SearchRun 详情"
                  : "候选人汇总"}
          </div>
          <div className="mb-3 rounded border px-3 py-2 text-sm bg-background">{msg}</div>

          {pageLoading ? <LoadingSkeleton rows={5} /> : null}

          {!pageLoading && pageError ? (
            <ErrorState message={pageError} onRetry={() => handlePageChange(page)} />
          ) : null}

          {!pageLoading && !pageError && page === "profiles" ? (
            <ProfileList
              profiles={visibleProfiles}
              statusFilter={profileStatusFilter}
              kwFilter={profileKwFilter}
              onStatusFilter={setProfileStatusFilter}
              onKwFilter={setProfileKwFilter}
              onNew={() => {
                setForm(emptyForm());
                setFormErrors([]);
                setShowConfirm(false);
                setPage("profile-editor");
              }}
              onEdit={(p) => {
                setSelectedProfileId(p.id);
                setForm(createProfileForm(p));
                setFormErrors([]);
                setShowConfirm(false);
                setPage("profile-editor");
              }}
              onOpen={(id) => {
                setSelectedProfileId(id);
              }}
            />
          ) : null}

          {!pageLoading && !pageError && page === "profile-editor" ? (
            <ProfileEditor
              form={form}
              errors={formErrors}
              showConfirm={showConfirm}
              onFieldChange={(f, v) => {
                setForm({ ...form, [f]: v });
                setFormErrors([]);
              }}
              onShowConfirm={() => {
                // 表单校验
                const errs: string[] = [];
                if (!form.title.trim()) errs.push("岗位名称不能为空。");
                if (!form.hardRequirements.trim()) errs.push("硬性条件不能为空。");
                if (!form.softRequirements.trim()) errs.push("软性条件不能为空。");
                if (errs.length > 0) {
                  setFormErrors(errs);
                  return;
                }
                setShowConfirm(true);
              }}
              onConfirm={() => {
                const np = createJobProfileFromForm(form, profiles.length);
                setProfiles([...profiles, np]);
                setSelectedProfileId(np.id);
                setShowConfirm(false);
                setPage("profiles");
                setMsg("已确认岗位画像 mock version。");
              }}
              onCancel={() => setPage("profiles")}
            />
          ) : null}

          {!pageLoading && !pageError && page === "search-run" ? (
            <SearchRunDetail
              searchRun={searchRun}
              candidates={visibleCandidates}
              error={searchRunError}
              audits={[mockAudit]}
              statusFilter={statusFilter}
              recFilter={recFilter}
              onStatusFilter={setStatusFilter}
              onRecFilter={setRecFilter}
              onCancel={() => {
                if (window.confirm("确认取消？")) {
                  setSearchRun({ ...searchRun, status: "Cancelled", reason: "手动取消。" });
                  setMsg("SearchRun 已取消。");
                }
              }}
              onSimulate={() => {
                setSearchRun({ ...searchRun, status: "Running", rawSubmittedCount: 42 });
                setSearchRunError(undefined);
                setMsg("模拟插件已提交。");
              }}
              onSimulateError={() => {
                setSearchRunError("模拟采集失败：来源平台返回 403。");
              }}
              onOpenMatch={(id) => {
                setSelectedCandidateId(id);
                setSelectedAuditId("");
                setDialog("match");
              }}
              onOpenAudit={() => {
                setSelectedCandidateId("");
                setSelectedAuditId("audit-001");
                setDialog("audit");
              }}
              onDownload={(c) =>
                setMsg(c.hasAttachment ? `模拟下载 ${c.name}` : `${c.name} 无附件`)
              }
            />
          ) : null}

          {!pageLoading && !pageError && page === "candidate-summary" ? (
            <CandidateSummary profile={selectedProfile} candidates={mockData} />
          ) : null}

          <Dialog
            open={dialog === "match" && Boolean(selectedCandidate)}
            onOpenChange={() => setDialog(undefined)}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>匹配详情</DialogTitle>
              </DialogHeader>
              {selectedCandidate ? <MatchDetail candidate={selectedCandidate} /> : null}
            </DialogContent>
          </Dialog>

          <Dialog
            open={dialog === "audit" && Boolean(selectedAudit)}
            onOpenChange={() => setDialog(undefined)}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>AI 审计详情</DialogTitle>
              </DialogHeader>
              {selectedAudit ? <AuditDetail audit={selectedAudit} /> : null}
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  );
}

// ─── LoginPage ──────────────────────────────────────────────────────

function LoginPage(props: {
  loading: boolean;
  error: string | undefined;
  onLogin: () => void;
}): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">JD Search</p>
            <h1 className="text-xl font-semibold">Web 登录</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            插件登录不在本系统实现；插件项目负责自己的登录、采集和候选人提交。
          </p>
          <Input value="hunter@example.com" readOnly />
          <Input type="password" value="mock-password" readOnly />
          {props.error ? (
            <p className="text-xs text-destructive">{props.error}</p>
          ) : null}
          <Button
            className="w-full"
            disabled={props.loading}
            onClick={props.onLogin}
          >
            {props.loading ? "登录中…" : "进入系统"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

// ─── ProfileList ────────────────────────────────────────────────────

function ProfileList(props: {
  profiles: JobProfile[];
  statusFilter: JobProfileStatus | "All";
  kwFilter: string;
  onStatusFilter: (v: JobProfileStatus | "All") => void;
  onKwFilter: (v: string) => void;
  onNew: () => void;
  onEdit: (p: JobProfile) => void;
  onOpen: (id: string) => void;
}): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">JobProfile 列表</h2>
        <Button onClick={props.onNew}>新建岗位画像</Button>
      </div>
      <div className="flex gap-3 items-end p-3 border rounded bg-muted/20">
        <Select
          value={props.statusFilter}
          onValueChange={(v) => props.onStatusFilter(v as JobProfileStatus | "All")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">全部状态</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Confirmed">Confirmed</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="w-[200px]"
          placeholder="关键词筛选"
          value={props.kwFilter}
          onChange={(e) => props.onKwFilter(e.target.value)}
        />
      </div>
      {props.profiles.length === 0 ? (
        <EmptyState text="暂无岗位画像，请点击上方「新建岗位画像」创建。" />
      ) : (
        <div className="space-y-2">
          {props.profiles.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => props.onOpen(p.id)}
            >
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <Badge
                      variant={p.status === "Confirmed" ? "default" : "secondary"}
                    >
                      v{p.version}
                    </Badge>
                    <Badge variant="outline">{p.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {p.owner} · {p.updatedAt} · SearchRun: {p.searchRunCount}
                  </p>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button variant="outline" size="sm" onClick={() => props.onEdit(p)}>
                    编辑
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ProfileEditor ──────────────────────────────────────────────────

function ProfileEditor(props: {
  form: ProfileForm;
  errors: string[];
  showConfirm: boolean;
  onFieldChange: (f: keyof ProfileForm, v: string | number) => void;
  onShowConfirm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const f = (field: keyof ProfileForm) => props.form[field];
  return (
    <div className="grid grid-cols-[1.4fr,0.6fr] gap-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <h2 className="text-lg font-semibold mb-0">JobProfile 创建/编辑/确认</h2>
          {props.errors.length > 0 ? (
            <div className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive space-y-1">
              {props.errors.map((err, i) => (
                <p key={i}>· {err}</p>
              ))}
            </div>
          ) : null}
          <div>
            <label className="text-sm font-medium">岗位名称</label>
            <Input
              value={String(f("title"))}
              onChange={(e) => props.onFieldChange("title", e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">JD 原文</label>
            <textarea
              className="flex min-h-24 w-full rounded-md border border-input px-3 py-2 text-sm"
              value={String(f("jdText"))}
              onChange={(e) => props.onFieldChange("jdText", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">关键词</label>
              <Input
                value={String(f("keywords"))}
                onChange={(e) => props.onFieldChange("keywords", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">城市</label>
              <Input
                value={String(f("cities"))}
                onChange={(e) => props.onFieldChange("cities", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">行业</label>
              <Input
                value={String(f("industries"))}
                onChange={(e) => props.onFieldChange("industries", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">学历</label>
              <Input
                value={String(f("educationLevels"))}
                onChange={(e) => props.onFieldChange("educationLevels", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">最低年限</label>
            <Input
              type="number"
              value={Number(f("minYearsOfExperience"))}
              onChange={(e) =>
                props.onFieldChange("minYearsOfExperience", Number(e.target.value))
              }
            />
          </div>
          <div>
            <label className="text-sm font-medium">硬性条件规则</label>
            <textarea
              className="flex min-h-20 w-full rounded-md border border-input px-3 py-2 text-sm"
              value={String(f("hardRequirements"))}
              onChange={(e) => props.onFieldChange("hardRequirements", e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">软性条件</label>
            <textarea
              className="flex min-h-20 w-full rounded-md border border-input px-3 py-2 text-sm"
              value={String(f("softRequirements"))}
              onChange={(e) => props.onFieldChange("softRequirements", e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={props.onShowConfirm}>查看确认摘要</Button>
            <Button variant="outline" onClick={props.onCancel}>
              取消
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-2">AI 画像建议</h2>
          <p className="text-xs text-muted-foreground">第一版仅占位，不调用 AI。</p>
          {props.showConfirm ? (
            <div className="mt-4 pt-4 border-t space-y-2">
              <h3 className="font-semibold">确认摘要</h3>
              <KeyValue label="岗位" value={String(f("title") || "未填写")} />
              <KeyValue label="关键词" value={String(f("keywords") || "未填写")} />
              <KeyValue label="硬性条件" value={String(f("hardRequirements") || "未填写")} />
              <KeyValue label="软性条件" value={String(f("softRequirements") || "未填写")} />
              <Button onClick={props.onConfirm}>确认生成版本</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── CandidateTable ─────────────────────────────────────────────────

function CandidateTable(props: {
  candidates: Candidate[];
  onOpenMatch: (id: string) => void;
  onDownload: (c: Candidate) => void;
}): React.ReactElement {
  if (props.candidates.length === 0) {
    return <EmptyState text="暂无候选人。等待插件提交或尝试模拟提交。" />;
  }
  return (
    <div className="space-y-1">
      {props.candidates.map((c) => (
        <Card key={c.id}>
          <CardContent className="py-3 flex items-center gap-3 text-sm">
            <span className="font-medium w-16">{c.name}</span>
            <span className="flex-1 text-xs text-muted-foreground truncate">
              {c.title} / {c.city} / {c.educationLevel} / {c.yearsOfExperience}年
            </span>
            <Badge
              variant={c.status === "Displayable" ? "default" : "destructive"}
            >
              {c.status}
            </Badge>
            <span className="w-10 text-center">
              {c.matchAssessment?.recommendation ?? "无"}
            </span>
            <Button variant="ghost" size="sm" onClick={() => props.onOpenMatch(c.id)}>
              {c.matchAssessment?.score ?? "N/A"}
            </Button>
            <a
              href={c.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 text-xs underline w-24 truncate"
            >
              {c.sourcePlatform}
            </a>
            <Button variant="outline" size="sm" onClick={() => props.onDownload(c)}>
              {c.hasAttachment ? "下载" : "无"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── SearchRunDetail ────────────────────────────────────────────────

function SearchRunDetail(props: {
  searchRun: SearchRun;
  candidates: Candidate[];
  error: string | undefined;
  audits: AIAudit[];
  statusFilter: CandidateStatus | "All";
  recFilter: Recommendation | "All";
  onStatusFilter: (v: CandidateStatus | "All") => void;
  onRecFilter: (v: Recommendation | "All") => void;
  onCancel: () => void;
  onSimulate: () => void;
  onSimulateError: () => void;
  onOpenMatch: (id: string) => void;
  onOpenAudit: () => void;
  onDownload: (c: Candidate) => void;
}): React.ReactElement {
  const pct = Math.round(
    (props.searchRun.rawSubmittedCount / props.searchRun.targetResultCount) * 100,
  );
  const isTerminal =
    props.searchRun.status === "Completed" ||
    props.searchRun.status === "Cancelled";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{props.searchRun.id}</p>
          <h2 className="text-lg font-semibold">SearchRun 详情</h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={props.onSimulate}
            disabled={props.searchRun.status !== "WaitingPlugin"}
          >
            模拟插件提交
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={props.onSimulateError}
            disabled={isTerminal}
          >
            模拟采集错误
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={props.onCancel}
            disabled={isTerminal}
          >
            取消
          </Button>
        </div>
      </div>

      <div className="flex gap-3 text-sm">
        <Badge>{props.searchRun.status}</Badge>
        <span>
          {props.searchRun.rawSubmittedCount}/{props.searchRun.targetResultCount}
        </span>
        <span>{pct}%</span>
        <span>{props.searchRun.createdAt}</span>
      </div>

      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {props.searchRun.pluginInstruction}
      </p>

      {props.searchRun.reason ? (
        <p className="text-xs text-destructive">原因：{props.searchRun.reason}</p>
      ) : null}

      <Separator />

      {props.error ? (
        <ErrorState message={props.error} />
      ) : null}

      {!props.error ? (
        <>
          <div className="flex gap-3">
            <Select
              value={props.statusFilter}
              onValueChange={(v) =>
                props.onStatusFilter(v as CandidateStatus | "All")
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="处理状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">全部状态</SelectItem>
                <SelectItem value="Displayable">Displayable</SelectItem>
                <SelectItem value="HardRejected">HardRejected</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={props.recFilter}
              onValueChange={(v) => props.onRecFilter(v as Recommendation | "All")}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="推荐结论" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">全部</SelectItem>
                <SelectItem value="推荐">推荐</SelectItem>
                <SelectItem value="待定">待定</SelectItem>
                <SelectItem value="不推荐">不推荐</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <CandidateTable
            candidates={props.candidates}
            onOpenMatch={props.onOpenMatch}
            onDownload={props.onDownload}
          />
        </>
      ) : null}

      <Separator />
      <div>
        <h3 className="font-semibold mb-2">AI 审计</h3>
        {props.audits.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无 AI 审计记录。</p>
        ) : (
          props.audits.map((a) => (
            <Button
              key={a.id}
              variant="ghost"
              size="sm"
              onClick={props.onOpenAudit}
            >
              {a.provider} / {a.model} / {a.status}
            </Button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── MatchDetail ────────────────────────────────────────────────────

function MatchDetail(props: { candidate: Candidate }): React.ReactElement {
  const a = props.candidate.matchAssessment;
  if (!a) {
    return (
      <div className="space-y-3">
        <h3 className="font-semibold">{props.candidate.name}</h3>
        <EmptyState text="该候选人暂无 AI 匹配评估结果。" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{props.candidate.name}</h3>
      <KeyValue label="推荐结论" value={a.recommendation} />
      <KeyValue label="匹配分" value={`${a.score}`} />
      <KeyValue label="推荐说明" value={a.recommendationReason} />
      <div>
        <h4 className="text-sm font-medium">合适点</h4>
        {a.matchedPoints.length > 0
          ? a.matchedPoints.map((p, i) => (
              <p key={i} className="text-xs">
                · {p}
              </p>
            ))
          : <p className="text-xs text-muted-foreground">无</p>}
      </div>
      <div>
        <h4 className="text-sm font-medium">不合适点</h4>
        {a.unmatchedPoints.length > 0
          ? a.unmatchedPoints.map((p, i) => (
              <p key={i} className="text-xs">
                · {p}
              </p>
            ))
          : <p className="text-xs text-muted-foreground">无</p>}
      </div>
      <div>
        <h4 className="text-sm font-medium">风险点</h4>
        {a.riskPoints.length > 0
          ? a.riskPoints.map((p, i) => (
              <p key={i} className="text-xs">
                · {p}
              </p>
            ))
          : <p className="text-xs text-muted-foreground">无</p>}
      </div>
      <div>
        <h4 className="text-sm font-medium">Trace</h4>
        <p className="text-xs">{a.trace}</p>
      </div>
      <div>
        <h4 className="text-sm font-medium">来源线索</h4>
        {props.candidate.fallbackClues.length > 0
          ? props.candidate.fallbackClues.map((c, i) => (
              <p key={i} className="text-xs">
                · {c}
              </p>
            ))
          : <p className="text-xs text-muted-foreground">无</p>}
      </div>
    </div>
  );
}

// ─── AuditDetail ────────────────────────────────────────────────────

function AuditDetail(props: { audit: AIAudit }): React.ReactElement {
  if (!props.audit) {
    return <EmptyState text="无法加载 AI 审计记录。" />;
  }
  return (
    <div className="space-y-2">
      <KeyValue label="provider" value={props.audit.provider} />
      <KeyValue label="model" value={props.audit.model} />
      <KeyValue label="prompt version" value={props.audit.promptVersion} />
      <KeyValue label="duration" value={`${props.audit.durationMs}ms`} />
      <KeyValue label="status" value={props.audit.status} />
      <h4 className="text-sm font-medium mt-2">inputSnapshot</h4>
      <pre className="text-xs overflow-auto">
        {JSON.stringify(props.audit.inputSnapshot, null, 2)}
      </pre>
      <h4 className="text-sm font-medium mt-2">outputSnapshot</h4>
      <pre className="text-xs overflow-auto">
        {JSON.stringify(props.audit.outputSnapshot, null, 2)}
      </pre>
    </div>
  );
}

// ─── CandidateSummary ───────────────────────────────────────────────

function CandidateSummary(props: {
  profile: JobProfile;
  candidates: Candidate[];
}): React.ReactElement {
  const cur = props.candidates.filter(
    (c) => c.assessedVersion === props.profile.version,
  );
  const stale = props.candidates.filter(
    (c) => c.assessedVersion !== props.profile.version,
  );

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-2">
            当前版本已评估 ({cur.length})
          </h3>
          {cur.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              当前版本下暂无已评估候选人。
            </p>
          ) : (
            cur.map((c) => (
              <p key={c.id} className="text-sm">
                · {c.name} / v{c.assessedVersion}
              </p>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-2">
            未按当前版本评估 ({stale.length})
          </h3>
          {stale.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              所有候选人均按当前版本评估。
            </p>
          ) : (
            stale.map((c) => (
              <p key={c.id} className="text-sm">
                · {c.name} / v{c.assessedVersion}
              </p>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 辅助函数 ───────────────────────────────────────────────────────

function createProfileForm(p: JobProfile): ProfileForm {
  return {
    title: p.title,
    jdText: p.jdText,
    keywords: p.searchCondition.keywords,
    cities: p.searchCondition.cities,
    industries: p.searchCondition.industries,
    educationLevels: p.searchCondition.educationLevels,
    minYearsOfExperience: p.searchCondition.minYearsOfExperience,
    hardRequirements: p.hardRequirements.join("\n"),
    softRequirements: p.softRequirements,
  };
}

function emptyForm(): ProfileForm {
  return {
    title: "",
    jdText: "",
    keywords: "",
    cities: "",
    industries: "",
    educationLevels: "",
    minYearsOfExperience: 0,
    hardRequirements: "",
    softRequirements: "",
  };
}

function createJobProfileFromForm(f: ProfileForm, idx: number): JobProfile {
  return {
    id: `job-mock-${idx}`,
    title: f.title || "未命名",
    version: 1,
    status: "Confirmed",
    owner: "hunter@example.com",
    updatedAt: "刚刚",
    searchRunCount: 0,
    jdText: f.jdText,
    searchCondition: {
      keywords: f.keywords,
      cities: f.cities,
      industries: f.industries,
      educationLevels: f.educationLevels,
      minYearsOfExperience: f.minYearsOfExperience,
    },
    hardRequirements: f.hardRequirements.split("\n").filter(Boolean),
    softRequirements: f.softRequirements,
    prompt: "mock prompt",
  };
}
