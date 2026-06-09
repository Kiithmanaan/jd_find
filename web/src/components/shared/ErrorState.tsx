import React from "react";

export function ErrorState(props: { message: string; onRetry?: () => void }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <p className="text-sm text-destructive">{props.message}</p>
      {props.onRetry ? (
        <button
          onClick={props.onRetry}
          className="text-xs text-muted-foreground underline hover:text-foreground cursor-pointer"
        >
          重试
        </button>
      ) : null}
    </div>
  );
}
