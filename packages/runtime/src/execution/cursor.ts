import type { StoryBlock, StoryDocument } from "@aftertext/compiler";

/**
 * One level of structural execution position (docs/CORE_SPEC.md Section
 * 33.4). Exactly three constructs ever push a frame — scene entry,
 * Conditional branch descent, Variant branch descent — and each frame
 * carries only the identity needed to re-descend into the exact same
 * branch, plus its own block index. Deliberately AST-free: no frame may
 * hold a `StoryBlock[]` or any other AST object reference, so a cursor can
 * be derived into an opaque, JSON-serializable position (`cursor-
 * position.ts`) and later re-resolved against a freshly compiled,
 * structurally-equivalent `StoryDocument`.
 *
 * `visitRecorded`/`seenRecorded` are the same Reader-Memory-integration
 * provenance the pre-v0.4 `CursorFrameOrigin` carried (docs/CORE_SPEC.md
 * Section 17.9) — now folded directly into the frame itself since each
 * frame kind unambiguously determines whether it has a reader-memory
 * concept at all (Conditional never does).
 */
export type CursorFrame =
  | { readonly kind: "scene"; readonly sceneId: string; readonly index: number; readonly visitRecorded: boolean }
  | { readonly kind: "conditional"; readonly branchIndex: number; readonly index: number }
  | {
      readonly kind: "variant";
      readonly variantId: string;
      readonly branchId: string;
      readonly index: number;
      readonly seenRecorded: boolean;
    };

/**
 * Ephemeral structural execution position within a scene's block tree
 * (docs/CORE_SPEC.md Section 17.10, 33.4). A stack of frames — the top is
 * the deepest active nested branch. Exists separately from `RuntimeState`,
 * is never persisted directly, and must never be written into
 * `ReaderState`: it is *structural* position (plus, per 17.9, ephemeral
 * recording provenance), not reader-memory identity itself. Treated as
 * opaque by consumers — obtained from and passed back into
 * `advance`/`selectChoice`, never constructed or inspected directly.
 * Persisting across a suspension goes through `toCursorPosition`/
 * `fromCursorPosition` (`cursor-position.ts`), never the cursor itself.
 */
export type ExecutionCursor = readonly CursorFrame[];

/** The cursor meaning "start of the current scene, from its first block." */
export const INITIAL_CURSOR: ExecutionCursor = [];

/** The identity needed to push a new frame — everything except its initial `index`/flags. */
export type NewCursorFrame =
  | { readonly kind: "scene"; readonly sceneId: string }
  | { readonly kind: "conditional"; readonly branchIndex: number }
  | { readonly kind: "variant"; readonly variantId: string; readonly branchId: string };

/** Pushes a new frame — "descending into a selected scene/branch." Always starts at index 0. */
export function pushFrame(cursor: ExecutionCursor, frame: NewCursorFrame): ExecutionCursor {
  switch (frame.kind) {
    case "scene":
      return [...cursor, { kind: "scene", sceneId: frame.sceneId, index: 0, visitRecorded: false }];
    case "conditional":
      return [...cursor, { kind: "conditional", branchIndex: frame.branchIndex, index: 0 }];
    case "variant":
      return [...cursor, { kind: "variant", variantId: frame.variantId, branchId: frame.branchId, index: 0, seenRecorded: false }];
  }
}

/** Pops the deepest frame — resuming the parent after its nested content is exhausted. */
export function popFrame(cursor: ExecutionCursor): ExecutionCursor {
  return cursor.slice(0, -1);
}

/** Returns a cursor with the top frame's index advanced by one, preserving every other field. */
export function withNextIndex(cursor: ExecutionCursor): ExecutionCursor {
  const top = cursor[cursor.length - 1];
  if (!top) return cursor;
  return [...cursor.slice(0, -1), { ...top, index: top.index + 1 }];
}

/**
 * Resolves a scene frame's own block list by its stable `sceneId` — the
 * cursor's structural root. Exported so `advance()` can resolve it exactly
 * once per call and thread the result through `resolveBlocks` below,
 * rather than every per-block loop iteration re-scanning
 * `document.scenes` from scratch for the same, unchanging scene.
 */
export function resolveSceneBlocks(document: StoryDocument, sceneId: string): readonly StoryBlock[] | undefined {
  return document.scenes.find((scene) => scene.id === sceneId)?.blocks;
}

