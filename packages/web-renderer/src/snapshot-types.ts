import type { PlayerRestoreError, PlayerSnapshot } from "@aftertext/player";

/**
 * The Web Renderer's own public Presentation persistence contract
 * (docs/CORE_SPEC.md Section 33.10) — deliberately a separate, independent
 * schema from the internal `PresentationState` (`presentation-state.ts`),
 * not an alias of it. A future internal `PresentationState` change does
 * not automatically change this public contract, and vice versa.
 */
export interface PresentationSnapshot {
  readonly formatVersion: 1;
  readonly background: string | null;
  readonly layer: string | null;
  readonly cameraZoom: number;
  readonly music:
    | {
        readonly track: string;
        readonly volume?: number;
      }
    | null;
  readonly sprites: readonly {
    readonly id: string;
    readonly image: string;
    readonly position: "left" | "center" | "right";
  }[];
}

/**
 * Presentation's own, narrower restore failure surface (Section 33.11):
 * no `documentMismatch`/`unresolvablePosition`, since Presentation has no
 * document or structural-position concept of its own.
 */
export type PresentationRestoreError =
  | { readonly kind: "unsupportedFormatVersion" }
  | { readonly kind: "malformedSnapshot"; readonly reason: string };

/** For React convenience, composes Player's and the Web Renderer's independently-owned snapshot halves (Section 33.11). */
export interface AfterTextPlayerSnapshot {
  readonly player: PlayerSnapshot;
  readonly presentation: PresentationSnapshot;
}

export type AfterTextPlayerRestoreError =
  | { readonly kind: "invalidPlayerSnapshot"; readonly detail: PlayerRestoreError }
  | { readonly kind: "invalidPresentationSnapshot"; readonly detail: PresentationRestoreError };

export type AfterTextPlayerRestoreResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: AfterTextPlayerRestoreError };

/** The public ref handle `AfterTextPlayer` exposes via `forwardRef` (Section 33.11). */
export interface AfterTextPlayerHandle {
  getSnapshot(): AfterTextPlayerSnapshot;
  restoreSnapshot(snapshot: unknown): AfterTextPlayerRestoreResult;
}

/**
 * Whether `value` is itself a plain `{}`/`Object.create(null)`-style
 * record — never a class instance, `Date`, `Map`, `Set`, or other object
 * with a non-ordinary prototype. An untrusted snapshot must never be
 * treated as a plain data record merely because it has enumerable fields
 * (the same rule `@aftertext/player`'s own validation locks for the same
 * reason — Player's version is package-internal and not reachable here,
 * so this package keeps its own copy rather than deep-importing it,
 * Section 33.2/61).
 */
export function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Caps how large an untrusted `sprites` array is trusted to be before
 * scanning it, for the same reason Player's own `boundedArrayLength`
 * exists (`@aftertext/player`'s `snapshot-types.ts`): `Array.isArray`
 * accepts a cheaply-constructed sparse array claiming an astronomical
 * `.length`, and merely reading that length is not itself a validation
 * step — something still has to scan up to it. Chosen only to bound the
 * cost of a hostile length claim, never to approximate how many sprites a
 * real Sprite Stage could reasonably have.
 */
const MAX_SPRITES_LENGTH = 1_000_000;

/**
 * Reads `value.length` exactly once and returns it only if it is a
 * genuine nonnegative integer within `MAX_SPRITES_LENGTH`, or `undefined`
 * otherwise — mirrors `@aftertext/player`'s `boundedArrayLength` exactly
 * (same package-boundary reason as `isPlainRecord` above for not sharing
 * the implementation directly). A Proxy's `length` trap could otherwise
 * answer a negative/non-integer value (passing an upper-bound-only check
 * and then making an indexed loop run zero iterations, silently treating
 * malformed input as validly empty) or answer differently on a second
 * read (`.every()`/`for...of`'s own internal `Get`) than on this one —
 * every caller here iterates by index up to the value this function
 * returns instead.
 */
export function boundedArrayLength(value: readonly unknown[]): number | undefined {
  const length = value.length;
  return Number.isInteger(length) && length >= 0 && length <= MAX_SPRITES_LENGTH ? length : undefined;
}
