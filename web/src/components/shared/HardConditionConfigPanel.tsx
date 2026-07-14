import React from "react";
import { Card, CardContent } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { KeyValue } from "./KeyValue.js";
import { EmptyState } from "./EmptyState.js";
import { ErrorState } from "./ErrorState.js";
import { LoadingSkeleton } from "./LoadingSkeleton.js";
import type { HardConditionConfigDimension } from "../../lib/api-types.js";

export interface HardConditionConfigPanelProps {
  dimensions: HardConditionConfigDimension[] | undefined;
  loading: boolean;
  error: string | undefined;
  onRetry: () => void;
}

const VALUE_TYPE_LABEL: Record<string, string> = {
  text: "文本",
  option: "选项",
  number: "数值",
};

const MATCH_MODE_LABEL: Record<string, string> = {
  exact: "精确匹配",
  normalizedContains: "归一化包含",
  optionAny: "选项匹配",
  rankAtLeast: "等级≥",
  min: "最小值",
};

export function HardConditionConfigPanel(props: HardConditionConfigPanelProps): React.ReactElement {
  if (props.loading) {
    return <LoadingSkeleton rows={5} />;
  }

  if (props.error) {
    return <ErrorState message={props.error} onRetry={props.onRetry} />;
  }

  if (!props.dimensions || props.dimensions.length === 0) {
    return <EmptyState text="暂无硬筛配置数据。" />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">硬筛条件配置</h2>
      <p className="text-xs text-muted-foreground">
        岗位画像硬筛由以下维度组成。配置只读展示，编辑在后端完成。
      </p>
      <div className="grid gap-4">
        {props.dimensions.map((dimension) => (
          <Card key={dimension.id}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">{dimension.label}</h3>
                  <Badge variant="outline">{dimension.key}</Badge>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary">{VALUE_TYPE_LABEL[dimension.valueType] ?? dimension.valueType}</Badge>
                  {dimension.allowMultiple ? <Badge>多选</Badge> : <Badge variant="outline">单选</Badge>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <KeyValue label="值类型" value={VALUE_TYPE_LABEL[dimension.valueType] ?? dimension.valueType} />
                <KeyValue label="支持匹配方式" value={dimension.supportedMatchModes.map((m) => MATCH_MODE_LABEL[m] ?? m).join(", ")} />
                <KeyValue label="允许多值" value={dimension.allowMultiple ? "是" : "否"} />
              </div>

              {dimension.options.length > 0 ? (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">预设选项</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {dimension.options.map((option) => (
                      <div key={option.id} className="border rounded px-3 py-2 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{option.label}</span>
                          <Badge variant="outline">{option.value}</Badge>
                          {option.rank ? <Badge>rank {option.rank}</Badge> : null}
                        </div>
                        {option.aliases.length > 0 ? (
                          <p className="text-muted-foreground">别名: {option.aliases.join(", ")}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">自由输入，无预设选项。</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
