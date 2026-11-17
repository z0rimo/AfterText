import type { StoryBlock, StoryDocument } from "@aftertext/compiler";
import type { RuntimeState } from "../state/runtime-state.js";
import { ownEntry } from "../reader/own-entry.js";
import { INITIAL_CURSOR, type CursorFrame, type ExecutionCursor } from "./cursor.js";

/**
 * Runtime-local recursive JSON-compatible value alias (docs/CORE_SPEC.md
 * Section 33.2, 33.4, 33.18). Deliberately NOT re-exported from the
 * package's public barrel (`index.ts`): the named public `JsonValue` is
 * `@aftertext/player`'s to own (Section 33.6); Runtime must not begin
 * depending on `@aftertext/player`, nor introduce a second, competing
 * public `JsonValue` of its own. Exported from this module only so
 * `toCursorPosition`/`fromCursorPosition`'s own signatures can be
 * annotated with it where used elsewhere in this package (e.g. tests);
 * Player's eventual `JsonValue` is structurally compatible with this one.
 */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * The suspension kinds `fromCursorPosition` can reconstruct a cursor for.
 * `"navigation"`/`"completed"`/"not started" never call it at all — none
 * of the three has a cursor to reconstruct in the first place (docs/
 * CORE_SPEC.md Section 33.4, 33.7).
 */
export type CursorPositionResultKind = "content" | "dialogue" | "presentation" | "choice" | "error";

/** One frame's opaque, JSON-compatible encoding — mirrors `CursorFrame` minus any AST reference. */
type FramePosition =
  | { readonly kind: "scene"; readonly index: number; readonly visitRecorded: boolean }
  | { readonly kind: "conditional"; readonly branchIndex: number; readonly index: number }
  | {
      readonly kind: "variant";
      readonly variantId: string;
      readonly branchId: string;
      readonly index: number;
      readonly seenRecorded: boolean;
    };

/**
 * The opaque position payload shape. `sceneId` is stored exactly once, at
 * the top level, from `runtimeState.navigation.sceneId` — never duplicated
 * onto the scene frame itself — so there is no second copy that could ever
 * disagree with it (docs/CORE_SPEC.md Section 33.4's "internally
 * consistent" requirement is satisfied by construction, not by a runtime
 * cross-check against a value that doesn't exist).
 */
interface CursorPositionPayload {
  readonly sceneId: string;
  readonly frames: readonly FramePosition[];
}

/**
 * Derives an opaque, JSON-compatible structural position from a live
 * cursor (docs/CORE_SPEC.md Section 33.2, 33.4) — the one half of
 * Runtime's narrow Save/Restore boundary. Takes `runtimeState`, not only
 * `cursor`, because the scene frame's stable identity (`sceneId`) lives in
 * `runtimeState.navigation`, not on the cursor itself.
 *
 * Always captures each open frame's real `visitRecorded`/`seenRecorded`
 * status exactly as it stands — uniformly, regardless of what suspension
 * kind the caller is snapshotting (this function has no `resultKind`
 * parameter and cannot know, or behave differently based on, one). See
 * Section 33.4 for why a kind-dependent encoding would in fact be
 * impossible to implement correctly, and why always capturing the real
 * value is correct for every kind uniformly.
 */
export function toCursorPosition(runtimeState: RuntimeState, cursor: ExecutionCursor): JsonValue {
  const frames: JsonValue[] = cursor.map((frame): JsonValue => {
    if (frame.kind === "scene") {
      return { kind: "scene", index: frame.index, visitRecorded: frame.visitRecorded };
    }
    if (frame.kind === "conditional") {
      return { kind: "conditional", branchIndex: frame.branchIndex, index: frame.index };
    }
    return {
      kind: "variant",
      variantId: frame.variantId,
      branchId: frame.branchId,
      index: frame.index,
      seenRecorded: frame.seenRecorded
    };
  });

  return { sceneId: runtimeState.navigation.sceneId, frames };
}

function isPlainRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * No legitimate structural cursor ever nests anywhere near this deep
 * (it mirrors the authored document's own Scene/Conditional/Variant
 * nesting). Caps `rawFrames.length` so a caller-supplied array claiming
 * an astronomical length (cheap to construct when sparse, e.g.
 * `new Array(0xffffffff)`) cannot force an equally astronomical number
 * of index reads below.
 */
const MAX_FRAMES_LENGTH = 10_000;

