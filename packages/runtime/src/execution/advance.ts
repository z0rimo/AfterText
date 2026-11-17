import type { ConditionalBranch, ConditionalNode, StoryBlock, StoryDocument, VariantNode } from "@aftertext/compiler";
import type { RuntimeState } from "../state/runtime-state.js";
import type { StoryState } from "../state/story-state.js";
import type { ReaderState } from "../state/reader-state.js";
import { recordSceneVisit } from "../reader/scene-memory.js";
import { recordVariantSeen } from "../reader/variant-memory.js";
import {
  INITIAL_CURSOR,
  collectPendingExposure,
  markExposureRecorded,
  popFrame,
  pushFrame,
  withNextIndex,
  type ExecutionCursor
} from "./cursor.js";
import { filterChoiceItems } from "./choice.js";
import { evaluateCondition, evaluateExpression, type EvaluationContext } from "./expression.js";
import { RuntimeErrors } from "./errors.js";
import type { RuntimeExecutionError } from "./errors.js";
import { navigateTo } from "./navigate.js";
import { resolveVariant } from "./variant.js";
import type { ExecutionResult, ExecutionStep } from "./result.js";

export interface AdvanceOptions {
  /**
   * Overrides the internal step-budget default — intended for tests that
   * need to deterministically exercise step-limit exhaustion without
   * constructing a pathologically large scene. Not a specification-level
   * constant (docs/CORE_SPEC.md Section 17.12 deliberately commits to
   * no numeric default).
   */
  readonly stepBudget?: number;
}

const DEFAULT_STEP_BUDGET = 10_000;

type ConditionalSelection =
  | { readonly ok: true; readonly branch: ConditionalBranch }
  | { readonly ok: false; readonly error: RuntimeExecutionError };

/** Not exported — Conditional has no named public resolution operation, unlike Variant's `resolveVariant`. */
function selectConditionalBranch(node: ConditionalNode, context: EvaluationContext): ConditionalSelection | undefined {
  for (const branch of node.branches) {
    if (branch.kind === "else") {
      return { ok: true, branch };
    }
    if (!branch.condition) continue; // defensive: if/elseif always carry a condition per the compiler grammar

    const condition = evaluateCondition(branch.condition, context);
    if (!condition.ok) return { ok: false, error: condition.error };
    if (condition.value) return { ok: true, branch };
  }
  return undefined; // no branch matched — not an error
}

function describeBlock(block: unknown): string {
  if (typeof block !== "object" || block === null) return "a missing or non-object block";
  const type = (block as { readonly type?: unknown }).type;
  return typeof type === "string" ? `block of unknown type "${type}"` : "a block without a string type";
}

/**
 * Charges one step against `budget`, Section 17.12's single, reusable
 * "automatic work costs one charge" primitive — used identically by every
 * chargeable operation (`@set`, a Conditional selection/descent, a Variant
 * resolution/descent). Returns the decremented budget, or `undefined` if
 * the budget was already exhausted (in which case no charge is taken).
 */
function chargeStep(budget: number): number | undefined {
  return budget > 0 ? budget - 1 : undefined;
}

type AutomaticOutcome =
  | { readonly kind: "error"; readonly error: RuntimeExecutionError }
  | { readonly kind: "continue"; readonly frames: ExecutionCursor; readonly budget: number };

/**
 * Handles one `Conditional` block exactly as `advance()` always has:
 * charge a selection step, select a branch (or none), and — only for a
 * matched branch — charge a second step and descend into it. On any
 * exhaustion or selection error, `frames` is reported unchanged by the
 * caller (this function never mutates/returns a frames value in that
 * case) — the Conditional itself remains unexecuted, exactly as Section
 * 17.11's progressive-execution model requires.
 */
function handleConditional(
  block: ConditionalNode,
  frames: ExecutionCursor,
  budget: number,
  context: EvaluationContext
): AutomaticOutcome {
  const selectionCharge = chargeStep(budget);
  if (selectionCharge === undefined) return { kind: "error", error: RuntimeErrors.stepLimitExceeded() };
  budget = selectionCharge;

  const selection = selectConditionalBranch(block, context);
  if (selection === undefined) {
    return { kind: "continue", frames: withNextIndex(frames), budget }; // no match — no descent, no 2nd charge
  }
  if (!selection.ok) {
    return { kind: "error", error: selection.error };
  }

  const descentCharge = chargeStep(budget);
  if (descentCharge === undefined) return { kind: "error", error: RuntimeErrors.stepLimitExceeded() };
  budget = descentCharge;

  // no origin — Conditional has no reader-memory concept
  return { kind: "continue", frames: pushFrame(frames, selection.branch.blocks), budget };
}

