import React from "react";

export function EmptyState(props: { text: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm text-muted-foreground">{props.text}</p>
    </div>
  );
}
