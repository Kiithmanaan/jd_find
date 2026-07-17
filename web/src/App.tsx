import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { realApi, type ApiCandidate } from "./lib/api-client.js";
import { HardConditionConfigPanel } from "./components/shared/HardConditionConfigPanel.js";
import { CreateSearchRunDialog } from "./components/shared/CreateSearchRunDialog.js";
import { SearchRunListPanel, type SearchRunListItem } from "./components/shared/SearchRunListPanel.js";
import { ProfileDetailPanel } from "./components/shared/ProfileDetailPanel.js";
import type { JobProfile } from "./lib/api-types.js";

const columns: ColumnDef<ApiCandidate>[] = [
  { header: "姓名", accessorFn: (row) => row.resume.name },
  { header: "职位", accessorFn: (row) => row.resume.title },
  { header: "城市", accessorFn: (row) => row.resume.city },
  { header: "状态", accessorKey: "status" },
  { header: "匹配分", accessorFn: (row) => row.matchAssessment?.score ?? "-" },
  { header: "结论", accessorFn: (row) => row.matchAssessment?.recommendation ?? "-" },
  { header: "来源", cell: ({ row }) => row.original.sourceLead.url ? <a className="text-blue-600 underline" href={row.original.sourceLead.url} target="_blank" rel="noreferrer">{row.original.sourceLead.platform}</a> : row.original.sourceLead.platform },
];

