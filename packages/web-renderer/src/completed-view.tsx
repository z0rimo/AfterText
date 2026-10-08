import type { ReactNode } from "react";

export interface CompletedViewProps {
  readonly onRestart: () => void;
}

export function CompletedView({ onRestart }: CompletedViewProps): ReactNode {
  return (
    <div>
      <p>Story complete.</p>
      <button type="button" onClick={onRestart}>
        Restart
      </button>
    </div>
  );
}