/**
 * Handles one `Variant` block exactly as `advance()` always has: charge a
 * resolution step, resolve a branch (or none), and — only for a resolved
 * branch — charge a second step, descend into it, and tag the new frame
 * with the Reader-Memory `variantId`/`branchId` provenance `advance()`'s
 * own `recordObservableExposure` later reads (Section 17.9). Not merged
 * with `handleConditional`: the two constructs are not semantically
 * identical (Variant alone carries Reader-Memory provenance), and forcing
 * them through one generic "branch handler" would hide that difference.
 */
function handleVariant(
  block: VariantNode,
  frames: ExecutionCursor,
  budget: number,
  context: EvaluationContext
): AutomaticOutcome {
  const resolutionCharge = chargeStep(budget);
  if (resolutionCharge === undefined) return { kind: "error", error: RuntimeErrors.stepLimitExceeded() };
  budget = resolutionCharge;

  const resolution = resolveVariant(block, context);
  if (!resolution.ok) {
    return { kind: "error", error: resolution.error };
  }
  if (!resolution.resolved) {
    return { kind: "continue", frames: withNextIndex(frames), budget }; // no match — no descent, no 2nd charge
  }

  const descentCharge = chargeStep(budget);
  if (descentCharge === undefined) return { kind: "error", error: RuntimeErrors.stepLimitExceeded() };
  budget = descentCharge;

  return {
    kind: "continue",
    frames: pushFrame(frames, resolution.resolved.blocks, {
      kind: "variant",
      variantId: resolution.resolved.variantId,
      branchId: resolution.resolved.branchId,
      seenRecorded: false
    }),
    budget
  };
}

type FrameSearchOutcome =
  | { readonly kind: "completed"; readonly reader: ReaderState }
  | { readonly kind: "active"; readonly frames: ExecutionCursor };

/**
 * Pops every currently-exhausted frame (cascading through as many levels
 * as are exhausted at once), exactly as `advance()`'s own loop head always
 * has, until either an active block is found (`"active"`) or the cursor
 * empties out entirely (`"completed"`). Folds the one exposure side
 * effect this search can trigger — the qualifying-empty-scene scene-visit
 * recording (Section 17.9) — into the returned `reader` rather than a
 * closure, so this function's only effect is its return value.
 */
function popExhaustedFrames(frames: ExecutionCursor, reader: ReaderState, sceneId: string): FrameSearchOutcome {
  let current = frames;
  for (;;) {
    const top = current.at(-1);
    if (!top) {
      return { kind: "completed", reader };
    }
    // Written as the literal negation of the original "exhausted" check
    // (`!(index >= length)`, not `index < length`) because they are not
    // equivalent for a malformed, non-numeric `index` (e.g. NaN or a
    // string) — both `>=` and `<` are `false` for a NaN-involving
    // comparison, so only the literal negation reproduces the original
    // "treat anything that isn't affirmatively exhausted as active, and
    // let block dispatch's own `default` case catch the malformed index"
    // behavior (Section 17.11) exactly.
    if (!(top.index >= top.blocks.length)) { // NOSONAR(typescript:S1940) — `<` is not equivalent here; see comment above
      return { kind: "active", frames: current };
    }

    // Qualifying "empty" completed (17.9): the episode's only observable
    // outcome is reaching the end with nothing shown. Variant-seen is
    // deliberately NOT extended here by symmetry — only the scene-visit
    // rule treats completed as qualifying.
    const sceneOrigin = current[0]?.origin;
    current = popFrame(current);
    if (current.length === 0) {
      if (sceneOrigin?.kind === "scene" && !sceneOrigin.visitRecorded) {
        reader = recordSceneVisit(reader, sceneId);
      }
      return { kind: "completed", reader };
    }
    current = withNextIndex(current); // no budget charge — bookkeeping, not automatic work
  }
}

/**
 * Folds any due scene-visit/Variant-seen recording into `reader` and
 * returns the cursor with those occurrences marked recorded, plus the
 * (possibly unchanged) `reader`. Call only for a genuinely qualifying
 * result (`content`/`presentation`/`choice`) — never for
 * `navigation`/`completed`/an error. Takes `reader` explicitly (rather
 * than closing over it) so it can be shared by every call site in
 * `executeCurrentBlock` below without reintroducing a loop-scoped closure.
 */
