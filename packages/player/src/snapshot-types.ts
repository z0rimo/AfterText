import type { RuntimeState } from "@aftertext/runtime";
import type { PlayerState } from "./player-state.js";

/**
 * Runtime-local recursive JSON-compatible value alias (docs/CORE_SPEC.md
 * Section 33.6). This is the one Player owns as named public API — unlike
 * Runtime's own private `JsonValue` (`@aftertext/runtime`'s package
 * `exports` boundary keeps it unexported), Player's `snapshotPlayer`/
 * `restorePlayer` are the public encode/decode boundary a host actually
 * calls, so this alias is genuinely public.
 */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * A serializable, JSON-compatible snapshot of one `PlayerState` (docs/
 * CORE_SPEC.md Section 33.6). `position`/`current` are public storage
 * fields but semantically opaque — only `@aftertext/player` interprets
 * their internal shape; consumers must store/round-trip them verbatim and
 * never depend on their structure.
 */
export interface PlayerSnapshot {
  readonly formatVersion: 1;
  readonly documentFingerprint: string;
  readonly runtimeState: RuntimeState;
  readonly position: JsonValue;
  readonly current: JsonValue;
}

/**
 * A small, closed taxonomy (docs/CORE_SPEC.md Section 33.8) — no
 * diagnostic-code infrastructure. `reason` is optional on the two kinds
 * the spec describes as "may carry a human-readable reason"; the
 * implementation populates it on every actual rejection path, but the
 * type itself does not require it.
 */
export type PlayerRestoreError =
  | { readonly kind: "unsupportedFormatVersion" }
  | { readonly kind: "documentMismatch" }
  | { readonly kind: "malformedSnapshot"; readonly reason?: string }
  | { readonly kind: "unresolvablePosition"; readonly reason?: string };

export type RestorePlayerResult =
  | { readonly ok: true; readonly state: PlayerState }
  | { readonly ok: false; readonly error: PlayerRestoreError };

/**
 * Whether `value` is itself a plain `{}`/`Object.create(null)`-style
 * record — never a class instance, `Date`, `Map`, `Set`, or other object
 * with a non-ordinary prototype (docs/CORE_SPEC.md Section 33.8's
 * prototype-safety requirement extends to validation, not only
 * reconstruction: an enumerable-looking class instance must never be
 * treated as untrusted JSON data merely because it has fields).
 */
