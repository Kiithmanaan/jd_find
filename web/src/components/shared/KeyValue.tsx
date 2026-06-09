import React from "react";

export function KeyValue(props: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex gap-2 py-1 text-sm border rounded px-2 bg-muted/30 mb-1">
      <span className="font-medium shrink-0">{props.label}：</span>
      <span className="truncate">{props.value}</span>
    </div>
  );
}
