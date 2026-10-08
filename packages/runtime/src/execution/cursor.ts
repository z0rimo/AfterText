import type { StoryBlock } from "@aftertext/compiler";

/**
 * Reader-Memory-integration provenance for one frame (docs/CORE_SPEC.md
 * Section 17.9). Purely runtime-internal bookkeeping — never a `ReaderState`
 * value itself, only whether/what to record:
 *
 * - `scene`: tags the outermost frame of one scene-entry episode. Set once,
 *   when the episode begins; `visitRecorded` flips to `true` the first time
 *   that episode produces a qualifying result.
 * - `variant`: tags a frame pushed by resolving a Variant to a branch. One
 *   tag per resolution occurrence; `seenRecorded` flips to `true` the first
 *   time that occurrence produces a qualifying result from inside it.
 *
 * A frame pushed for any other reason (a matched `ConditionalNode` branch)
 * carries no `origin` — Conditional has no reader-memory concept.
 */
export type CursorFrameOrigin =
  | { readonly kind: "scene"; readonly visitRecorded: boolean }
  | { readonly kind: "variant"; readonly variantId: string; readonly branchId: string; readonly seenRecorded: boolean };

/**
 * One level of nested block-tree position: which block list is being
 * walked, and the index of the next block to process within it. Not
 * exported from the package's public barrel — internal to `execution/`.
 */
export interface CursorFrame {
  readonly blocks: readonly StoryBlock[];
  readonly index: number;
  readonly origin?: CursorFrameOrigin;
}

/**
 * Ephemeral structural execution position within a scene's block tree
 * (docs/CORE_SPEC.md Section 17.10). A stack of frames — the top is the
 * deepest active nested branch. Exists separately from `RuntimeState`, is
 * never persisted, and must never be written into `ReaderState`: it is
 * *structural* position (plus, per 17.9, ephemeral recording provenance),
 * not reader-memory identity itself. Treated as opaque by consumers —
 * obtained from and passed back into `advance`/`selectChoice`, never
 * constructed or inspected directly.
 */
export type ExecutionCursor = readonly CursorFrame[];

/** The cursor meaning "start of the current scene, from its first block." */
export const INITIAL_CURSOR: ExecutionCursor = [];

/** Pushes a new frame — "descending into a selected branch's blocks." */
export function pushFrame(
  cursor: ExecutionCursor,
  blocks: readonly StoryBlock[],
  origin?: CursorFrameOrigin
): ExecutionCursor {
  return [...cursor, { blocks, index: 0, origin }];
}

/** Pops the deepest frame — resuming the parent after its nested content is exhausted. */
export function popFrame(cursor: ExecutionCursor): ExecutionCursor {
  return cursor.slice(0, -1);
}

/** Returns a cursor with the top frame's index advanced by one, preserving its origin. */
export function withNextIndex(cursor: ExecutionCursor): ExecutionCursor {
  const top = cursor[cursor.length - 1];
  if (!top) return cursor;
  return [...cursor.slice(0, -1), { blocks: top.blocks, index: top.index + 1, origin: top.origin }];
}

/** Immutably replaces the origin metadata of the frame at `depth`. */
function withFrameOrigin(cursor: ExecutionCursor, depth: number, origin: CursorFrameOrigin): ExecutionCursor {
  const frame = cursor[depth];
  if (!frame) return cursor;
  const next = cursor.slice();
  next[depth] = { blocks: frame.blocks, index: frame.index, origin };
  return next;
}

/**
 * Reader-Memory exposure recording due at the current cursor position: the
 * active scene-entry episode (frame 0), if not yet recorded, plus every
 * active Variant-branch frame not yet recorded, at any depth — including
 * beneath an untagged (Conditional) frame, so a nested construct inside a
 * selected Variant branch still attributes correctly (docs/CORE_SPEC.md
 * Section 17.9, "Nested Variants"). A pure query — records nothing itself.
 */
export interface PendingExposure {
  readonly recordScene: boolean;
  readonly variants: readonly { readonly depth: number; readonly variantId: string; readonly branchId: string }[];
}

export function collectPendingExposure(cursor: ExecutionCursor): PendingExposure {
  const sceneOrigin = cursor[0]?.origin;
  const recordScene = sceneOrigin?.kind === "scene" && !sceneOrigin.visitRecorded;

  const variants: { depth: number; variantId: string; branchId: string }[] = [];
  for (let depth = 0; depth < cursor.length; depth++) {
    const origin = cursor[depth]?.origin;
    if (origin?.kind === "variant" && !origin.seenRecorded) {
      variants.push({ depth, variantId: origin.variantId, branchId: origin.branchId });
    }
  }
  return { recordScene, variants };
}

/**
 * Marks the given `PendingExposure` as recorded on the cursor, immutably.
 * Called only after the corresponding `recordSceneVisit`/`recordVariantSeen`
 * calls have actually been folded into `ReaderState` — see `advance.ts`.
 */
export function markExposureRecorded(cursor: ExecutionCursor, pending: PendingExposure): ExecutionCursor {
  let next = cursor;
  if (pending.recordScene) {
    next = withFrameOrigin(next, 0, { kind: "scene", visitRecorded: true });
  }
  for (const variant of pending.variants) {
    next = withFrameOrigin(next, variant.depth, {
      kind: "variant",
      variantId: variant.variantId,
      branchId: variant.branchId,
      seenRecorded: true
    });
  }
  return next;
}
