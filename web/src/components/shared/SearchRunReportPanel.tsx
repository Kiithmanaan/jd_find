import React from "react";
import { Card, CardContent } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { EmptyState } from "./EmptyState.js";
import { FunnelRow } from "./FunnelRow.js";
import type { SearchRunReportResponse } from "../../lib/api-types.js";

export interface SearchRunReportPanelProps {
  report?: SearchRunReportResponse;
  loading?: boolean;
  error?: string;
}

export function SearchRunReportPanel(props: SearchRunReportPanelProps): React.ReactElement {
  if (props.loading) return <p className="text-xs text-muted-foreground">报告加载中…</p>;
  if (props.error) return <p className="text-xs text-red-600">{props.error}</p>;
  if (!props.report) return <EmptyState text="输入 SearchRun ID 后查看该轮寻访报告。" />;

  const report = props.report;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">寻访报告（当轮快照）</h3>
        <Badge variant="outline">{report.status}</Badge>
        <span className="text-[10px] text-muted-foreground font-mono">{report.searchRunId}</span>
      </div>

      <FunnelRow funnel={report.funnel} />

      <Card>
        <CardContent className="pt-4 space-y-2">
          <h4 className="text-sm font-semibold">Top 候选人（推荐前 5，不足补高分待定）</h4>
          {report.topCandidates.length === 0 ? (
            <EmptyState text="暂无已评估候选人。" />
          ) : (
            <div className="space-y-1">
              {report.topCandidates.map((candidate) => (
                <div key={candidate.id} className="flex items-center justify-between border rounded px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium">{candidate.resume.name}</span>
                    <span className="text-muted-foreground">{candidate.resume.title}</span>
                    <Badge variant={candidate.matchAssessment?.recommendation === "推荐" ? "default" : "secondary"}>
                      {candidate.matchAssessment?.recommendation}
                    </Badge>
                  </div>
                  <span className="font-mono">{candidate.matchAssessment?.score}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <h4 className="text-sm font-semibold">待定清单（{report.pendingCandidates.length}）</h4>
          {report.pendingCandidates.length === 0 ? (
            <EmptyState text="没有推荐结论为待定的候选人。" />
          ) : (
            <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
              {report.pendingCandidates.map((candidate) => (
                <li key={candidate.id}>
                  {candidate.resume.name}（{candidate.matchAssessment?.score} 分）
                  {candidate.matchAssessment?.riskPoints.length
                    ? ` — 风险点：${candidate.matchAssessment.riskPoints.join("；")}`
                    : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
