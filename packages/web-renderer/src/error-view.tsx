import type { RuntimeExecutionError } from "@aftertext/player";
import type { ReactNode } from "react";

export interface ErrorViewProps {
  readonly error: RuntimeExecutionError;
  readonly onRestart: () => void;
}

/**
 * Runtime/Player errors are ordinary result data, never thrown into a
 * React error boundary as normal narrative behavior (docs/CORE_SPEC.md
 * Section 19.16). Only the stable `kind` and human-readable `message` are
 * shown — never a stack trace or an internal debug dump.
 */
export function ErrorView({ error, onRestart }: ErrorViewProps): ReactNode {
  return (
    <div role="alert">
      <p>Error: {error.kind}</p>
      <p>{error.message}</p>
      <button type="button" onClick={onRestart}>
        Restart
      </button>
    </div>
  );
}
