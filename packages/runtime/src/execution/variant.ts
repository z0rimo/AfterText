import type { StoryBlock, VariantNode } from "@aftertext/compiler";
import { evaluateCondition, type EvaluationContext } from "./expression.js";
import type { RuntimeExecutionError } from "./errors.js";

export interface ResolvedVariant {
  readonly variantId: string;
  readonly branchId: string;
  readonly blocks: readonly StoryBlock[];
}

export type VariantResolution =
  | { readonly ok: true; readonly resolved: ResolvedVariant | undefined }
  | { readonly ok: false; readonly error: RuntimeExecutionError };

/**
 * Pure Variant resolution (docs/CORE_SPEC.md Section 17.7): `@when`
 * conditions evaluated in source order, first match wins, `@otherwise` is
 * the fallback. If nothing matches and there is no `@otherwise`,
 * `resolved` is `undefined` — a graceful "no match," not an error. Never
 * calls `recordVariantSeen` — `resolve != seen` (Decision C / 17.9).
 *
 * Takes the full `EvaluationContext` (Section 17.17), not a bare
 * `StoryState`, because a `@when` condition may now contain a Reader
 * Memory query (Section 17.15). This is an intentional, approved public
 * API evolution — see Section 17.17 for the rejected alternatives (an
 * implicit empty `ReaderState`, overload-shape sniffing, module-global
 * state). `resolveVariant` itself remains pure, deterministic, and
 * first-match-wins; only the information available to its condition
 * evaluator changed.
 */
export function resolveVariant(node: VariantNode, context: EvaluationContext): VariantResolution {
  for (const branch of node.branches) {
    if (branch.kind === "otherwise") {
      return { ok: true, resolved: { variantId: node.id, branchId: branch.branchId, blocks: branch.blocks } };
    }

    if (!branch.condition) continue; // defensive: "when" branches always carry a condition per the compiler grammar

    const condition = evaluateCondition(branch.condition, context);
    if (!condition.ok) return { ok: false, error: condition.error };
    if (condition.value) {
      return { ok: true, resolved: { variantId: node.id, branchId: branch.branchId, blocks: branch.blocks } };
    }
  }
  return { ok: true, resolved: undefined };
}
