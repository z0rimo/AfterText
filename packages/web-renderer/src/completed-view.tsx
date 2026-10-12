import type { ReactNode, Ref } from "react";

export interface CompletedViewProps {
  readonly onRestart: () => void;
  readonly primaryRef?: Ref<HTMLButtonElement>;
}

export function CompletedView({ onRestart, primaryRef }: CompletedViewProps): ReactNode {
  return (
    <div>
      <p>Story complete.</p>
      <button ref={primaryRef} type="button" onClick={onRestart}>
        Restart
      </button>
    </div>
  );
}
