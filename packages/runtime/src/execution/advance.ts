import type { ConditionalBranch, ConditionalNode, StoryBlock, StoryDocument } from "@aftertext/compiler";
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

  // Rebuilt at each use (never cached) since `story`/`reader` change as the
  // walk progresses — every expression-evaluating construct must see the
  // current values, per the single shared EvaluationContext (17.17).
  const context = (): EvaluationContext => ({ document, story, reader });

  /**
   * Folds any due scene-visit/Variant-seen recording into `reader` and
   * returns the cursor with those occurrences marked recorded. Call only
   * for a genuinely qualifying result (`content`/`presentation`/`choice`)
   * — never for `navigation`/`completed`/an error.
   */
  const recordObservableExposure = (cursorIn: ExecutionCursor): ExecutionCursor => {
    const pending = collectPendingExposure(cursorIn);
    if (!pending.recordScene && pending.variants.length === 0) return cursorIn;

    if (pending.recordScene) {
      reader = recordSceneVisit(reader, runtimeState.navigation.sceneId);
    }
    for (const variant of pending.variants) {
      reader = recordVariantSeen(reader, variant.variantId, variant.branchId);
    }
    return markExposureRecorded(cursorIn, pending);
  };

  for (;;) {
    const top = frames[frames.length - 1];
    if (!top) {
      return commit(INITIAL_CURSOR, { type: "completed" });
    }

    if (top.index >= top.blocks.length) {
      const sceneOrigin = frames[0]?.origin;
      frames = popFrame(frames);
      if (frames.length === 0) {
        // Qualifying "empty" completed (17.9): the episode's only
        // observable outcome is reaching the end with nothing shown.
        // Variant-seen is deliberately NOT extended here by symmetry —
        // only the scene-visit rule treats completed as qualifying.
        if (sceneOrigin?.kind === "scene" && !sceneOrigin.visitRecorded) {
          reader = recordSceneVisit(reader, runtimeState.navigation.sceneId);
        }
        return commit(INITIAL_CURSOR, { type: "completed" });
      }
      frames = withNextIndex(frames); // no budget charge — bookkeeping, not automatic work
      continue;
    }

    const block = top.blocks[top.index] as StoryBlock;

    switch (block.type) {
      case "Paragraph":
      case "Heading": {
        frames = withNextIndex(frames);
        frames = recordObservableExposure(frames);
        return commit(frames, { type: "content", block });
      }

      case "Presentation": {
        frames = withNextIndex(frames);
        frames = recordObservableExposure(frames);
        return commit(frames, { type: "presentation", command: block.command });
      }

      case "Set": {
        if (budget <= 0) return commit(frames, { type: "error", error: RuntimeErrors.stepLimitExceeded() });
        budget -= 1; // charge: "a @set evaluation"

        const evaluated = evaluateExpression(block.expression, context());
        if (!evaluated.ok) return commit(frames, { type: "error", error: evaluated.error });

        story = { ...story, [block.name]: evaluated.value };
        frames = withNextIndex(frames);
        continue;
      }

      case "Conditional": {
        if (budget <= 0) return commit(frames, { type: "error", error: RuntimeErrors.stepLimitExceeded() });
        budget -= 1; // charge: "a conditional branch selection"

        const selection = selectConditionalBranch(block, context());
        if (selection === undefined) {
          frames = withNextIndex(frames); // no match — no descent, no 2nd charge
        } else if (!selection.ok) {
          return commit(frames, { type: "error", error: selection.error });
        } else {
          if (budget <= 0) return commit(frames, { type: "error", error: RuntimeErrors.stepLimitExceeded() });
          budget -= 1; // charge: "descending into a selected branch's blocks"
          frames = pushFrame(frames, selection.branch.blocks); // no origin — Conditional has no reader-memory concept
        }
        continue;
      }

      case "Variant": {
        if (budget <= 0) return commit(frames, { type: "error", error: RuntimeErrors.stepLimitExceeded() });
        budget -= 1; // charge: "a Variant branch resolution"

        const resolution = resolveVariant(block, context());
        if (!resolution.ok) return commit(frames, { type: "error", error: resolution.error });

        if (resolution.resolved) {
          if (budget <= 0) return commit(frames, { type: "error", error: RuntimeErrors.stepLimitExceeded() });
          budget -= 1; // charge: "descending into a selected branch's blocks"
          frames = pushFrame(frames, resolution.resolved.blocks, {
            kind: "variant",
            variantId: resolution.resolved.variantId,
            branchId: resolution.resolved.branchId,
            seenRecorded: false
          });
        } else {
          frames = withNextIndex(frames); // no match — no descent, no 2nd charge
        }
        continue;
      }

      case "Choice": {
        const filtered = filterChoiceItems(block, context());
        if (!filtered.ok) return commit(frames, { type: "error", error: filtered.error });
        if (filtered.items.length === 0) {
          return commit(frames, { type: "error", error: RuntimeErrors.emptyChoice() });
        }
        // Cursor is intentionally left pointing at this ChoiceNode — resuming
        // past it only ever happens via selectChoice's shared navigateTo,
        // never via a further advance() call.
        frames = recordObservableExposure(frames);
        return commit(frames, { type: "choice", items: filtered.items });
      }

      case "Goto": {
        return navigateTo(document, { ...runtimeState, story, reader }, frames, block.target);
      }
    }
  }
}
