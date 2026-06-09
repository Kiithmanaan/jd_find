import React from "react";
import { cn } from "../../lib/utils.js";

type PageId = "profiles" | "profile-editor" | "search-run" | "candidate-summary";

export function SideNav(props: { currentPath: PageId; onNavigate: (p: PageId) => void }): React.ReactElement {
  const btn = (label: string, page: PageId) => (
    <button
      onClick={() => props.onNavigate(page)}
      className={cn("block w-full text-left rounded-md px-3 py-2 text-sm hover:bg-accent mb-1", props.currentPath === page && "bg-accent font-medium")}
    >
      {label}
    </button>
  );

  return (
    <aside className="border-r p-4 w-[220px] bg-background flex-shrink-0">
      <p className="mb-2 mt-0 text-xs font-bold text-muted-foreground">岗位</p>
      {btn("JobProfile 列表", "profiles")}
      {btn("创建/编辑画像", "profile-editor")}
      <p className="mb-2 mt-6 text-xs font-bold text-muted-foreground">任务</p>
      {btn("SearchRun 详情", "search-run")}
      {btn("候选人汇总", "candidate-summary")}
    </aside>
  );
}