/**
 * Runtime-level parse of the untrusted opaque payload's top-level and
 * per-frame shape — no throw on malformed input. Reads `rawFrames` by
 * index up to its own captured `.length` rather than with `for...of`:
 * a `for...of` loop consults `Symbol.iterator`, so a caller-supplied
 * array Proxy with a short, validly-checked `.length` but a custom
 * iterator that yields indefinitely would otherwise loop forever
 * (`position` is untrusted `JsonValue`, not merely whatever
 * `JSON.parse` could have produced) — indexed access never invokes it.
 */
function parsePositionPayload(position: JsonValue): CursorPositionPayload | undefined {
  if (!isPlainRecord(position)) return undefined;
  const { sceneId, frames: rawFrames } = position;
  if (typeof sceneId !== "string" || !Array.isArray(rawFrames)) return undefined;
  const length = rawFrames.length;
  if (length > MAX_FRAMES_LENGTH) return undefined;

  const frames: FramePosition[] = [];
  for (let i = 0; i < length; i++) {
    const frame = parseFramePosition(rawFrames[i]!);
    if (!frame) return undefined;
    frames.push(frame);
  }
  return { sceneId, frames };
}

function parseFramePosition(raw: JsonValue): FramePosition | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const { kind, index } = raw;
  if (typeof index !== "number") return undefined;

  if (kind === "scene") {
    return typeof raw.visitRecorded === "boolean" ? { kind: "scene", index, visitRecorded: raw.visitRecorded } : undefined;
  }
  if (kind === "conditional") {
    return typeof raw.branchIndex === "number" ? { kind: "conditional", branchIndex: raw.branchIndex, index } : undefined;
  }
  if (kind === "variant") {
    return typeof raw.variantId === "string" && typeof raw.branchId === "string" && typeof raw.seenRecorded === "boolean"
      ? { kind: "variant", variantId: raw.variantId, branchId: raw.branchId, index, seenRecorded: raw.seenRecorded }
      : undefined;
  }
  return undefined;
}

/**
 * Resolves a child frame's own block list from its parent's currently
 * pointed-at block (docs/CORE_SPEC.md Section 33.10): a Conditional child
 * requires that block to be a `ConditionalNode` with an in-range
 * `branchIndex`; a Variant child requires it to be the exact `VariantNode`
 * named by `variantId`, with a `branchId` that resolves within it. Never
 * searches the document for an arbitrary Conditional/Variant elsewhere.
 */
function resolveChildBlocks(parentBlock: StoryBlock | undefined, next: FramePosition): readonly StoryBlock[] | undefined {
  if (next.kind === "conditional") {
    if (parentBlock?.type !== "Conditional") return undefined;
    if (!Number.isInteger(next.branchIndex) || next.branchIndex < 0 || next.branchIndex >= parentBlock.branches.length) {
      return undefined;
    }
    return parentBlock.branches[next.branchIndex]?.blocks;
  }
  if (next.kind === "variant") {
    if (parentBlock?.type !== "Variant" || parentBlock.id !== next.variantId) return undefined;
    return parentBlock.branches.find((branch) => branch.branchId === next.branchId)?.blocks;
  }
  return undefined; // a scene frame may only ever be frame 0
}

/** Constructs the structural `CursorFrame` a validated `FramePosition` describes — pure, no validation of its own. */
function buildCursorFrame(framePos: FramePosition, sceneId: string): CursorFrame {
  if (framePos.kind === "scene") {
    return { kind: "scene", sceneId, index: framePos.index, visitRecorded: framePos.visitRecorded };
  }
  if (framePos.kind === "conditional") {
    return { kind: "conditional", branchIndex: framePos.branchIndex, index: framePos.index };
  }
  return {
    kind: "variant",
    variantId: framePos.variantId,
    branchId: framePos.branchId,
    index: framePos.index,
    seenRecorded: framePos.seenRecorded
  };
}

type OneFrameResolution =
  | { readonly ok: true; readonly frame: CursorFrame; readonly childBlocks: readonly StoryBlock[] | undefined }
  | { readonly ok: false };

/**
 * Validates and resolves exactly one frame position against its parent's
 * current block list: index-bound checking (resultKind-dependent only for
 * the deepest frame, Section 33.4/33.7), structural construction, and —
 * for a non-deepest frame — resolving the next frame's own block list from
 * this one's currently-pointed-at block (Section 33.10–33.12).
 */
