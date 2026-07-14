import React from "react";
import { Button } from "../ui/button.js";
import { Card, CardContent } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { KeyValue } from "./KeyValue.js";
import { EmptyState } from "./EmptyState.js";
import type { JobProfile, JobProfileVersion, SearchRun } from "../../lib/api-types.js";

export interface ProfileDetailPanelProps {
  profile: JobProfile;
  versions: JobProfileVersion[];
  searchRuns: SearchRun[];
  onBack: () => void;
  onEdit: (profile: JobProfile) => void;
  onStartSearchRun: (profile: JobProfile) => void;
  onViewSearchRun: (id: string) => void;
}

export function ProfileDetailPanel(props: ProfileDetailPanelProps): React.ReactElement {
  const p = props.profile;
  const currentVersion = props.versions.find((v) => v.id === p.currentVersionId);
  const runs = [...props.searchRuns].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="space-y-4">
      {/* 顶栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={props.onBack}
            className="text-xs text-blue-600 underline hover:text-blue-800 cursor-pointer shrink-0"
          >
            ← 返回列表
          </button>
          <h2 className="text-lg font-semibold">画像详情</h2>
        </div>
        <div className="flex gap-2">
          {p.status === "Confirmed" ? (
            <Button size="sm" onClick={() => props.onStartSearchRun(p)}>
              启动寻访
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => props.onEdit(p)}>
            编辑
          </Button>
        </div>
      </div>

      {/* 基本信息 */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{p.title}</h3>
            {currentVersion ? <Badge variant={p.status === "Confirmed" ? "default" : "secondary"}>v{currentVersion.version}</Badge> : null}
            <Badge variant="outline">{p.status}</Badge>
          </div>
          {p.confirmedAt ? <p className="text-xs text-muted-foreground">确认于 {formatDate2(p.confirmedAt)}</p> : null}
          {p.jdText ? (
            <div className="text-xs border rounded p-2 bg-muted/20 whitespace-pre-wrap">{p.jdText}</div>
          ) : null}
        </CardContent>
      </Card>

      {/* 搜索条件 */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <h3 className="text-sm font-semibold">搜索条件</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <KeyValue label="关键词" value={p.searchCondition.keywords.join("、") || "不限"} />
            <KeyValue label="城市" value={p.searchCondition.cities.join("、") || "不限"} />
            <KeyValue label="行业" value={p.searchCondition.industries.join("、") || "不限"} />
            <KeyValue label="学历" value={p.searchCondition.educationLevels.join("、") || "不限"} />
            <KeyValue
              label="工作年限"
              value={p.searchCondition.minYearsOfExperience ? `${p.searchCondition.minYearsOfExperience} 年以上` : "不限"}
            />
          </div>
        </CardContent>
      </Card>

      {/* 硬性条件 */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <h3 className="text-sm font-semibold">硬性条件</h3>
          {p.hardRequirements.length > 0 ? (
            <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
              {p.hardRequirements.map((req) => (
                <li key={req.key}>{req.label}</li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted-foreground">未设置</p>}
        </CardContent>
      </Card>

      {/* 软性条件 */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <h3 className="text-sm font-semibold">软性条件</h3>
          {p.softRequirements.length > 0 ? (
            <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
              {p.softRequirements.map((req) => (
                <li key={req.key}>{req.label}：{req.description}</li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted-foreground">未设置</p>}
        </CardContent>
      </Card>

      {/* 版本历史 */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <h3 className="text-sm font-semibold">版本历史</h3>
          {renderVersions(props.versions, p.currentVersionId)}
        </CardContent>
      </Card>

      {/* 关联寻访任务 */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <h3 className="text-sm font-semibold">寻访任务（{runs.length}）</h3>
          {runs.length === 0 ? (
            <EmptyState text="暂无关联的寻访任务。点击「启动寻访」创建。" />
          ) : (
            <div className="space-y-1">
              {runs.map((run) => {
                const pct = run.targetResultCount > 0
                  ? Math.round((run.rawSubmittedCount / run.targetResultCount) * 100)
                  : 0;
                return (
                  <div
                    key={run.id}
                    className="flex items-center justify-between border rounded px-3 py-2 text-xs cursor-pointer hover:bg-accent/50"
                    onClick={() => props.onViewSearchRun(run.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline">{run.status}</Badge>
                      <span className="font-mono">{run.rawSubmittedCount}/{run.targetResultCount}</span>
                      <span className="text-muted-foreground">{pct}%</span>
                    </div>
                    <span className="text-muted-foreground font-mono text-[10px] truncate ml-2">{run.id}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// ─── 辅助函数 ──────────────────────────────────────────────────────

function renderVersions(versions: JobProfileVersion[], currentVersionId: string | undefined): React.ReactElement {
  if (versions.length === 0) {
    return <p className="text-xs text-muted-foreground">暂无版本记录。</p>;
  }

  const sorted = [...versions].sort((a, b) => b.version - a.version);
  return (
    <div className="space-y-1">
      {sorted.map((v) => {
        const isCurrent = v.id === currentVersionId;
        return (
          <div
            key={v.id}
            className={"flex items-center justify-between border rounded px-3 py-2 text-xs " + (isCurrent ? "border-primary/30 bg-primary/5" : "")}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">v{v.version}</span>
              <Badge variant={v.status === "Confirmed" ? "default" : "secondary"}>{v.status}</Badge>
              {isCurrent ? <Badge variant="outline">当前</Badge> : null}
            </div>
            <div className="text-right text-muted-foreground">
              <p>{formatDate2(v.createdAt)}</p>
              {v.confirmedAt ? <p className="text-[10px]">确认于 {formatDate2(v.confirmedAt)}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDate2(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
