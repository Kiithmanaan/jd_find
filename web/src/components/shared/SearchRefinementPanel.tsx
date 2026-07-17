import React from "react";
import { Button } from "../ui/button.js";
import { Card, CardContent } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { EmptyState } from "./EmptyState.js";
import type { SearchRefinementSuggestion } from "../../lib/api-types.js";

export interface SearchRefinementPanelProps {
  suggestions: SearchRefinementSuggestion[];
  currentVersionId?: string;
  loading?: boolean;
  generating?: boolean;
  applying?: boolean;
  error?: string;
  onGenerate: () => void;
  onApply: (suggestion: SearchRefinementSuggestion) => void;
}

export function SearchRefinementPanel(props: SearchRefinementPanelProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">搜索词迭代建议（推荐组 vs 淘汰组）</h3>
        <Button size="sm" variant="outline" onClick={props.onGenerate} disabled={props.generating}>
          {props.generating ? "分析中…" : "生成建议"}
        </Button>
      </div>
      {props.error ? <p className="text-xs text-red-600">{props.error}</p> : null}
      {props.loading ? <p className="text-xs text-muted-foreground">加载中…</p> : null}

      {props.suggestions.length === 0 && !props.loading ? (
        <EmptyState text="寻访完成后点击「生成建议」，对比推荐与淘汰候选人的简历特征，产出下一轮搜索关键词建议。" />
      ) : (
        <div className="space-y-3">
          {props.suggestions.map((suggestion) => {
            const stale = props.currentVersionId && suggestion.jobProfileVersionId !== props.currentVersionId;
            return (
              <Card key={suggestion.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatTime(suggestion.createdAt)}</span>
                      <span>
                        推荐 {suggestion.analysisSnapshot.recommendedCount} · 淘汰 {suggestion.analysisSnapshot.eliminatedCount}
                      </span>
                      {stale ? <Badge variant="secondary">基于历史版本</Badge> : null}
                    </div>
                    <Button size="sm" onClick={() => props.onApply(suggestion)} disabled={props.applying}>
                      应用建议创建草稿
                    </Button>
                  </div>
                  <div className="grid gap-2 text-xs md:grid-cols-2">
                    <div>
                      <p className="font-medium">建议新增关键词</p>
                      {suggestion.addedKeywords.length > 0 ? (
                        <p className="text-muted-foreground">{suggestion.addedKeywords.join("、")}</p>
                      ) : <p className="text-muted-foreground">无</p>}
                    </div>
                    <div>
                      <p className="font-medium">建议移除关键词</p>
                      {suggestion.droppedKeywords.length > 0 ? (
                        <p className="text-muted-foreground">{suggestion.droppedKeywords.join("、")}</p>
                      ) : <p className="text-muted-foreground">无</p>}
                    </div>
                  </div>
                  <div className="text-xs">
                    <p className="font-medium">建议搜索关键词</p>
                    <p className="text-muted-foreground">{suggestion.suggestedSearchCondition.keywords.join("、")}</p>
                  </div>
                  <p className="text-xs border rounded p-2 bg-muted/20">{suggestion.reasoning}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
