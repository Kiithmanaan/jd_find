import React from "react";
import { Card, CardContent } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { EmptyState } from "./EmptyState.js";
import { FunnelRow } from "./FunnelRow.js";
import type { JobProfileReportResponse } from "../../lib/api-types.js";

export interface JobProfileReportPanelProps {
  report?: JobProfileReportResponse;
  loading?: boolean;
  error?: string;
}

export function JobProfileReportPanel(props: JobProfileReportPanelProps): React.ReactElement {
  if (props.loading) return <p className="text-xs text-muted-foreground">报告加载中…</p>;
  if (props.error) return <p className="text-xs text-red-600">{props.error}</p>;
  if (!props.report) return <EmptyState text="输入 JobProfile ID 后查看画像汇总报告。" />;

  const report = props.report;
  const distribution = report.currentRecommendationDistribution;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">画像汇总报告</h3>
        <span className="text-[10px] text-muted-foreground">
          寻访任务 {report.totalSearchRuns} 次 · 去重后候选人 {report.uniqueCandidateCount} 人 · 当前版本 {report.currentVersionId}
        </span>
      </div>

      <div>
        <p className="mb-1 text-xs text-muted-foreground">累计漏斗（各轮寻访当轮快照相加，不跨轮去重）</p>
        <FunnelRow funnel={report.cumulativeFunnel} />
      </div>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <h4 className="text-sm font-semibold">当前推荐结论分布（去重后按最新评估）</h4>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "推荐", value: distribution.recommended },
              { label: "待定", value: distribution.pending },
              { label: "不推荐", value: distribution.notRecommended },
              { label: "未按当前版本评估", value: distribution.unassessed },
            ].map((item) => (
              <div key={item.label} className="rounded border p-2">
                <div className="text-[10px] text-muted-foreground">{item.label}</div>
                <div className="text-lg font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <h4 className="text-sm font-semibold">按寻访任务拆分</h4>
          {report.runs.length === 0 ? (
            <EmptyState text="该画像下暂无寻访任务。" />
          ) : (
            <div className="space-y-1">
              {report.runs.map((run) => (
                <div key={run.searchRunId} className="flex items-center justify-between border rounded px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline">{run.status}</Badge>
                    <span className="text-muted-foreground">
                      提交 {run.funnel.rawSubmitted} · 通过 {run.funnel.hardPassed} · 推荐 {run.funnel.recommended}
                    </span>
                  </div>
                  <span className="text-muted-foreground font-mono text-[10px] truncate ml-2">{run.searchRunId}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
