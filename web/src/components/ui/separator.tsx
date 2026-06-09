import React from "react";
import { cn } from "../../lib/utils.js";

export function Separator({ className }: { className?: string }): React.ReactElement {
  return <div className={cn("shrink-0 bg-border h-[1px] w-full my-2", className)} />;
}
