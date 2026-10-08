import type { ReaderState } from "../state/reader-state.js";

/**
 * What the reader remembers of one Variant. Deliberately narrow: the
 * first and last branch seen, plus a count — not full branch history,
 * not timestamps. See `docs/CORE_SPEC.md` (Runtime Principles) for the
 * rationale.
 */
export interface VariantMemory {
  readonly firstSeenBranchId: string;
  readonly lastSeenBranchId: string;
  readonly seenCount: number;
}

/**
 * Records that the reader has now experienced `branchId` of `variantId`,
 * returning a new `ReaderState`. Pure — `reader` is never mutated.
 *
 * This is the "seen" half of the `resolve != seen` boundary: resolving a
 * Variant's current branch (not implemented here) must never call this on
 * its own. Call it only once the content has actually been presented to
 * the reader.
 */
export function recordVariantSeen(reader: ReaderState, variantId: string, branchId: string): ReaderState {
  const previous = reader.seenVariants[variantId];
  const memory: VariantMemory = previous
    ? { firstSeenBranchId: previous.firstSeenBranchId, lastSeenBranchId: branchId, seenCount: previous.seenCount + 1 }
    : { firstSeenBranchId: branchId, lastSeenBranchId: branchId, seenCount: 1 };

  return {
    ...reader,
    seenVariants: { ...reader.seenVariants, [variantId]: memory }
  };
}

/**
 * Whether `currentBranchId` differs from the branch the reader last saw
 * for `variantId`. `false` when the variant has never been seen. A pure
 * query — it never records anything itself (see `recordVariantSeen`).
 */
export function hasVariantChangedSinceRead(
  reader: ReaderState,
  variantId: string,
  currentBranchId: string
): boolean {
  const previous = reader.seenVariants[variantId];
  if (!previous) return false;
  return previous.lastSeenBranchId !== currentBranchId;
}

/**
 * Whether the reader has ever seen `variantId` at least once. Backs the
 * `seen_variant(...)` Reader Memory query (docs/CORE_SPEC.md Section
 * 17.15). A pure query — it never records anything itself.
 */
export function hasSeenVariant(reader: ReaderState, variantId: string): boolean {
  return reader.seenVariants[variantId] !== undefined;
}

/**
 * The branch id the reader most recently saw for `variantId`, or `null`
 * if it has never been seen. Backs the `last_seen_variant_branch(...)`
 * Reader Memory query (docs/CORE_SPEC.md Section 17.15). A pure query —
 * it never records anything itself.
 */
export function getLastSeenVariantBranch(reader: ReaderState, variantId: string): string | null {
  return reader.seenVariants[variantId]?.lastSeenBranchId ?? null;
}
