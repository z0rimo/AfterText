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
 * Validates that `value` is entirely JSON-compatible (docs/CORE_SPEC.md
 * Section 33.6, 33.8): only `null`, `string`, `boolean`, a finite number,
 * an array of valid `JsonValue`s, or a plain record of valid `JsonValue`s.
 * Rejects `undefined`, `NaN`/`Infinity`/`-Infinity`, `bigint`, `symbol`,
 * functions, and any object whose prototype is not `Object.prototype` or
 * `null` (so a `Date`/`Map`/`Set`/class instance is never mistaken for a
 * JSON record merely because it has enumerable fields).
 */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  if (!hasOrdinaryRecordPrototype(value)) return false;
  return Object.values(value).every(isJsonValue);
}

/** Whether `value` is a plain, untrusted-input-safe record — the `unknown`-input counterpart of `isJsonValue`'s own record check. */
export function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && hasOrdinaryRecordPrototype(value);
}
