import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
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
import { CreateSearchRunDialog } from "./components/shared/CreateSearchRunDialog.js";
import { HardConditionConfigPanel } from "./components/shared/HardConditionConfigPanel.js";
import { SearchRunListPanel } from "./components/shared/SearchRunListPanel.js";
import { AddCandidateDialog } from "./components/shared/AddCandidateDialog.js";
import { ProfileDetailPanel } from "./components/shared/ProfileDetailPanel.js";
import { createSearchRun, fetchSearchRun, startAutoSimulation, stopAutoSimulation, simulatePluginSubmit, fetchHardConditionConfig, reassessSearchRun, exportSearchRunCsv, retrySearchRun, addManualCandidate, uploadAttachment } from "./lib/api-client.js";
import type { AIAudit, Candidate, CandidateStatus, JobProfile, JobProfileStatus, ProfileForm, Recommendation, SearchRun } from "./lib/types.js";
import { mockCandidates as mockData, baseProfile, mockProfiles, mockAudit } from "./lib/mock-data.js";

type PageId = "profiles" | "profile-editor" | "search-run" | "candidate-summary" | "hard-condition";

export function App(): React.ReactElement {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [page, setPage] = useState<PageId>("profiles");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | undefined>();
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | undefined>();
  const [selectedProfileId, setSelectedProfileId] = useState(baseProfile.id);
  const [profileDetailId, setProfileDetailId] = useState<string | undefined>();
  const [profiles, setProfiles] = useState<JobProfile[]>(mockProfiles);
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | "All">("All");
  const [recFilter, setRecFilter] = useState<Recommendation | "All">("All");
  const [profileStatusFilter, setProfileStatusFilter] = useState<JobProfileStatus | "All">("All");
  const [profileKwFilter, setProfileKwFilter] = useState("");
  const [dialog, setDialog] = useState<"match" | "audit" | "create-search" | "compare" | "add-candidate" | undefined>();
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const [form, setForm] = useState<ProfileForm>(createProfileForm(baseProfile));
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<{ keywords: string; hardRequirements: string; softRequirements: string } | undefined>();
  const [msg, setMsg] = useState("本原型使用本地 mock 数据。");
  const [searchRunMap, setSearchRunMap] = useState<Record<string, SearchRun>>({});
  const [currentSearchRunId, setCurrentSearchRunId] = useState<string | undefined>();
  const [searchRunError, setSearchRunError] = useState<string | undefined>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchRunLoading, setSearchRunLoading] = useState(false);
  const [autoSimulationActive, setAutoSimulationActive] = useState(false);
  const [configData, setConfigData] = useState<import("./lib/types.js").HardConditionConfigDimension[] | undefined>();
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | undefined>();
  const pollingRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const currentSearchRunIdRef = useRef<string | undefined>(undefined);
  currentSearchRunIdRef.current = currentSearchRunId;

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



  const currentSearchRun = useMemo(() => {
    if (!currentSearchRunId) return undefined;
    return searchRunMap[currentSearchRunId];
  }, [currentSearchRunId, searchRunMap]);

  // ── SearchRun 详情页轮询 ───────────────────────────────────────

  useEffect(() => {
    if (page !== "search-run" || !currentSearchRunId) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = undefined;
      }
      return;
    }

    const poll = async () => {
      const id = currentSearchRunIdRef.current;
      if (!id) return;
      const updated = await fetchSearchRun(id);
      if (updated) {
        setSearchRunMap((prev) => ({ ...prev, [updated.id]: updated }));
      }
    };

    pollingRef.current = setInterval(poll, 3000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = undefined;
      }
    };
  }, [page, currentSearchRunId]);

  // ── 硬筛配置加载 ─────────────────────────────────────────────────

  useEffect(() => {
    if (page !== "hard-condition") return;
    setConfigLoading(true);
    setConfigError(undefined);
    fetchHardConditionConfig()
      .then((result) => setConfigData(result.dimensions))
      .catch((err: unknown) => setConfigError(err instanceof Error ? err.message : "加载失败。"))
      .finally(() => setConfigLoading(false));
  }, [page]);

  // ── 页面切换 ───────────────────────────────────────────────────

  const handlePageChange = useCallback(
    (nextPage: PageId) => {
      if (nextPage !== "profiles") setProfileDetailId(undefined);
      setSelectedIds([]);
      setPage(nextPage);
      setPageError(undefined);
      setPageLoading(true);
      setTimeout(() => setPageLoading(false), 300);
    },
    [],
  );

  // ── 登录 ───────────────────────────────────────────────────────

  const handleLogin = useCallback(() => {
    setLoginLoading(true);
    setLoginError(undefined);
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

  // ── 创建 SearchRun ─────────────────────────────────────────────

  const handleCreateSearchRun = useCallback(async (targetResultCount: number) => {
    const profileToUse = profiles.find((p) => p.id === selectedProfileId);
    if (!profileToUse) {
      throw new Error("未找到选择的岗位画像。");
    }

    const response = await createSearchRun({
      jobProfile: profileToUse,
      targetResultCount,
    });

    const loaded = await fetchSearchRun(response.searchRunId);
    if (loaded) {
      setSearchRunMap((prev) => ({ ...prev, [loaded.id]: loaded }));
      setCurrentSearchRunId(loaded.id);
      setSearchRunError(undefined);
      setPage("search-run");
      setMsg(`已创建寻访任务：${response.searchRunId}`);
    }
  }, [profiles, selectedProfileId]);

  // ── 手动模拟提交 ──────────────────────────────────────────────

  const handleSimulatePluginSubmit = useCallback((searchRunId: string, count: number) => {
    const updated = simulatePluginSubmit(searchRunId, count);
    if (updated) {
      setSearchRunMap((prev) => ({ ...prev, [updated.id]: updated }));
      setMsg(`已模拟提交 ${count} 名候选人。`);
      setSearchRunError(undefined);
    }
  }, []);

  // ── 渐进式自动模拟 ────────────────────────────────────────────

  const handleStartAutoSimulation = useCallback(() => {
    if (!currentSearchRunId) return;
    setAutoSimulationActive(true);
    setMsg("自动寻访已启动，候选人将陆续入库。");

    startAutoSimulation(currentSearchRunId, 200, (updated) => {
      setSearchRunMap((prev) => {
        const existing = prev[updated.id];
        if (existing && existing.rawSubmittedCount >= updated.rawSubmittedCount) {
          return prev;
        }
        return { ...prev, [updated.id]: updated };
      });

      if (updated.status === "Completed") {
        setAutoSimulationActive(false);
        setMsg("自动寻访已完成。");
      }
    });
  }, [currentSearchRunId]);

  const handleStopAutoSimulation = useCallback(() => {
    if (!currentSearchRunId) return;
    stopAutoSimulation(currentSearchRunId);
    setAutoSimulationActive(false);
    setMsg("自动寻访已停止。");
  }, [currentSearchRunId]);

  // 离开 search-run 页面时自动停止模拟
  useEffect(() => {
    if (page !== "search-run" && currentSearchRunId) {
      stopAutoSimulation(currentSearchRunId);
      setAutoSimulationActive(false);
    }
  }, [page, currentSearchRunId]);

  // ── 取消 ──────────────────────────────────────────────────────

  const handleCancelSearchRun = useCallback((searchRunId: string) => {
    if (!window.confirm("确认取消？")) return;
    stopAutoSimulation(searchRunId);
    setAutoSimulationActive(false);
    setSearchRunMap((prev) => {
      const existing = prev[searchRunId];
      if (!existing) return prev;
      return {
        ...prev,
        [searchRunId]: {
          ...existing,
          status: "Cancelled" as const,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    setMsg("SearchRun 已取消。");
  }, []);

  // ── 模拟错误 ──────────────────────────────────────────────────

  const handleGenerateSuggestions = useCallback(() => {
    setSuggesting(true);
    setSuggestions(undefined);
    setTimeout(() => {
      const jdText = form.jdText || form.title;
      const words = jdText.split(/[,，;；、\s]+/).filter(Boolean);
      const hasYear = jdText.includes("经验") || /\d+\s*年/.test(jdText);
      setSuggestions({
        keywords: words.slice(0, 5).join(", ") || "解决方案, 客户, 项目管理",
        hardRequirements: hasYear ? "5 年以上相关经验\n本科及以上" : "本科及以上",
        softRequirements: "沟通协调能力\n项目管理能力\n团队协作能力",
      });
      setSuggesting(false);
    }, 1000);
  }, [form.jdText, form.title]);

  const handleSimulateError = useCallback(() => {
    setSearchRunError("模拟采集失败：来源平台返回 403。");
  }, []);

  // ── 导出 CSV ────────────────────────────────────────────────────

  const handleUploadAttachment = useCallback((cid: string, fn: string, ct: string, sz: number) => {
    if (!currentSearchRunId) return;
    uploadAttachment(currentSearchRunId, cid, fn, ct, sz)
      .then((updated) => {
        setSearchRunMap((prev) => ({ ...prev, [updated.id]: updated }));
        setMsg("已上传附件：" + fn);
      })
      .catch((err: Error) => setSearchRunError(err.message || "上传失败。"));
  }, [currentSearchRunId]);

  const handleExport = useCallback(() => {
    if (!currentSearchRunId) return;
    exportSearchRunCsv(currentSearchRunId)
      .then((csv: string) => {
        const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const filename = "search-run-" + currentSearchRunId.slice(0, 8) + ".csv";
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        setMsg("候选人已导出为 CSV。");
      })
      .catch((err: Error) => {
        setSearchRunError(err.message || "导出失败。");
      });
  }, [currentSearchRunId]);

  // ── 批量选择 ──────────────────────────────────────────────────

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!currentSearchRun) return;
    const ids = currentSearchRun.candidates.map((c) => c.id);
    setSelectedIds((prev) => prev.length === ids.length ? [] : ids);
  }, [currentSearchRun]);

  // ── 重试 ────────────────────────────────────────────────────────

  const handleRetrySearchRun = useCallback(() => {
    if (!currentSearchRunId) return;
    retrySearchRun(currentSearchRunId).then((updated) => {
      if (updated) {
        setSearchRunMap((prev) => ({ ...prev, [updated.id]: updated }));
        setSearchRunError(undefined);
        setMsg("SearchRun 已重置，可以重新运行。");
      }
    });
  }, [currentSearchRunId]);

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
  const createDialogProfile = dialog === "create-search"
    ? profiles.find((p) => p.id === selectedProfileId)
    : undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar userEmail="hunter@example.com" onLogout={() => setIsLoggedIn(false)} />
      <div className="flex flex-1">
        <SideNav currentPath={page} onNavigate={handlePageChange} />
        <main className="flex-1 p-5 min-w-0">
          <div className="mb-3 text-xs text-muted-foreground">
            {detailProfile ? detailProfile.title : selectedProfile.title} /{" "}
            {page === "profiles"
              ? profileDetailId ? "画像详情" : "JobProfile 列表"
              : page === "profile-editor"
                ? "创建/编辑画像"
                : page === "search-run"
                  ? "SearchRun 详情"
                  : page === "candidate-summary"
                    ? "候选人汇总"
                    : "硬筛条件配置"}
          </div>
          <div className="mb-3 rounded border px-3 py-2 text-sm bg-background">{msg}</div>

          {pageLoading ? <LoadingSkeleton rows={5} /> : null}

          {!pageLoading && pageError ? (
            <ErrorState message={pageError} onRetry={() => handlePageChange(page)} />
          ) : null}

          {!pageLoading && !pageError && page === "profiles" ? (
            detailProfile ? (
              <ProfileDetailPanel
                profile={detailProfile}
                    searchRuns={Object.values(searchRunMap).filter((r) => r.jobProfileId === profileDetailId)}
                    onBack={() => setProfileDetailId(undefined)}
                    onEdit={(p) => {
                      setSelectedProfileId(p.id);
                      setForm(createProfileForm(p));
                      setFormErrors([]);
                      setShowConfirm(false);
                      setPage("profile-editor");
                    }}
                    onStartSearchRun={(p) => {
                      setSelectedProfileId(p.id);
                      setDialog("create-search");
                    }}
                    onViewSearchRun={(id) => {
                      setCurrentSearchRunId(id);
                      setSearchRunError(undefined);
                      setPage("search-run");
                    }}
                  />
            ) : (
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
                onStartSearchRun={(p) => {
                  setSelectedProfileId(p.id);
                  setDialog("create-search");
                }}
                onOpen={(p) => setProfileDetailId(p.id)}
              />
            )
          ) : null}

          {!pageLoading && !pageError && page === "profile-editor" ? (
            <ProfileEditor
              form={form}
              errors={formErrors}
              showConfirm={showConfirm}
              suggestions={suggestions}
              suggesting={suggesting}
              onFieldChange={(f, v) => {
                setForm({ ...form, [f]: v });
                setFormErrors([]);
              }}
              onShowConfirm={() => {
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
              onGenerateSuggestions={handleGenerateSuggestions}
              onApplySuggestion={(field: string, value: string) =>
                setForm((prev: any) => ({ ...prev, [field]: value }))
              }
            />
          ) : null}

          {!pageLoading && !pageError && page === "search-run" ? (
            currentSearchRun ? (
              <SearchRunDetail
                searchRun={currentSearchRun}
                loading={searchRunLoading}
                candidates={currentSearchRun?.candidates ?? []}
                error={searchRunError}
                audits={[mockAudit]}
                statusFilter={statusFilter}
                recFilter={recFilter}
                autoSimulationActive={autoSimulationActive}
                onStatusFilter={setStatusFilter}
                onRecFilter={setRecFilter}
                onBackToList={() => {
                  setCurrentSearchRunId(undefined);
                  setSearchRunError(undefined);
                }}
                onCancel={() => {
                  if (currentSearchRun) handleCancelSearchRun(currentSearchRun.id);
                }}
                onSimulate={() => {
                  if (currentSearchRun) {
                    const nextCount = Math.min(
                      currentSearchRun.rawSubmittedCount + 3,
                      currentSearchRun.targetResultCount,
                    );
                    handleSimulatePluginSubmit(currentSearchRun.id, nextCount);
                  }
                }}
                onAutoSimulate={() => {
                  if (autoSimulationActive) {
                    handleStopAutoSimulation();
                  } else {
                    handleStartAutoSimulation();
                  }
                }}
                onSimulateError={handleSimulateError}
                onExport={handleExport}
                onRetry={handleRetrySearchRun}
                onReassess={() => {
                  if (!currentSearchRun) return;
                  reassessSearchRun(currentSearchRun.id).then((updated) => {
                      if (updated) {
                        setSearchRunMap((prev) => ({ ...prev, [updated.id]: updated }));
                        setMsg("重评估完成，分数已更新。");
                      }
                    });
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
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll}
                onCompare={() => setDialog("compare")}
                onAddCandidate={() => setDialog("add-candidate")}
                onUpload={handleUploadAttachment}
                onBatchExport={() => {
                  if (selectedIds.length === 0) return;
                  // Filter candidates and export selected
                  const selectedCsv = currentSearchRun?.candidates
                    .filter((c) => selectedIds.includes(c.id))
                    .map((c) => c.name)
                    .join(", ");
                  setMsg("已导出 " + selectedIds.length + " 名候选人。");
                  // Trigger full export mock for now
                  if (currentSearchRun) {
                    handleExport();
                  }
                }}
                onDownload={(c) =>
                  setMsg(c.hasAttachment ? "模拟下载 " + c.name : c.name + " 无附件")
                }
              />
            ) : (
              <SearchRunListPanel
                searchRuns={Object.values(searchRunMap)}
                onSelectRun={(id) => {
                  setCurrentSearchRunId(id);
                  setSearchRunError(undefined);
                }}
                onNavigateToProfiles={() => setPage("profiles")}
              />
            )
          ) : null}

          {!pageLoading && !pageError && page === "candidate-summary" ? (
            <CandidateSummary profile={selectedProfile} candidates={mockData} />
          ) : null}

          {!pageLoading && !pageError && page === "hard-condition" ? (
            <HardConditionConfigPanel
              dimensions={configData}
              loading={configLoading}
              error={configError}
              onRetry={() => {
                setConfigLoading(true);
                setConfigError(undefined);
                fetchHardConditionConfig()
                  .then((result) => setConfigData(result.dimensions))
                  .catch((err: unknown) => setConfigError(err instanceof Error ? err.message : "加载失败。"))
                  .finally(() => setConfigLoading(false));
              }}
            />
          ) : null}

          {createDialogProfile ? (
            <CreateSearchRunDialog
              profile={createDialogProfile}
              open={true}
              onOpenChange={() => setDialog(undefined)}
              onConfirm={handleCreateSearchRun}
            />
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

          <Dialog
            open={dialog === "compare"}
            onOpenChange={() => setDialog(undefined)}
          >
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>候选人比较</DialogTitle>
              </DialogHeader>
              {renderCompareGrid(currentSearchRun, selectedIds)}
            </DialogContent>
          </Dialog>

          <AddCandidateDialog
            open={dialog === "add-candidate"}
            onOpenChange={() => setDialog(undefined)}
            onConfirm={async (form) => {
              if (!currentSearchRun) return;
              await addManualCandidate(currentSearchRun.id, form);
              const updated = await fetchSearchRun(currentSearchRun.id);
              if (updated) {
                setSearchRunMap((prev) => ({ ...prev, [updated.id]: updated }));
                setMsg("已添加候选人 " + form.name);
              }
            }}
          />
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
  onStartSearchRun: (p: JobProfile) => void;
  onOpen: (p: JobProfile) => void;
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
            <Card key={p.id} className="cursor-pointer hover:bg-accent/50" onClick={() => props.onOpen(p)}>
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
                  {p.status === "Confirmed" ? (
                    <Button
                      size="sm"
                      onClick={() => props.onStartSearchRun(p)}
                    >
                      启动寻访
                    </Button>
                  ) : null}
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
  suggestions: { keywords: string; hardRequirements: string; softRequirements: string } | undefined;
  suggesting: boolean;
  onFieldChange: (f: keyof ProfileForm, v: string | number) => void;
  onShowConfirm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onGenerateSuggestions: () => void;
  onApplySuggestion: (field: string, value: string) => void;
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
          {props.suggesting ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              正在分析 JD 文本…
            </div>
          ) : null}
          {!props.suggesting && !props.suggestions ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                填写岗位名称和 JD 原文后，点击下方按钮生成 AI 建议。
              </p>
              <Button
                size="sm"
                className="w-full"
                onClick={props.onGenerateSuggestions}
                disabled={!props.form.jdText.trim() && !props.form.title.trim()}
              >
                生成 AI 建议
              </Button>
            </div>
          ) : null}
          {!props.suggesting && props.suggestions ? (
            <div className="space-y-3 mt-2">
              <p className="text-xs text-green-600 font-medium">AI 建议已生成</p>
              <div className="space-y-2 text-xs border rounded p-2 bg-muted/20">
                <p className="font-medium text-muted-foreground">建议关键词</p>
                <p className="font-mono">{props.suggestions.keywords}</p>
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => props.onApplySuggestion("keywords", props.suggestions.keywords)}>
                  应用关键词
                </Button>
              </div>
              <div className="space-y-2 text-xs border rounded p-2 bg-muted/20">
                <p className="font-medium text-muted-foreground">建议硬性条件</p>
                <pre className="font-mono text-xs whitespace-pre-wrap">{props.suggestions.hardRequirements}</pre>
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => props.onApplySuggestion("hardRequirements", props.suggestions.hardRequirements)}>
                  应用硬性条件
                </Button>
              </div>
              <div className="space-y-2 text-xs border rounded p-2 bg-muted/20">
                <p className="font-medium text-muted-foreground">建议软性条件</p>
                <pre className="font-mono text-xs whitespace-pre-wrap">{props.suggestions.softRequirements}</pre>
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => props.onApplySuggestion("softRequirements", props.suggestions.softRequirements)}>
                  应用软性条件
                </Button>
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={props.onGenerateSuggestions}>
                重新生成
              </Button>
            </div>
          ) : null}
          {props.showConfirm ? (
            <div className="mt-4 pt-4 border-t space-y-2">
              <h3 className="font-semibold">确认摘要</h3>
              <KeyValue label="岗位" value={String(props.form.title || "未填写")} />
              <KeyValue label="关键词" value={String(props.form.keywords || "未填写")} />
              <KeyValue label="硬性条件" value={String(props.form.hardRequirements || "未填写")} />
              <KeyValue label="软性条件" value={String(props.form.softRequirements || "未填写")} />
              <Button onClick={props.onConfirm}>确认生成版本</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── SearchRunDetail ────────────────────────────────────────────────

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Created: "secondary",
  Running: "default",
  Acquired: "default",
  Deduplicated: "default",
  HardFiltered: "default",
  Assessed: "default",
  Completed: "default",
  Failed: "destructive",
  Cancelled: "destructive",
};

function SearchRunDetail(props: {
  searchRun: SearchRun | undefined;
  loading: boolean;
  candidates: Candidate[];
  error: string | undefined;
  audits: AIAudit[];
  statusFilter: CandidateStatus | "All";
  recFilter: Recommendation | "All";
  autoSimulationActive: boolean;
  onBackToList: () => void;
  onBackToList: () => void;
  onStatusFilter: (v: CandidateStatus | "All") => void;
  onRecFilter: (v: Recommendation | "All") => void;
  onCancel: () => void;
  onSimulate: () => void;
  onAutoSimulate: () => void;
  onSimulateError: () => void;
  onOpenMatch: (id: string) => void;
  onOpenAudit: () => void;
  onDownload: (c: Candidate) => void;
}): React.ReactElement {
  if (props.loading) {
    return <LoadingSkeleton rows={6} />;
  }

      if (!props.searchRun) {
    return null;
  }

  const pct = props.searchRun.targetResultCount > 0
    ? Math.round((props.searchRun.rawSubmittedCount / props.searchRun.targetResultCount) * 100)
    : 0;
  const isTerminal =
    props.searchRun.status === "Completed" ||
    props.searchRun.status === "Cancelled" ||
    props.searchRun.status === "Failed";
  const hasCandidates = props.candidates.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
            <button
              onClick={props.onBackToList}
              className="text-xs text-blue-600 underline hover:text-blue-800 cursor-pointer shrink-0 mt-1"
            >
              ← 返回列表
            </button>
            <div>
              <p className="text-xs text-muted-foreground font-mono select-all">{props.searchRun.id}</p>
              <h2 className="text-lg font-semibold">SearchRun 详情</h2>
            </div>
          </div>
        <div className="flex gap-2">
          <Button
            variant={props.autoSimulationActive ? "default" : "outline"}
            size="sm"
            onClick={props.onAutoSimulate}
            disabled={isTerminal}
          >
            {props.autoSimulationActive ? "停止自动寻访" : "启动自动寻访"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={props.onSimulate}
            disabled={isTerminal || props.autoSimulationActive}
          >
            手动提交 +3
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={props.onAddCandidate}
            disabled={isTerminal}
          >
            手动添加
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={props.onSimulateError}
            disabled={isTerminal}
          >
            模拟错误
          </Button>
          {props.searchRun?.status === "Failed" || props.searchRun?.status === "Cancelled" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={props.onRetry}
            >
              重试
            </Button>
          ) : null}
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

      {/* 状态与进度 */}
      <div className="flex gap-3 text-sm items-center">
        <Badge variant={STATUS_BADGE_VARIANT[props.searchRun.status] ?? "outline"}>
          {props.searchRun.status}
        </Badge>
        <span className="font-mono text-xs">
          {props.searchRun.rawSubmittedCount}/{props.searchRun.targetResultCount}
        </span>
        <span className="text-xs text-muted-foreground">{pct}%</span>
        <span className="text-xs text-muted-foreground">{formatTime(props.searchRun.createdAt)}</span>
        {props.autoSimulationActive ? (
          <span className="text-xs text-blue-600 animate-pulse">采集中…</span>
        ) : null}
      </div>

      {/* 进度条 — 当有候选人时显示 */}
      {hasCandidates || props.autoSimulationActive ? (
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      {/* 插件指引 */}
      <div className="rounded border bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-1">
        <p>将 SearchRun ID 复制到浏览器插件项目：</p>
        <p className="font-mono text-foreground select-all bg-background px-2 py-1 rounded border break-all">
          {props.searchRun.id}
        </p>
        <p>插件项目负责登录、采集和候选人提交。达到目标数后自动完成寻访。</p>
      </div>

      {/* 事件时间线 */}
      {props.searchRun.events.length > 0 ? (
        <div className="border rounded p-3 space-y-1.5 text-xs">
          <h3 className="font-semibold text-muted-foreground mb-1">处理时间线</h3>
          {props.searchRun.events.map((evt, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex flex-col items-center">
                <div className={"w-2 h-2 rounded-full mt-1.5 " + (
                  evt.type === "SearchCompleted" ? "bg-green-500" :
                  evt.type === "SearchFailed" ? "bg-red-500" :
                  evt.type === "SearchInterrupted" ? "bg-yellow-500" :
                  "bg-primary"
                )} />
                {i < props.searchRun.events.length - 1 ? <div className="w-px h-3 bg-border" /> : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between">
                  <span className="font-medium">{formatEventLabel(evt.type)}</span>
                  <span className="text-muted-foreground shrink-0 ml-2">{formatTime3(evt.occurredAt)}</span>
                </div>
                {evt.reason ? <p className="text-muted-foreground">{evt.reason}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {props.searchRun.failureReason ? (
        <p className="text-xs text-destructive">失败原因：{props.searchRun.failureReason}</p>
      ) : null}

      <Separator />

      {props.error ? (
        <ErrorState message={props.error} />
      ) : null}

      {!props.error ? (
        <>
          {hasCandidates ? (
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
          ) : null}

          {props.selectedIds.length > 0 ? (
            <div className="flex items-center gap-3 px-3 py-2 border rounded bg-muted/20 text-xs">
              <span>已选 <span className="font-mono font-medium">{props.selectedIds.length}</span> 人</span>
              <button onClick={props.onSelectAll} className="text-muted-foreground underline hover:text-foreground cursor-pointer">取消选择</button>
              <span className="text-muted-foreground">·</span>
              <button onClick={props.onBatchExport} className="text-blue-600 underline hover:text-blue-800 cursor-pointer">导出选中 ({props.selectedIds.length})</button>
            </div>
          ) : null}

          <CandidateTable
            candidates={props.candidates}
            selectedIds={props.selectedIds}
            onToggleSelect={props.onToggleSelect}
            onSelectAll={props.onSelectAll}
            onOpenMatch={props.onOpenMatch}
            onDownload={props.onDownload}
            onUpload={props.onUpload}
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

// ─── CandidateTable ─────────────────────────────────────────────────

function CandidateTable(props: {
  candidates: Candidate[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onOpenMatch: (id: string) => void;
  onDownload: (c: Candidate) => void;
  onUpload?: (candidateId: string, filename: string, contentType: string, sizeBytes: number) => void;
}): React.ReactElement {
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const allSelected = props.candidates.length > 0 && props.selectedIds.length === props.candidates.length;

  if (props.candidates.length === 0) {
    return (
      <EmptyState text="暂无候选人。启动「自动寻访」模拟插件提交，或点击「手动提交 +3」逐批提交。" />
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground border-b">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={allSelected} onChange={props.onSelectAll} className="rounded" />
          全选
        </label>
        {props.selectedIds.length > 0 ? (
          <span>已选 {props.selectedIds.length} 人</span>
        ) : null}
      </div>
      <input type="file" ref={fileRef} className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file && uploadTarget && props.onUpload) {
          props.onUpload(uploadTarget, file.name, file.type, file.size);
        }
        setUploadTarget(null);
        if (e.target) e.target.value = "";
      }} />
      {props.candidates.map((c) => {
        const checked = props.selectedIds.includes(c.id);
        return (
        <Card key={c.id}>
          <CardContent className="py-3 flex items-center gap-3 text-sm">
            <input type="checkbox" checked={checked} onChange={() => props.onToggleSelect(c.id)} className="shrink-0 rounded" />
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
            {c.resumeAttachment ? (
              <Button variant="outline" size="sm" onClick={() => props.onDownload(c)}>
                下载
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => { setUploadTarget(c.id); fileRef.current?.click(); }}>
                上传
              </Button>
            )}
          </CardContent>
        </Card>
      );})}
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

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

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

function renderCompareGrid(run: SearchRun | undefined, ids: string[]): React.ReactElement | null {
  if (!run || ids.length < 2) {
    return <p className="text-xs text-muted-foreground">请选择至少 2 名候选人进行比较。</p>;
  }

  const candidates = run.candidates.filter((c) => ids.includes(c.id)).slice(0, 6);
  if (candidates.length < 2) {
    return <p className="text-xs text-muted-foreground">请选择至少 2 名候选人进行比较。</p>;
  }

  return (
    <div className={"grid gap-4 " + (candidates.length <= 2 ? "grid-cols-2" : "grid-cols-3")}>
      {candidates.map((c) => {
        const a = c.matchAssessment;
        return (
          <div key={c.id} className="space-y-2 text-xs border rounded p-3">
            <div className="font-semibold text-sm">{c.name}</div>
            <p className="text-muted-foreground">{c.title} / {c.city}</p>
            <div className="pt-2 border-t space-y-1">
              {a ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">匹配分</span>
                    <span className="font-mono font-medium">{a.score}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">推荐结论</span>
                    <span className="font-medium">{a.recommendation}</span>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground mb-1">合适点</p>
                    {a.matchedPoints.length > 0
                      ? a.matchedPoints.map((p, i) => <p key={i} className="text-green-700">+ {p}</p>)
                      : <p className="text-muted-foreground">无</p>}
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground mb-1">不合适点</p>
                    {a.unmatchedPoints.length > 0
                      ? a.unmatchedPoints.map((p, i) => <p key={i} className="text-red-600">- {p}</p>)
                      : <p className="text-muted-foreground">无</p>}
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground mb-1">风险点</p>
                    {a.riskPoints.length > 0
                      ? a.riskPoints.map((p, i) => <p key={i} className="text-amber-600">! {p}</p>)
                      : <p className="text-muted-foreground">无</p>}
                  </div>
                  <div className="pt-2 border-t">
                    <span className="text-muted-foreground">来源：</span>
                    <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">{c.sourcePlatform}</a>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">暂无匹配评估结果。</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatEventLabel(type: string): string {
  const labels: Record<string, string> = {
    "SearchStarted": "寻访启动",
    "CandidateResultsAcquired": "候选人采集完成",
    "CandidateResultsDeduplicated": "候选人去重完成",
    "HardFilterCompleted": "硬性过滤完成",
    "SoftMatchAssessed": "软性匹配评估完成",
    "SearchCompleted": "寻访完成",
    "SearchFailed": "寻访失败",
    "SearchInterrupted": "寻访中断",
  };
  return labels[type] || type;
}

function formatTime3(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
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
  };
}
