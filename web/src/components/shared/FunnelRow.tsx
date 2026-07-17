import React from "react";
import type { FunnelCounts } from "../../lib/api-types.js";

const STAGES: Array<{ key: keyof FunnelCounts; label: string }> = [
  { key: "rawSubmitted", label: "原始提交" },
  { key: "deduplicated", label: "去重后" },
  { key: "hardPassed", label: "硬筛通过" },
  { key: "hardRejected", label: "硬筛淘汰" },
  { key: "assessed", label: "已评估" },
  { key: "recommended", label: "推荐" },
  { key: "pending", label: "待定" },
  { key: "notRecommended", label: "不推荐" },
];

export function FunnelRow(props: { funnel: FunnelCounts }): React.ReactElement {
  return (
    <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
      {STAGES.map((stage) => (
        <div key={stage.key} className="rounded border p-2 text-center">
          <div className="text-[10px] text-muted-foreground">{stage.label}</div>
          <div className="text-lg font-semibold">{props.funnel[stage.key]}</div>
        </div>
      ))}
    </div>
  );
}
