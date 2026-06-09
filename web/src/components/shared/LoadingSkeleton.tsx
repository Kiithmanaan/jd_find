import React from "react";
import { Skeleton } from "../ui/skeleton.js";

export function LoadingSkeleton(props: { rows: number }): React.ReactElement {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: props.rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
