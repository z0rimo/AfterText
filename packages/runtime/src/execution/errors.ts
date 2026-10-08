import type { SourceSpan } from "@aftertext/compiler";

/**
 * Narrow runtime execution error categories — deliberately not a code
 * registry mirroring the compiler's `Diagnostic`. Runtime execution errors
 * are a distinct concern from compiler diagnostics: different producer,
 * different audience, different lifecycle (docs/CORE_SPEC.md Section
 * 17.11).
 */
export type RuntimeExecutionErrorKind =
  | "unknown-identifier"
  | "type-mismatch"
  | "division-by-zero"
  | "invalid-arithmetic-result"
  | "empty-choice"
  | "invalid-choice-selection"
  | "invalid-scene-target"
  | "step-limit-exceeded"
  | "unknown-builtin"
  | "invalid-variant-reference";

export interface RuntimeExecutionError {
  readonly kind: RuntimeExecutionErrorKind;
  readonly message: string;
  readonly span?: SourceSpan;
}

function error(kind: RuntimeExecutionErrorKind, message: string, span?: SourceSpan): RuntimeExecutionError {
  return span ? { kind, message, span } : { kind, message };
}

export const RuntimeErrors = {
  unknownIdentifier(name: string, span?: SourceSpan): RuntimeExecutionError {
    return error("unknown-identifier", `Unknown identifier "${name}".`, span);
  },
  typeMismatch(message: string, span?: SourceSpan): RuntimeExecutionError {
    return error("type-mismatch", message, span);
  },
  divisionByZero(span?: SourceSpan): RuntimeExecutionError {
    return error("division-by-zero", "Division or modulo by zero.", span);
  },
  invalidArithmeticResult(span?: SourceSpan): RuntimeExecutionError {
    return error(
      "invalid-arithmetic-result",
      "Arithmetic result is not a finite, JSON-representable number.",
      span
    );
  },
  emptyChoice(span?: SourceSpan): RuntimeExecutionError {
    return error("empty-choice", "No choice items are available.", span);
  },
  invalidChoiceSelection(message: string): RuntimeExecutionError {
    return error("invalid-choice-selection", message);
  },
  invalidSceneTarget(target: string, span?: SourceSpan): RuntimeExecutionError {
    return error("invalid-scene-target", `Target scene "${target}" does not exist.`, span);
  },
  stepLimitExceeded(): RuntimeExecutionError {
    return error("step-limit-exceeded", "Execution step budget exceeded before reaching a suspension point.");
  },
  unknownBuiltin(name: string, span?: SourceSpan): RuntimeExecutionError {
    return error("unknown-builtin", `Unknown builtin call "${name}".`, span);
  },
  invalidVariantReference(variantId: string, span?: SourceSpan): RuntimeExecutionError {
    return error("invalid-variant-reference", `Reference to unknown Variant "${variantId}".`, span);
  }
} as const;