function hasOrdinaryRecordPrototype(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Caps how deeply `isJsonValue` will recurse into nested arrays/records
 * (docs/CORE_SPEC.md Section 33.8): `restorePlayer`'s `snapshot` parameter
 * is `unknown`, not merely "whatever `JSON.parse` can produce" — a caller
 * may hand it any JS value, including a self-referential object a real
 * JSON document could never express. Without a depth cap, validating such
 * a value (or an extremely deeply nested but acyclic one) recurses once
 * per level and eventually throws `RangeError: Maximum call stack size
 * exceeded` instead of returning the `{ok:false}` this public boundary
 * promises for every malformed input (never a thrown exception). No
 * legitimate `position`/`current` payload this package ever produces
 * nests anywhere near this deep, so the cap costs nothing for real data.
 *
 * The depth cap alone does not bound total *work*: a value can be a DAG
 * rather than a tree (the same child object referenced by many parents,
 * e.g. repeatedly wrapping one shared child as `[child, child]`), which
 * stays within the depth cap while the naive walk below re-validates that
 * shared subtree once per path to it — exponential in the number of
 * wrapping levels. `memo` records each object's already-computed result
 * (only once fully resolved, never for a call cut short by the depth
 * cap, so a node later reached again via a shallower path is still
 * evaluated correctly on its own terms) so a shared reference is walked
 * at most once, bounding total work by the number of distinct objects in
 * the graph rather than the number of paths to them.
 *
 * Neither the depth cap nor memoization bounds a single array's own
 * *length*: `Array.isArray(value)` accepts a sparse array like
 * `new Array(0xffffffff)`, and `.every()` still performs one
 * `HasProperty` check per index up to that length — billions of
 * synchronous checks for one shallow, memory-cheap array, hanging
 * `restorePlayer` before the depth cap or memo ever come into play
 * (both only limit work *below* a node, not the cost of scanning the
 * node itself). `MAX_JSON_ARRAY_LENGTH` rejects any array claiming to be
 * larger than this — chosen purely to stop a sparse-array length lie
 * from costing a meaningful amount of synchronous time (still a few
 * milliseconds of `.every()` even at this size), never to approximate
 * "how many Choice items a document could reasonably have": the
 * compiler's own `parseChoice` imposes no item-count limit at all, so
 * any cap here lower than this would reject a `snapshotPlayer`/
 * `restorePlayer` round trip for a legitimately authored (if unusually
 * large) Choice. A real, attacker-independent Choice this large would
 * still be handled correctly — `choiceItemsAreValidSubsequence`'s own
 * early reject bounds its DP table by the *authored* list's length,
 * which this constant does not touch.
 */
const MAX_JSON_VALUE_DEPTH = 64;
const MAX_JSON_ARRAY_LENGTH = 1_000_000;

/**
 * Captures `value.length` exactly once and returns it only if it is a
 * genuine array length — a nonnegative integer — within
 * `MAX_JSON_ARRAY_LENGTH`, or `undefined` otherwise — the one place
 * this package reads an untrusted array's `.length`. Checking only the
 * upper bound is not enough: a Proxy's `length` trap can return a
 * negative number (or `NaN`, or a non-integer), which would pass an
 * upper-bound-only check and then make every caller's `for (let i = 0;
 * i < length; i++)` loop below run zero iterations — silently treating
 * a malformed array as validly *empty* rather than rejecting it.
 * Checking the length and then separately calling a built-in like
 * `.every()` is also not equivalent: `.every()` performs its own
 * internal `Get(array, "length")`, a second read a live Proxy can
 * answer differently from the first (small enough to pass this check,
 * then enormous), so every caller here iterates by index up to the
 * value this function returns instead of ever calling `.every()`/
 * `for...of` on the array itself.
 */
export function boundedArrayLength(value: readonly unknown[]): number | undefined {
  const length = value.length;
  return Number.isInteger(length) && length >= 0 && length <= MAX_JSON_ARRAY_LENGTH ? length : undefined;
}

function isJsonValueAtDepth(value: unknown, depth: number, memo: Map<object, boolean>): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  const cached = memo.get(value);
  if (cached !== undefined) return cached;
  if (depth >= MAX_JSON_VALUE_DEPTH) return false;
  const result = Array.isArray(value)
    ? isJsonArrayAtDepth(value, depth, memo)
    : hasOrdinaryRecordPrototype(value) && Object.values(value).every((item) => isJsonValueAtDepth(item, depth + 1, memo));
  memo.set(value, result);
  return result;
}

function isJsonArrayAtDepth(value: readonly unknown[], depth: number, memo: Map<object, boolean>): boolean {
  const length = boundedArrayLength(value);
  if (length === undefined) return false;
  for (let i = 0; i < length; i++) {
    if (!isJsonValueAtDepth(value[i], depth + 1, memo)) return false;
  }
  return true;
}

/**
 * Validates that `value` is entirely JSON-compatible (docs/CORE_SPEC.md
 * Section 33.6, 33.8): only `null`, `string`, `boolean`, a finite number,
 * an array of valid `JsonValue`s, or a plain record of valid `JsonValue`s.
 * Rejects `undefined`, `NaN`/`Infinity`/`-Infinity`, `bigint`, `symbol`,
 * functions, and any object whose prototype is not `Object.prototype` or
 * `null` (so a `Date`/`Map`/`Set`/class instance is never mistaken for a
 * JSON record merely because it has enumerable fields). Never throws and
 * never does exponential work, even on a cyclic, pathologically deep, or
 * heavily-shared (DAG-shaped) input — see `MAX_JSON_VALUE_DEPTH`.
 */
export function isJsonValue(value: unknown): value is JsonValue {
  return isJsonValueAtDepth(value, 0, new Map());
}

/** Whether `value` is a plain, untrusted-input-safe record — the `unknown`-input counterpart of `isJsonValue`'s own record check. */
export function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && hasOrdinaryRecordPrototype(value);
}
