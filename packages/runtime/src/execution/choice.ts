import type { ChoiceNode, StoryDocument } from "@aftertext/compiler";
import { evaluateCondition, type EvaluationContext } from "./expression.js";
import { RuntimeErrors } from "./errors.js";
import type { RuntimeExecutionError } from "./errors.js";
import { navigateTo } from "./navigate.js";
import type { AvailableChoiceItem, ExecutionStep } from "./result.js";

export type ChoiceFilterOutcome =
  | { readonly ok: true; readonly items: readonly AvailableChoiceItem[] }
  | { readonly ok: false; readonly error: RuntimeExecutionError };

/**
 * Evaluates a `ChoiceNode`'s item conditions exactly once, producing the
 * precise item set `advance()` will expose as the Choice suspension.
 * Internal to `execution/` — used by `advance.ts`. Takes the full
 * `EvaluationContext` (Section 17.17) since an item's condition may now
 * contain a Reader Memory query; this is an internal-only signature
 * widening, not a public API change (unlike `resolveVariant`).
 */
export function filterChoiceItems(node: ChoiceNode, context: EvaluationContext): ChoiceFilterOutcome {
  const items: AvailableChoiceItem[] = [];
  for (const item of node.items) {
    if (item.condition) {
      const condition = evaluateCondition(item.condition, context);
      if (!condition.ok) return { ok: false, error: condition.error };
      if (!condition.value) continue;
    }
    items.push({ index: items.length, text: item.text, target: item.target });
  }
  return { ok: true, items };
}

/**
 * Resolves an explicit Choice selection against the *exact* suspension
 * `advance()` returned — never by re-locating the source `ChoiceNode` or
 * re-evaluating its conditions (docs/CORE_SPEC.md Section 17.7). The
 * runtime core has no global "current suspension"; an older but internally
 * valid suspension may be replayed/forked from — that is not itself an
 * error here (17.7's replay clarification).
 */
export function selectChoice(document: StoryDocument, suspension: ExecutionStep, index: number): ExecutionStep {
  if (suspension.result.type !== "choice") {
    return {
      runtimeState: suspension.runtimeState,
      cursor: suspension.cursor,
      result: {
        type: "error",
        error: RuntimeErrors.invalidChoiceSelection("Not currently suspended on a choice.")
      }
    };
  }

  const item = suspension.result.items[index];
  if (!item) {
    return {
      runtimeState: suspension.runtimeState,
      cursor: suspension.cursor,
      result: {
        type: "error",
        error: RuntimeErrors.invalidChoiceSelection(
          `Selection index ${index} is not part of the offered choice.`
        )
      }
    };
  }

  return navigateTo(document, suspension.runtimeState, suspension.cursor, item.target);
}