export function App(): React.JSX.Element {
  const client = useQueryClient();
  const [authenticated, setAuthenticated] = useState(realApi.hasToken());
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [profileId, setProfileId] = useState(""); const [runId, setRunId] = useState("");
  const [showHardConditionConfig, setShowHardConditionConfig] = useState(false);
  const [showSearchRunList, setShowSearchRunList] = useState(false);
  const [showProfileDetail, setShowProfileDetail] = useState(false);
  const [createRunDialogOpen, setCreateRunDialogOpen] = useState(false);
  const [draftSignalsText, setDraftSignalsText] = useState("");
  const hardConditionConfig = useQuery({
    queryKey: ["hard-condition-config"],
    queryFn: () => realApi.hardConditionConfig(),
    enabled: authenticated && showHardConditionConfig,
  });
  const login = useMutation({ mutationFn: () => realApi.login(email, password), onSuccess: () => setAuthenticated(true) });
  const versions = useQuery({ queryKey: ["versions", profileId], queryFn: () => realApi.versions(profileId), enabled: authenticated && Boolean(profileId) });
  const run = useQuery({ queryKey: ["run", runId], queryFn: () => realApi.run(runId), enabled: authenticated && Boolean(runId), refetchInterval: (q) => ["Completed", "Failed", "Cancelled", "Interrupted"].includes(q.state.data?.status ?? "") ? false : 3000 });
  const candidates = useQuery({ queryKey: ["candidates", profileId], queryFn: () => realApi.candidates(profileId), enabled: authenticated && Boolean(profileId) });
  const audits = useQuery({ queryKey: ["audits", runId], queryFn: () => realApi.audits(runId), enabled: authenticated && Boolean(runId) });
  const confirmedVersion = versions.data?.versions.find((item) => item.id === versions.data?.currentVersionId && item.status === "Confirmed");
  /** 目前没有单独的 GET JobProfile 端点，画像内容借当前确认版本合成展示用；与 createRun 请求体的合成方式保持一致。 */
  const syntheticProfile: JobProfile | undefined = confirmedVersion && {
    id: profileId, title: confirmedVersion.title, jdText: confirmedVersion.jdText, status: "Confirmed",
    currentVersionId: confirmedVersion.id, searchCondition: confirmedVersion.searchCondition,
    hardRequirements: confirmedVersion.hardRequirements, softRequirements: confirmedVersion.softRequirements,
    negativeSignals: confirmedVersion.negativeSignals,
  };
  const createRun = useMutation({ mutationFn: async (targetResultCount: number) => {
    if (!confirmedVersion) throw new Error("未找到当前已确认画像版本。");
    return realApi.createRun(confirmedVersion, targetResultCount);
  }, onSuccess: (result) => setRunId(result.searchRunId) });
  const cancel = useMutation({ mutationFn: () => realApi.cancel(runId), onSuccess: () => client.invalidateQueries({ queryKey: ["run", runId] }) });
  const reassess = useMutation({ mutationFn: () => realApi.reassess(profileId), onSuccess: () => client.invalidateQueries({ queryKey: ["candidates", profileId] }) });
  const createDraft = useMutation({ mutationFn: async () => {
    const source = versions.data?.versions.find((item) => item.id === versions.data.currentVersionId);
    if (!source) throw new Error("未找到可复制的当前版本。");
    const editedSignals = draftSignalsText.trim()
      ? draftSignalsText.split("\n").map((line) => line.trim()).filter(Boolean)
      : undefined;
    return realApi.createDraft(profileId, source, editedSignals);
  }, onSuccess: () => client.invalidateQueries({ queryKey: ["versions", profileId] }) });
  const confirmVersion = useMutation({ mutationFn: (versionId: string) => realApi.confirmVersion(profileId, versionId), onSuccess: () => client.invalidateQueries({ queryKey: ["versions", profileId] }) });
  const rows = candidates.data?.currentVersionCandidates ?? run.data?.candidates ?? [];
  const searchRunListItems: SearchRunListItem[] = run.data
    ? [{ ...run.data, jobProfileTitle: confirmedVersion?.title ?? run.data.jobProfileId }]
    : [];
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  const error = login.error ?? versions.error ?? run.error ?? candidates.error ?? createRun.error ?? cancel.error ?? reassess.error ?? createDraft.error ?? confirmVersion.error;

  if (!authenticated) return <main className="mx-auto max-w-md p-8"><h1 className="mb-6 text-2xl font-semibold">JD Search 登录</h1><input className="mb-3 w-full rounded border p-2" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} /><input className="mb-3 w-full rounded border p-2" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} /><button className="rounded bg-black px-4 py-2 text-white" onClick={() => login.mutate()} disabled={login.isPending}>登录</button>{login.error && <p className="mt-3 text-red-600">{login.error.message}</p>}</main>;

  return <main className="mx-auto max-w-6xl p-6"><header className="mb-6 flex items-center justify-between"><h1 className="text-2xl font-semibold">JD Search 工作台</h1><button onClick={() => { realApi.logout(); setAuthenticated(false); }}>退出</button></header>
    <section className="mb-5 grid gap-3 rounded border p-4 md:grid-cols-4"><input className="rounded border p-2 md:col-span-2" placeholder="JobProfile ID" value={profileId} onChange={(e) => setProfileId(e.target.value)} /><button className="rounded bg-black px-3 py-2 text-white" disabled={!confirmedVersion} onClick={() => setCreateRunDialogOpen(true)}>启动插件寻访</button><input className="rounded border p-2 md:col-span-2" placeholder="SearchRun ID" value={runId} onChange={(e) => setRunId(e.target.value)} /><button className="rounded border px-3 py-2" disabled={!runId} onClick={() => cancel.mutate()}>取消任务</button><button className="rounded border px-3 py-2" disabled={!profileId} onClick={() => reassess.mutate()}>按当前版本重评估</button></section>
    {confirmedVersion && <CreateSearchRunDialog
      profile={confirmedVersion}
      open={createRunDialogOpen}
      onOpenChange={setCreateRunDialogOpen}
      onConfirm={async (targetResultCount) => { await createRun.mutateAsync(targetResultCount); }}
    />}
    {error && <p className="mb-4 rounded bg-red-50 p-3 text-red-700">{error.message}</p>}
    <section className="mb-5 grid gap-3 md:grid-cols-3"><div className="rounded border p-4"><div className="flex justify-between"><span className="text-sm text-gray-500">画像版本</span><button className="text-sm underline" disabled={!versions.data} onClick={() => createDraft.mutate()}>复制当前为草稿</button></div><div className="mt-2 space-y-1">{versions.data?.versions.map((version) => <div className="flex justify-between" key={version.id}><span>v{version.version} · {version.status}</span>{version.status === "Draft" && <button className="text-sm text-blue-600" onClick={() => confirmVersion.mutate(version.id)}>确认</button>}</div>) ?? <span className="text-xl">0</span>}</div><label className="mt-3 block text-xs text-gray-500">排除信号（每行一条，留空则沿用当前版本，随「复制当前为草稿」保存）<textarea className="mt-1 w-full rounded border p-2 text-sm" rows={3} placeholder={confirmedVersion?.negativeSignals.join("\n") || "例如：频繁跳槽"} value={draftSignalsText} onChange={(e) => setDraftSignalsText(e.target.value)} /></label></div><div className="rounded border p-4"><div className="text-sm text-gray-500">任务状态</div><div className="text-xl">{run.data?.status ?? "-"}</div></div><div className="rounded border p-4"><div className="text-sm text-gray-500">AI 审计</div><div className="text-xl">{audits.data?.records.length ?? 0}</div></div></section>
    <div className="overflow-auto rounded border"><table className="w-full text-left text-sm"><thead className="bg-gray-50">{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th className="p-3" key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr className="border-t" key={row.id}>{row.getVisibleCells().map((cell) => <td className="p-3" key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table>{rows.length === 0 && <p className="p-6 text-center text-gray-500">暂无候选人</p>}</div>
    <section className="mt-5">
      <button className="text-sm underline" onClick={() => setShowHardConditionConfig((v) => !v)}>
        {showHardConditionConfig ? "隐藏硬筛条件配置" : "查看硬筛条件配置"}
      </button>
      {showHardConditionConfig && <div className="mt-3 rounded border p-4">
        <HardConditionConfigPanel
          dimensions={hardConditionConfig.data?.dimensions}
          loading={hardConditionConfig.isLoading}
          error={hardConditionConfig.error?.message}
          onRetry={() => hardConditionConfig.refetch()}
        />
      </div>}
    </section>
    <section className="mt-5">
      <button className="text-sm underline" onClick={() => setShowSearchRunList((v) => !v)}>
        {showSearchRunList ? "隐藏寻访任务列表" : "查看寻访任务列表"}
      </button>
      {showSearchRunList && <div className="mt-3 rounded border p-4">
        <SearchRunListPanel
          searchRuns={searchRunListItems}
          onSelectRun={setRunId}
          onNavigateToProfiles={() => setRunId("")}
        />
      </div>}
    </section>
    <section className="mt-5">
      <button className="text-sm underline" disabled={!syntheticProfile} onClick={() => setShowProfileDetail((v) => !v)}>
        {showProfileDetail ? "隐藏画像详情" : "查看画像详情"}
      </button>
      {showProfileDetail && syntheticProfile && <div className="mt-3 rounded border p-4">
        <ProfileDetailPanel
          profile={syntheticProfile}
          versions={versions.data?.versions ?? []}
          searchRuns={run.data ? [run.data] : []}
          onBack={() => setShowProfileDetail(false)}
          onEdit={() => {}}
          onStartSearchRun={() => setCreateRunDialogOpen(true)}
          onViewSearchRun={setRunId}
        />
      </div>}
    </section>
  </main>;
}
