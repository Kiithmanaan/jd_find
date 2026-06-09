import React from "react";
import { Button } from "../ui/button.js";

export function TopBar(props: { userEmail: string; onLogout: () => void }): React.ReactElement {
  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b px-5 py-3 bg-background">
      <div>
        <p className="text-xs text-muted-foreground">JD Search Console</p>
        <h1 className="text-lg font-semibold">猎头寻访工作台</h1>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{props.userEmail}</span>
        <Button variant="outline" size="sm" onClick={props.onLogout}>退出</Button>
      </div>
    </header>
  );
}