function resolveOneFrame(
  framePos: FramePosition,
  sceneId: string,
  blocks: readonly StoryBlock[],
  isDeepest: boolean,
  resultKind: CursorPositionResultKind,
  nextFramePos: FramePosition | undefined
): OneFrameResolution {
  if (!Number.isInteger(framePos.index) || framePos.index < 0) return { ok: false };
  if (isDeepest) {
    const maxIndex = resultKind === "choice" ? blocks.length - 1 : blocks.length;
    if (framePos.index > maxIndex) return { ok: false };
  } else if (framePos.index >= blocks.length) {
    return { ok: false };
  }

  const frame = buildCursorFrame(framePos, sceneId);
  if (isDeepest) return { ok: true, frame, childBlocks: undefined };

  const childBlocks = resolveChildBlocks(blocks[framePos.index], nextFramePos!);
  return childBlocks ? { ok: true, frame, childBlocks } : { ok: false };
}

type SuspensionBlockResolution = { readonly ok: true; readonly block: StoryBlock | undefined } | { readonly ok: false };

/**
 * Resolves the final `StoryBlock` the suspension's own `resultKind`
 * requires from the deepest frame's own position and resolved block list
 * (docs/CORE_SPEC.md Section 33.4, 33.7): one past the deepest frame's
 * index for content/dialogue/presentation (already-advanced), exactly at
 * it for choice (never advanced, and must genuinely be a `ChoiceNode`),
 * and never for error — whose own plain data is restored directly, not
 * re-derived from any AST node.
 */
function resolveSuspensionBlock(
  resultKind: CursorPositionResultKind,
  deepestFramePos: FramePosition,
  blocks: readonly StoryBlock[]
): SuspensionBlockResolution {
  if (resultKind === "content" || resultKind === "dialogue" || resultKind === "presentation") {
    const block = deepestFramePos.index > 0 ? blocks[deepestFramePos.index - 1] : undefined;
    return block ? { ok: true, block } : { ok: false };
  }
  if (resultKind === "choice") {
    const block = blocks[deepestFramePos.index];
    return block?.type === "Choice" ? { ok: true, block } : { ok: false };
  }
  return { ok: true, block: undefined };
}

/**
 * Walks the validated, shape-checked payload structurally against
 * `document`, building the reconstructed `ExecutionCursor` frame by frame
 * and resolving the final `StoryBlock` the suspension's own `resultKind`
 * requires (docs/CORE_SPEC.md Section 33.4, 33.7, 33.10–33.12). Returns
 * `undefined` on any unresolvable structural detail; never throws.
 */
function resolveCursor(
  document: StoryDocument,
  payload: CursorPositionPayload,
  resultKind: CursorPositionResultKind
): { readonly cursor: ExecutionCursor; readonly resolvedBlock: StoryBlock | undefined } | undefined {
  if (payload.frames.length === 0) {
    return resultKind === "error" ? { cursor: INITIAL_CURSOR, resolvedBlock: undefined } : undefined;
  }

  const scene = document.scenes.find((candidate) => candidate.id === payload.sceneId);
  if (!scene) return undefined;

  const frames: CursorFrame[] = [];
  let blocks: readonly StoryBlock[] = scene.blocks;

  for (let depth = 0; depth < payload.frames.length; depth++) {
    const framePos = payload.frames[depth]!;
    const isDeepest = depth === payload.frames.length - 1;

    // A scene frame may only ever be frame 0, and frame 0 must be one.
    if ((framePos.kind === "scene") !== (depth === 0)) return undefined;

    const resolved = resolveOneFrame(framePos, payload.sceneId, blocks, isDeepest, resultKind, payload.frames[depth + 1]);
    if (!resolved.ok) return undefined;

    frames.push(resolved.frame);
    if (resolved.childBlocks) blocks = resolved.childBlocks;
  }

  const deepestFramePos = payload.frames.at(-1)!;
  const resolution = resolveSuspensionBlock(resultKind, deepestFramePos, blocks);
  return resolution.ok ? { cursor: frames, resolvedBlock: resolution.block } : undefined;
}

/**
 * Validates one scene frame's `visitRecorded` flag (docs/CORE_SPEC.md
 * Section 33.4, 33.8): `mustBeRecorded` rejects a `false` flag outright
 * (true for every observable `resultKind` but `error` — see
 * `exposureFlagsAreConsistent`); a `true` flag additionally requires a
 * matching, own-property `visitedScenes` entry.
 */
function sceneExposureIsConsistent(
  frame: Extract<CursorFrame, { readonly kind: "scene" }>,
  runtimeState: RuntimeState,
  mustBeRecorded: boolean
): boolean {
  if (mustBeRecorded && !frame.visitRecorded) return false;
  return !frame.visitRecorded || ownEntry(runtimeState.reader.visitedScenes, frame.sceneId) !== undefined;
}