function recordObservableExposure(
  cursorIn: ExecutionCursor,
  reader: ReaderState,
  sceneId: string
): { readonly cursor: ExecutionCursor; readonly reader: ReaderState } {
  const pending = collectPendingExposure(cursorIn);
  if (!pending.recordScene && pending.variants.length === 0) return { cursor: cursorIn, reader };

  if (pending.recordScene) {
    reader = recordSceneVisit(reader, sceneId);
  }
  for (const variant of pending.variants) {
    reader = recordVariantSeen(reader, variant.variantId, variant.branchId);
  }
  return { cursor: markExposureRecorded(cursorIn, pending), reader };
}

type BlockOutcome =
  | { readonly kind: "continue"; readonly frames: ExecutionCursor; readonly budget: number; readonly story: StoryState }
  | {
      readonly kind: "result";
      readonly frames: ExecutionCursor;
      readonly story: StoryState;
      readonly reader: ReaderState;
      readonly result: ExecutionResult;
    }
  | { readonly kind: "navigate"; readonly step: ExecutionStep };

/**
 * Executes exactly the one block the cursor currently points at — the
 * per-block-type dispatch `advance()`'s loop always has, pulled out into
 * its own responsibility (what happens when we execute *this* block) so
 * it is no longer taxed by the surrounding loop's nesting (Section
 * 17.5–17.7 enumerates the same cases this switch always has). Returns
 * `"continue"` for automatic, non-suspending work (`@set`, a matched or
 * unmatched Conditional/Variant selection) that the caller should loop
 * on; `"result"` for anything committed via the caller's `commit()`
 * (content/presentation/dialogue/choice, or an error — frames/story/
 * reader are the exact values to commit, unchanged from the parameters
 * on every error path, exactly as the inline switch always returned
 * them); `"navigate"` for `Goto`, which already produces a complete,
 * self-contained `ExecutionStep` via the shared `navigateTo`.
 */
function executeCurrentBlock(
  block: StoryBlock | undefined,
  frames: ExecutionCursor,
  budget: number,
  context: EvaluationContext,
  runtimeState: RuntimeState
): BlockOutcome {
  const { document, story, reader } = context;

  switch (block?.type) {
    case "Paragraph":
    case "Heading": {
      const exposed = recordObservableExposure(withNextIndex(frames), reader, runtimeState.navigation.sceneId);
      return { kind: "result", frames: exposed.cursor, story, reader: exposed.reader, result: { type: "content", block } };
    }

    case "Presentation": {
      const exposed = recordObservableExposure(withNextIndex(frames), reader, runtimeState.navigation.sceneId);
      return {
        kind: "result",
        frames: exposed.cursor,
        story,
        reader: exposed.reader,
        result: { type: "presentation", command: block.command }
      };
    }

    case "Dialogue": {
      const exposed = recordObservableExposure(withNextIndex(frames), reader, runtimeState.navigation.sceneId);
      return {
        kind: "result",
        frames: exposed.cursor,
        story,
        reader: exposed.reader,
        result: { type: "dialogue", speaker: block.speaker, content: block.content }
      };
    }

    case "Set": {
      const charged = chargeStep(budget);
      if (charged === undefined) {
        return { kind: "result", frames, story, reader, result: { type: "error", error: RuntimeErrors.stepLimitExceeded() } };
      }

      const evaluated = evaluateExpression(block.expression, context);
      if (!evaluated.ok) return { kind: "result", frames, story, reader, result: { type: "error", error: evaluated.error } };

      return {
        kind: "continue",
        frames: withNextIndex(frames),
        budget: charged, // charge: "a @set evaluation"
        story: { ...story, [block.name]: evaluated.value }
      };
    }

    case "Conditional": {
      const outcome = handleConditional(block, frames, budget, context);
      if (outcome.kind === "error") {
        return { kind: "result", frames, story, reader, result: { type: "error", error: outcome.error } };
      }
      return { kind: "continue", frames: outcome.frames, budget: outcome.budget, story };
    }

    case "Variant": {
      const outcome = handleVariant(block, frames, budget, context);
      if (outcome.kind === "error") {
        return { kind: "result", frames, story, reader, result: { type: "error", error: outcome.error } };
      }
      return { kind: "continue", frames: outcome.frames, budget: outcome.budget, story };
    }

    case "Choice": {
      const filtered = filterChoiceItems(block, context);
      if (!filtered.ok) return { kind: "result", frames, story, reader, result: { type: "error", error: filtered.error } };
      if (filtered.items.length === 0) {
        return { kind: "result", frames, story, reader, result: { type: "error", error: RuntimeErrors.emptyChoice(block.span) } };
      }
      // Cursor is intentionally left pointing at this ChoiceNode — resuming
      // past it only ever happens via selectChoice's shared navigateTo,
      // never via a further advance() call.
      const exposed = recordObservableExposure(frames, reader, runtimeState.navigation.sceneId);
      return { kind: "result", frames: exposed.cursor, story, reader: exposed.reader, result: { type: "choice", items: filtered.items } };
    }

    case "Goto": {
      return { kind: "navigate", step: navigateTo(document, { ...runtimeState, story, reader }, frames, block.target, block.targetSourceSpan) };
    }

    default: {
      // Invariant violation (17.11): a block the interpreter cannot execute
      // (a type from another compiler version, or a malformed cursor index
      // that no longer points at a block). Stop here — cursor and state are
      // returned as they stand — rather than loop without progress (17.12).
      return {
        kind: "result",
        frames,
        story,
        reader,
        result: { type: "error", error: RuntimeErrors.invalidExecutionBlock(describeBlock(block)) }
      };
    }
  }
}

