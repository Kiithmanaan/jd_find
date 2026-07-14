import React, { useState } from "react";
import { Button } from "../ui/button.js";
import { Card, CardContent } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.js";
import { EmptyState } from "./EmptyState.js";
import type { SearchRun, SearchRunStatus } from "../../lib/api-types.js";

/** 真实的列出 SearchRun 端点尚未实现，jobProfileTitle 需由调用方联表补上再传入。 */
export interface SearchRunListItem extends SearchRun {
  jobProfileTitle: string;
}

export interface SearchRunListPanelProps {
  searchRuns: SearchRunListItem[];
  onSelectRun: (id: string) => void;
  onNavigateToProfiles: () => void;
}

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Completed: "default",
  Running: "default",
  Failed: "destructive",
  Cancelled: "destructive",
  Interrupted: "destructive",
  Created: "secondary",
  Acquired: "default",
  Deduplicated: "default",
  HardFiltered: "default",
  Assessed: "default",
};

interface StatusCount {
  label: string;
  key: SearchRunStatus | "total";
  count: number;
}

export function SearchRunListPanel(props: SearchRunListPanelProps): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<SearchRunStatus | "All">("All");

  const sortedRuns = [...props.searchRuns]
    .filter((run) => statusFilter === "All" || run.status === statusFilter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 状态统计
  const total = props.searchRuns.length;
  const runningCount = props.searchRuns.filter((r) => r.status === "Running" || r.status === "Acquired" || r.status === "Deduplicated" || r.status === "HardFiltered" || r.status === "Assessed" || r.status === "Created").length;
  const completedCount = props.searchRuns.filter((r) => r.status === "Completed").length;
  const failedCount = props.searchRuns.filter((r) => r.status === "Failed").length;
  const cancelledCount = props.searchRuns.filter((r) => r.status === "Cancelled").length;
  const interruptedCount = props.searchRuns.filter((r) => r.status === "Interrupted").length;

  if (total === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">寻访任务列表</h2>
        <EmptyState text="暂无寻访任务。请先在 JobProfile 列表中选择一个已确认的画像，点击「启动寻访」创建。" />
        <div className="flex justify-center">
          <Button onClick={props.onNavigateToProfiles}>前往 JobProfile 列表</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">寻访任务列表</h2>
        <span className="text-xs text-muted-foreground">共 {total} 个任务</span>
      </div>

      {/* 状态汇总 */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded border px-2 py-1">
          总计 <span className="font-mono font-medium">{total}</span>
        </span>
        {runningCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">
            进行中 <span className="font-mono font-medium">{runningCount}</span>
          </span>
        ) : null}
        {completedCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2 py-1 text-green-700">
            已完成 <span className="font-mono font-medium">{completedCount}</span>
          </span>
        ) : null}
        {failedCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700">
            失败 <span className="font-mono font-medium">{failedCount}</span>
          </span>
        ) : null}
        {cancelledCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-600">
            已取消 <span className="font-mono font-medium">{cancelledCount}</span>
          </span>
        ) : null}
        {interruptedCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700">
            已中止 <span className="font-mono font-medium">{interruptedCount}</span>
          </span>
        ) : null}
      </div>

      {/* 状态筛选 */}
      <Select
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as SearchRunStatus | "All")}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="按状态筛选" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="All">全部状态</SelectItem>
          <SelectItem value="Running">进行中</SelectItem>
          <SelectItem value="Completed">已完成</SelectItem>
          <SelectItem value="Interrupted">已中止</SelectItem>
          <SelectItem value="Failed">失败</SelectItem>
          <SelectItem value="Cancelled">已取消</SelectItem>
        </SelectContent>
      </Select>

      {/* 任务列表 */}
      <div className="space-y-2">
        {sortedRuns.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">当前筛选条件下没有匹配的任务。</p>
        ) : null}
        {sortedRuns.map((run) => {
          const pct = run.targetResultCount > 0
            ? Math.round((run.rawSubmittedCount / run.targetResultCount) * 100)
            : 0;
          const displayableCount = run.candidates.filter((c) => c.status === "Displayable").length;
          const rejectedCount = run.candidates.filter((c) => c.status === "HardRejected").length;
          const hasCandidates = run.candidates.length > 0;

          return (
            <Card
              key={run.id}
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => props.onSelectRun(run.id)}
            >
              <CardContent className="py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{run.jobProfileTitle}</span>
                    <Badge variant={STATUS_BADGE[run.status] ?? "outline"}>
                      {run.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDate(run.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">{run.rawSubmittedCount}/{run.targetResultCount}</span>
                  <span>{pct}%</span>
                  <span className="font-mono text-[10px] truncate">{run.id}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {hasCandidates ? (
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-700">
                      通过 <span className="font-mono font-medium">{displayableCount}</span>
                    </span>
                    <span className="text-red-600">
                      淘汰 <span className="font-mono font-medium">{rejectedCount}</span>
                    </span>
                    <span className="text-muted-foreground">
                      共 <span className="font-mono">{run.candidates.length}</span> 人
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">待采集</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
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
