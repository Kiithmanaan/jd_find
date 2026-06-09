import React from "react";
import { cn } from "../../lib/utils.js";

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

export function Select({ value, onValueChange, children }: SelectProps): React.ReactElement {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1"
      >
        {children}
      </select>
    </div>
  );
}

export function SelectTrigger({ children, className }: { children: React.ReactNode; className?: string }): React.ReactElement {
  return <div className={cn("flex h-9 w-full items-center justify-between rounded-md border border-input px-3 py-2 text-sm", className)}>{children}</div>;
}

export function SelectValue({ placeholder }: { placeholder?: string }): React.ReactElement {
  return <span className="text-xs text-muted-foreground">{placeholder ?? ""}</span>;
}

export function SelectContent({ children }: { children: React.ReactNode }): React.ReactElement {
  return <>{children}</>;
}

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }): React.ReactElement {
  return <option value={value}>{children}</option>;
}