/**
 * Resolves one Conditional/Variant child frame's own block list from its
 * parent's currently-pointed-at block (docs/CORE_SPEC.md Section 33.10): a
 * Conditional child requires that block to be a `ConditionalNode` with an
 * in-range `branchIndex`; a Variant child requires it to be the exact
 * `VariantNode` named by `variantId`, with a `branchId` that resolves
 * within it. Never searches the document for an arbitrary Conditional/
 * Variant elsewhere. A scene frame is never a child — only ever the root.
 */
function resolveChildBlocks(parentBlock: StoryBlock | undefined, frame: CursorFrame): readonly StoryBlock[] | undefined {
  if (frame.kind === "conditional") {
    return parentBlock?.type === "Conditional" ? parentBlock.branches[frame.branchIndex]?.blocks : undefined;
  }
  if (frame.kind === "variant") {
    return parentBlock?.type === "Variant" && parentBlock.id === frame.variantId
      ? parentBlock.branches.find((branch) => branch.branchId === frame.branchId)?.blocks
      : undefined;
  }
  return undefined;
}

/**
 * Resolves the block list the cursor's deepest (top) frame is currently
 * indexing into, given the cursor's own scene root already resolved once
 * by the caller (`sceneBlocks` — see `resolveSceneBlocks`). Walks the
 * stack structurally down from that root (docs/CORE_SPEC.md Section 33.4,
 * 33.10): a child frame is only ever resolved through its parent frame's
 * own currently-pointed-at block, never by searching the document for an
 * arbitrary Conditional/Variant.
 *
 * Returns `undefined` if resolution fails at any level — `sceneBlocks`
 * itself unresolved, a parent block that no longer matches the child
 * frame's expected kind, or a Variant branch id that no longer resolves.
 * This can only happen for a cursor that is malformed or stale against the
 * given document; a cursor obtained from `advance`/`pushFrame` against
 * this same document always resolves. Callers must not treat `undefined`
 * as "exhausted" — only as "cannot determine," and let block dispatch's
 * own default case report the resulting invalid-execution-block error
 * (docs/CORE_SPEC.md Section 17.11), exactly as a malformed index already
 * does.
 */
export function resolveBlocks(sceneBlocks: readonly StoryBlock[] | undefined, cursor: ExecutionCursor): readonly StoryBlock[] | undefined {
  let blocks: readonly StoryBlock[] | undefined = sceneBlocks;
  let parent: CursorFrame | undefined;

  for (const frame of cursor) {
    if (frame.kind !== "scene") {
      const parentBlock = parent && blocks ? blocks[parent.index] : undefined;
      blocks = resolveChildBlocks(parentBlock, frame);
    }
    parent = frame;
  }

  return blocks;
}

/** Immutably flips the scene frame at depth 0 to `visitRecorded: true`. No-op if it isn't a scene frame. */
function withVisitRecorded(cursor: ExecutionCursor): ExecutionCursor {
  const frame = cursor[0];
  if (!frame || frame.kind !== "scene") return cursor;
  return [{ ...frame, visitRecorded: true }, ...cursor.slice(1)];
}

/** Immutably flips the variant frame at `depth` to `seenRecorded: true`. No-op if it isn't a variant frame. */
function withSeenRecorded(cursor: ExecutionCursor, depth: number): ExecutionCursor {
  const frame = cursor[depth];
  if (!frame || frame.kind !== "variant") return cursor;
  const next = cursor.slice();
  next[depth] = { ...frame, seenRecorded: true };
  return next;
}

/**
 * Reader-Memory exposure recording due at the current cursor position: the
 * active scene-entry episode (frame 0), if not yet recorded, plus every
 * active Variant-branch frame not yet recorded, at any depth — including
 * beneath a Conditional frame, so a nested construct inside a selected
 * Variant branch still attributes correctly (docs/CORE_SPEC.md Section
 * 17.9, "Nested Variants"). A pure query — records nothing itself.
 */
export interface PendingExposure {
  readonly recordScene: boolean;
  readonly variants: readonly { readonly depth: number; readonly variantId: string; readonly branchId: string }[];
}

export function collectPendingExposure(cursor: ExecutionCursor): PendingExposure {
  const sceneFrame = cursor[0];
  const recordScene = sceneFrame?.kind === "scene" && !sceneFrame.visitRecorded;

  const variants: { depth: number; variantId: string; branchId: string }[] = [];
  for (let depth = 0; depth < cursor.length; depth++) {
    const frame = cursor[depth];
    if (frame?.kind === "variant" && !frame.seenRecorded) {
      variants.push({ depth, variantId: frame.variantId, branchId: frame.branchId });
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
    next = withVisitRecorded(next);
  }
  for (const variant of pending.variants) {
    next = withSeenRecorded(next, variant.depth);
  }
  return next;
}
