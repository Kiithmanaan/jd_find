import React from "react";
import { cn } from "../../lib/utils.js";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "destructive";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps): React.ReactElement {
  const variants: Record<string, string> = {
    default: "border-transparent bg-primary text-primary-foreground shadow",
    secondary: "border-transparent bg-secondary text-secondary-foreground",
    destructive: "border-transparent bg-destructive text-destructive-foreground shadow",
    outline: "text-foreground",
  };

  return (
    <div
      className={cn("inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors", variants[variant], className)}
      {...props}
    />
  );
}
