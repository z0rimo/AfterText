import type { StoryBlock, StoryDocument } from "@aftertext/compiler";
import type { NavigationState, ReaderState, RuntimeState, SceneVisitMemory, StoryState, StoryValue, VariantMemory } from "@aftertext/runtime";
import { isPlainRecord } from "./snapshot-types.js";

/**
 * A one-call-scoped ephemeral index of `document`'s real scene ids and
 * every Variant's real branch ids (docs/CORE_SPEC.md Section 33.8).
 * Built once per `restorePlayer` call, discarded when it returns — this
 * is ordinary local-variable work, not a forbidden module-level mutable
 * cache, identical in kind to any other local built fresh inside one
 * function call.
 */
export interface DocumentIndex {
  readonly sceneIds: ReadonlySet<string>;
  readonly variantBranches: ReadonlyMap<string, ReadonlySet<string>>;
}

function collectVariantBranches(blocks: readonly StoryBlock[], into: Map<string, Set<string>>): void {
  for (const block of blocks) {
    if (block.type === "Variant") {
      into.set(block.id, new Set(block.branches.map((branch) => branch.branchId)));
      for (const branch of block.branches) collectVariantBranches(branch.blocks, into);
    } else if (block.type === "Conditional") {
      for (const branch of block.branches) collectVariantBranches(branch.blocks, into);
    }
  }
}

export function buildDocumentIndex(document: StoryDocument): DocumentIndex {
  const variantBranches = new Map<string, Set<string>>();
  for (const scene of document.scenes) collectVariantBranches(scene.blocks, variantBranches);
  return { sceneIds: new Set(document.scenes.map((scene) => scene.id)), variantBranches };
}

function isPositiveFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

type Validated<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

function ok<T>(value: T): Validated<T> {
  return { ok: true, value };
}

function fail(reason: string): Validated<never> {
  return { ok: false, reason };
}

/** Every value must be exactly `string | boolean | null | <finite number>` (docs/CORE_SPEC.md Section 33.6, 33.8) — `-0` is finite and passes. */
function isFiniteStoryValue(value: unknown): value is StoryValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  return typeof value === "number" && Number.isFinite(value);
}

function validateStoryState(value: unknown): Validated<StoryState> {
  if (!isPlainRecord(value)) return fail("story is not a plain object.");
  const entries: [string, StoryValue][] = [];
  for (const key of Object.keys(value)) {
    const entry = value[key];
    if (!isFiniteStoryValue(entry)) return fail(`story.${key} is not a string/boolean/null/finite number.`);
    entries.push([key, entry]);
  }
  return ok(Object.fromEntries(entries));
}

function validateVisitedScenes(index: DocumentIndex, value: unknown): Validated<Readonly<Record<string, SceneVisitMemory>>> {
  if (!isPlainRecord(value)) return fail("reader.visitedScenes is not a plain object.");
  const entries: [string, SceneVisitMemory][] = [];
  for (const sceneId of Object.keys(value)) {
    if (!index.sceneIds.has(sceneId)) return fail(`visitedScenes has an unknown scene id "${sceneId}".`);
    const entry = value[sceneId];
    if (!isPlainRecord(entry)) return fail(`visitedScenes.${sceneId} is not a plain object.`);
    const visitCount = entry.visitCount;
    if (!isPositiveFiniteInteger(visitCount)) {
      return fail(`visitedScenes.${sceneId}.visitCount is not a positive finite integer.`);
    }
    entries.push([sceneId, { visitCount }]);
  }
  return ok(Object.fromEntries(entries));
}

/**
 * Validates one `seenVariants` entry (docs/CORE_SPEC.md Section 33.8):
 * both branch ids must belong to *this* Variant (never a foreign one),
 * `seenCount` a positive finite integer, and `seenCount === 1` requires
 * `firstSeenBranchId === lastSeenBranchId` — the converse is NOT required
 * (a later count may legitimately return to the same branch).
 */
