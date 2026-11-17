import type { ExecutionResult, RuntimeExecutionErrorKind } from "@aftertext/runtime";
import type { JsonValue } from "./snapshot-types.js";
import { isPlainRecord } from "./snapshot-types.js";

/**
 * Private, opaque current-result descriptor (docs/CORE_SPEC.md Section
 * 33.7) — never exported. An AST-bearing live result (`content.block`,
 * `dialogue.speaker`/`content`, `presentation.command`) is never stored
 * here; only enough to identify which kind of suspension it was. The
 * structural position needed to re-derive it comes from Runtime's own
 * `toCursorPosition`/`fromCursorPosition`, not from this descriptor.
 */
export type SnapshotCurrent =
  | { readonly type: "notStarted" }
  | { readonly type: "content" }
  | { readonly type: "dialogue" }
  | { readonly type: "presentation" }
  | { readonly type: "choice"; readonly items: readonly { readonly text: string; readonly target: string }[] }
  | { readonly type: "navigation"; readonly from: string; readonly to: string }
  | { readonly type: "completed" }
  | { readonly type: "error"; readonly kind: RuntimeExecutionErrorKind; readonly message: string };

/**
 * Exhaustive, compile-time-checked lookup of every current
 * `RuntimeExecutionErrorKind` (docs/CORE_SPEC.md Section 33.8): the
 * `satisfies` constraint means a future kind added to the union without a
 * matching entry here fails to compile, rather than silently being
 * accepted or rejected as a decode runtime surprise.
 */
const RUNTIME_EXECUTION_ERROR_KINDS = {
  "unknown-identifier": true,
  "type-mismatch": true,
  "division-by-zero": true,
  "invalid-arithmetic-result": true,
  "empty-choice": true,
  "invalid-choice-selection": true,
  "invalid-scene-target": true,
  "step-limit-exceeded": true,
  "unknown-builtin": true,
  "invalid-variant-reference": true,
  "invalid-execution-block": true
} satisfies Record<RuntimeExecutionErrorKind, true>;

function isRuntimeExecutionErrorKind(value: string): value is RuntimeExecutionErrorKind {
  return Object.hasOwn(RUNTIME_EXECUTION_ERROR_KINDS, value);
}

/** Compile-time exhaustiveness guard — see `document-fingerprint.ts`'s identical `unhandledVariant` for the rationale. */
function unhandledResultType(value: never): never {
  throw new Error(`snapshot-current: unhandled ExecutionResult variant: ${JSON.stringify(value)}`);
}

/**
 * Encodes `current` as an opaque `JsonValue` (docs/CORE_SPEC.md Section
 * 33.7). `current === null` means `PlayerState` was created but has never
 * advanced — encoded as `"notStarted"`, the same uniform sentinel every
 * other no-structural-position kind uses (Section 33.4's uniform-capture
 * principle, extended here to the current descriptor itself).
 */
export function encodeCurrent(current: ExecutionResult | null): JsonValue {
  if (current === null) return { type: "notStarted" };
  if (current.type === "content") return { type: "content" };
  if (current.type === "dialogue") return { type: "dialogue" };
  if (current.type === "presentation") return { type: "presentation" };
  if (current.type === "choice") {
    return { type: "choice", items: current.items.map((item): JsonValue => ({ text: item.text, target: item.target })) };
  }
  if (current.type === "navigation") return { type: "navigation", from: current.from, to: current.to };
  if (current.type === "completed") return { type: "completed" };
  if (current.type === "error") return { type: "error", kind: current.error.kind, message: current.error.message };
  return unhandledResultType(current);
}

/**
 * Reads `value` by index up to its own captured `.length` rather than
 * with `for...of`: a `for...of` loop consults `Symbol.iterator`, so a
 * caller-supplied array Proxy with a short, `isJsonValue`-validated
 * `.length` but a custom iterator that yields indefinitely would
 * otherwise loop forever here — indexed access never invokes it.
 */
function decodeChoiceItems(value: unknown): readonly { readonly text: string; readonly target: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const length = value.length;
  const items: { text: string; target: string }[] = [];
  for (let i = 0; i < length; i++) {
    const raw = value[i];
    if (!isPlainRecord(raw)) return undefined;
    const { text, target } = raw;
    if (typeof text !== "string" || typeof target !== "string") return undefined;
    items.push({ text, target });
  }
  return items;
}

/**
 * Validates and decodes an opaque `current` value (docs/CORE_SPEC.md
 * Section 33.8) — `value` is untrusted JSON-compatible data, not trusted
 * internal state. Returns `undefined` for any malformed shape; never
 * throws.
 */
export function decodeCurrent(value: JsonValue): SnapshotCurrent | undefined {
  if (!isPlainRecord(value)) return undefined;
  const type = value.type;
  if (type === "notStarted" || type === "content" || type === "dialogue" || type === "presentation" || type === "completed") {
    return { type };
  }
  if (type === "navigation") {
    const { from, to } = value;
    return typeof from === "string" && typeof to === "string" ? { type: "navigation", from, to } : undefined;
  }
  if (type === "choice") {
    const items = decodeChoiceItems(value.items);
    return items ? { type: "choice", items } : undefined;
  }
  if (type === "error") {
    const { kind, message } = value;
    return typeof kind === "string" && isRuntimeExecutionErrorKind(kind) && typeof message === "string"
      ? { type: "error", kind, message }
      : undefined;
  }
  return undefined;
}
