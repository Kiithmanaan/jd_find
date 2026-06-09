import React from "react";
import { cn } from "../../lib/utils.js";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps): React.ReactElement | null {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => onOpenChange(false)}>
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative z-50 max-w-lg w-full mx-4 bg-background rounded-lg border shadow-lg" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function DialogContent({ className, children }: { className?: string; children: React.ReactNode }): React.ReactElement {
  return <div className={cn("p-6", className)}>{children}</div>;
}

export function DialogHeader({ className, children }: { className?: string; children: React.ReactNode }): React.ReactElement {
  return <div className={cn("mb-4", className)}>{children}</div>;
}

export function DialogTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}