function validateVariantMemory(branchIds: ReadonlySet<string>, entry: unknown): Validated<VariantMemory> {
  if (!isPlainRecord(entry)) return fail("not a plain object.");
  const { firstSeenBranchId, lastSeenBranchId, seenCount } = entry;
  if (typeof firstSeenBranchId !== "string" || !branchIds.has(firstSeenBranchId)) {
    return fail("firstSeenBranchId does not belong to this Variant.");
  }
  if (typeof lastSeenBranchId !== "string" || !branchIds.has(lastSeenBranchId)) {
    return fail("lastSeenBranchId does not belong to this Variant.");
  }
  if (!isPositiveFiniteInteger(seenCount)) return fail("seenCount is not a positive finite integer.");
  if (seenCount === 1 && firstSeenBranchId !== lastSeenBranchId) {
    return fail("seenCount is 1 but firstSeenBranchId differs from lastSeenBranchId.");
  }
  return ok({ firstSeenBranchId, lastSeenBranchId, seenCount });
}

function validateSeenVariants(index: DocumentIndex, value: unknown): Validated<Readonly<Record<string, VariantMemory>>> {
  if (!isPlainRecord(value)) return fail("reader.seenVariants is not a plain object.");
  const entries: [string, VariantMemory][] = [];
  for (const variantId of Object.keys(value)) {
    const branchIds = index.variantBranches.get(variantId);
    if (!branchIds) return fail(`seenVariants has an unknown Variant id "${variantId}".`);
    const validated = validateVariantMemory(branchIds, value[variantId]);
    if (!validated.ok) return fail(`seenVariants.${variantId}: ${validated.reason}`);
    entries.push([variantId, validated.value]);
  }
  return ok(Object.fromEntries(entries));
}

function validateReaderState(index: DocumentIndex, value: unknown): Validated<ReaderState> {
  if (!isPlainRecord(value)) return fail("reader is not a plain object.");
  const visitedScenes = validateVisitedScenes(index, value.visitedScenes);
  if (!visitedScenes.ok) return visitedScenes;
  const seenVariants = validateSeenVariants(index, value.seenVariants);
  if (!seenVariants.ok) return seenVariants;
  return ok({ visitedScenes: visitedScenes.value, seenVariants: seenVariants.value });
}

/** `navigation.sceneId` must name a real scene regardless of `current.type` (docs/CORE_SPEC.md Section 33.8 step 4 — a universal check, not conditioned on suspension kind). */
function validateNavigationState(index: DocumentIndex, value: unknown): Validated<NavigationState> {
  if (!isPlainRecord(value)) return fail("navigation is not a plain object.");
  const sceneId = value.sceneId;
  if (typeof sceneId !== "string") return fail("navigation is not a valid NavigationState.");
  if (!index.sceneIds.has(sceneId)) return fail(`navigation.sceneId "${sceneId}" does not exist.`);
  return ok({ sceneId });
}

export function validateRuntimeState(index: DocumentIndex, value: unknown): Validated<RuntimeState> {
  if (!isPlainRecord(value)) return fail("runtimeState is not a plain object.");
  const story = validateStoryState(value.story);
  if (!story.ok) return story;
  const reader = validateReaderState(index, value.reader);
  if (!reader.ok) return reader;
  const navigation = validateNavigationState(index, value.navigation);
  if (!navigation.ok) return navigation;
  return ok({ story: story.value, reader: reader.value, navigation: navigation.value });
}

/**
 * Whether `runtimeState` equals exactly what `createPlayer(document)`
 * would itself produce (docs/CORE_SPEC.md Section 33.8) — required for a
 * `"not started"` snapshot. Uses ordinary `===` (not `Object.is`) so
 * `-0`/`0` compare equal, matching every other numeric comparison in this
 * codebase's expression semantics (Section 17.8).
 */
export function isFreshRuntimeState(document: StoryDocument, runtimeState: RuntimeState): boolean {
  if (runtimeState.navigation.sceneId !== document.entryScene) return false;
  if (Object.keys(runtimeState.reader.visitedScenes).length !== 0) return false;
  if (Object.keys(runtimeState.reader.seenVariants).length !== 0) return false;
  return storyEqualsInitialState(runtimeState.story, document.initialState);
}

function storyEqualsInitialState(story: StoryState, initialState: StoryDocument["initialState"]): boolean {
  const storyKeys = Object.keys(story);
  const initialKeys = Object.keys(initialState);
  if (storyKeys.length !== initialKeys.length) return false;
  return initialKeys.every((key) => Object.hasOwn(story, key) && story[key] === initialState[key]);
}

/** A genuine `completed` result always has a `visitedScenes` entry for the current scene (docs/CORE_SPEC.md Section 33.8). */
export function hasVisitedCurrentScene(runtimeState: RuntimeState): boolean {
  return Object.hasOwn(runtimeState.reader.visitedScenes, runtimeState.navigation.sceneId);
}