/**
 * Validates one Variant frame's `seenRecorded` flag, identically to
 * `sceneExposureIsConsistent` above but against `seenVariants` — a `true`
 * flag additionally requires that entry's own `lastSeenBranchId` to equal
 * the frame's active `branchId` (Section 33.4, 33.8).
 */
function variantExposureIsConsistent(
  frame: Extract<CursorFrame, { readonly kind: "variant" }>,
  runtimeState: RuntimeState,
  mustBeRecorded: boolean
): boolean {
  if (mustBeRecorded && !frame.seenRecorded) return false;
  if (!frame.seenRecorded) return true;
  const memory = ownEntry(runtimeState.reader.seenVariants, frame.variantId);
  return memory?.lastSeenBranchId === frame.branchId;
}

/**
 * Validates every open frame's captured `visitRecorded`/`seenRecorded`
 * flag against the given `runtimeState` and `resultKind` (docs/CORE_SPEC.md
 * Section 33.4, 33.8).
 *
 * `advance()` always calls `recordObservableExposure` immediately before
 * committing a `content`/`dialogue`/`presentation`/`choice` suspension, so
 * every currently-open frame's flag is unconditionally `true` by the time
 * any of those four is reached — a live position for one of them can
 * therefore never carry a `false` flag; only `error` legitimately can
 * (Section 33.4). A `false` flag paired with one of the other four kinds
 * describes a suspension no live session could ever have produced, and is
 * rejected here (via `mustBeRecorded`) rather than silently accepted and
 * later double-recorded when a retried `advance()` finds it still
 * unmarked.
 */
function exposureFlagsAreConsistent(
  cursor: ExecutionCursor,
  runtimeState: RuntimeState,
  resultKind: CursorPositionResultKind
): boolean {
  const mustBeRecorded = resultKind !== "error";
  for (const frame of cursor) {
    if (frame.kind === "scene" && !sceneExposureIsConsistent(frame, runtimeState, mustBeRecorded)) return false;
    if (frame.kind === "variant" && !variantExposureIsConsistent(frame, runtimeState, mustBeRecorded)) return false;
  }
  return true;
}

export type FromCursorPositionResult =
  | { readonly ok: true; readonly cursor: ExecutionCursor; readonly resolvedBlock?: StoryBlock }
  | { readonly ok: false; readonly reason: string };

/**
 * Reconstructs a live `ExecutionCursor` — and, where `resultKind` requires
 * one, the resolved `StoryBlock` that produced the suspension — from an
 * opaque position previously returned by `toCursorPosition` (docs/
 * CORE_SPEC.md Section 33.2, 33.4). `position` is untrusted JSON-compatible
 * data, never trusted internal state: every field is validated, and this
 * function never throws for ordinary malformed input, returning `{ ok:
 * false, reason }` instead.
 *
 * Also cross-checks `position`'s own embedded scene id against
 * `runtimeState.navigation.sceneId` internally (Section 33.4): a crafted
 * position naming a different, independently-real scene is rejected here,
 * not left for the caller to separately notice.
 *
 * Does not depend on AST object identity from any particular
 * `StoryDocument` instance — a freshly compiled, structurally-equivalent
 * document works identically (Section 33.5, 33.20).
 *
 * This is Runtime's own narrow validation only: the full `restorePlayer`
 * matrix (document fingerprint, `RuntimeState` shape, Reader Memory
 * finiteness, Choice item-set conformance, etc.) is `@aftertext/player`'s
 * responsibility (Section 33.8) and is not duplicated here.
 */
export function fromCursorPosition(
  document: StoryDocument,
  runtimeState: RuntimeState,
  position: JsonValue,
  resultKind: CursorPositionResultKind
): FromCursorPositionResult {
  const payload = parsePositionPayload(position);
  if (!payload) return { ok: false, reason: "Malformed cursor position payload." };

  if (payload.sceneId !== runtimeState.navigation.sceneId) {
    return { ok: false, reason: "Position's scene id does not match runtimeState.navigation.sceneId." };
  }

  const resolved = resolveCursor(document, payload, resultKind);
  if (!resolved) return { ok: false, reason: "Cursor position does not resolve against the given document." };

  if (!exposureFlagsAreConsistent(resolved.cursor, runtimeState, resultKind)) {
    return { ok: false, reason: "Captured exposure flags are inconsistent with the given runtimeState.reader." };
  }

  return resolved.resolvedBlock !== undefined
    ? { ok: true, cursor: resolved.cursor, resolvedBlock: resolved.resolvedBlock }
    : { ok: true, cursor: resolved.cursor };
}