/**
 * Walks a compiled `StoryDocument`'s blocks, automatically executing
 * non-suspending work (`@set`, Conditional/Variant branch selection) until
 * it reaches content, presentation, a choice, a navigation, `completed`,
 * or a runtime error (docs/CORE_SPEC.md Sections 17.5–17.7).
 *
 * Pure: never mutates `runtimeState`/`cursor`. Progressive, not
 * transactional (17.11): automatic operations completed earlier in this
 * call remain reflected in the returned state even if a later operation
 * in the same call fails; only the failing operation itself has no effect.
 *
 * Also integrates Reader Memory recording (17.9): `recordSceneVisit` and
 * `recordVariantSeen` are called here, at the exact points a qualifying
 * `content`/`presentation`/`choice`/`completed` result is committed —
 * never for `navigation`, a runtime error, or automatic work alone. See
 * `cursor.ts`'s `CursorFrameOrigin`/`collectPendingExposure` for how this
 * survives across separate `advance()` calls (errors, step-budget
 * exhaustion) without a purely function-local computation.
 *
 * `cursor` defaults to the start of `runtimeState.navigation.sceneId`.
 */
export function advance(
  document: StoryDocument,
  runtimeState: RuntimeState,
  cursor: ExecutionCursor = INITIAL_CURSOR,
  options?: AdvanceOptions
): ExecutionStep {
  let frames = cursor;
  let story: StoryState = runtimeState.story;
  let reader: ReaderState = runtimeState.reader;
  let budget = options?.stepBudget ?? DEFAULT_STEP_BUDGET;

  if (frames.length === 0) {
    const scene = document.scenes.find((s) => s.id === runtimeState.navigation.sceneId);
    if (!scene) {
      return {
        runtimeState,
        cursor: INITIAL_CURSOR,
        result: { type: "error", error: RuntimeErrors.invalidSceneTarget(runtimeState.navigation.sceneId) }
      };
    }
    frames = pushFrame(INITIAL_CURSOR, scene.blocks, { kind: "scene", visitRecorded: false });
  }

  const commit = (cursorOut: ExecutionCursor, result: ExecutionResult): ExecutionStep => ({
    runtimeState: { ...runtimeState, story, reader },
    cursor: cursorOut,
    result
  });

  for (;;) {
    const popped = popExhaustedFrames(frames, reader, runtimeState.navigation.sceneId);
    if (popped.kind === "completed") {
      reader = popped.reader;
      return commit(INITIAL_CURSOR, { type: "completed" });
    }
    frames = popped.frames;

    const top = frames.at(-1);
    const block = top ? (top.blocks[top.index] as StoryBlock | undefined) : undefined;

    // Rebuilt every iteration (never cached) since `story`/`reader` change
    // as the walk progresses — every expression-evaluating construct must
    // see the current values, per the single shared EvaluationContext (17.17).
    const outcome = executeCurrentBlock(block, frames, budget, { document, story, reader }, runtimeState);
    switch (outcome.kind) {
      case "continue":
        frames = outcome.frames;
        budget = outcome.budget;
        story = outcome.story;
        continue;
      case "result":
        story = outcome.story;
        reader = outcome.reader;
        return commit(outcome.frames, outcome.result);
      case "navigate":
        return outcome.step;
    }
  }
}
