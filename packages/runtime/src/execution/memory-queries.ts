import type { CallExpression, StoryBlock, StoryDocument } from "@aftertext/compiler";
import type { ReaderState } from "../state/reader-state.js";
import type { StoryValue } from "../state/story-state.js";
import { hasVisitedScene, getSceneVisitCount } from "../reader/scene-memory.js";
import { hasSeenVariant, getLastSeenVariantBranch } from "../reader/variant-memory.js";
import { RuntimeErrors } from "./errors.js";
import type { RuntimeExecutionError } from "./errors.js";

export type MemoryQueryOutcome =
  | { readonly ok: true; readonly value: StoryValue }
  | { readonly ok: false; readonly error: RuntimeExecutionError };

/**
 * The fixed Reader Memory query builtin registry (docs/CORE_SPEC.md
 * Section 17.15) — exactly four entries, not author-extensible. This is
 * implementation code, not a dynamic function-lookup mechanism: adding a
 * builtin means adding an entry here, never resolving a JS function by an
 * author-supplied name.
 */
const MEMORY_QUERIES: Readonly<Record<string, { readonly kind: "scene" | "variant"; readonly read: (reader: ReaderState, id: string) => StoryValue }>> = {
  visited: { kind: "scene", read: (reader, id) => hasVisitedScene(reader, id) },
  visit_count: { kind: "scene", read: (reader, id) => getSceneVisitCount(reader, id) },
  seen_variant: { kind: "variant", read: (reader, id) => hasSeenVariant(reader, id) },
  last_seen_variant_branch: { kind: "variant", read: (reader, id) => getLastSeenVariantBranch(reader, id) }
};

function sceneExists(document: StoryDocument, sceneId: string): boolean {
  return document.scenes.some((scene) => scene.id === sceneId);
}

/** Depth-first search for a Variant with id `variantId`, descending into Conditional/Variant branch bodies. */
function containsVariant(blocks: readonly StoryBlock[], variantId: string): boolean {
  for (const block of blocks) {
    if (block.type === "Variant") {
      if (block.id === variantId) return true;
      for (const branch of block.branches) {
        if (containsVariant(branch.blocks, variantId)) return true;
      }
    } else if (block.type === "Conditional") {
      for (const branch of block.branches) {
        if (containsVariant(branch.blocks, variantId)) return true;
      }
    }
  }
  return false;
}

/**
 * Whether `variantId` is declared anywhere in `document`. `StoryDocument`
 * has no direct Variant index, so this is the smallest deterministic
 * substitute: a bounded recursive scan, used only on the defensive
 * fallback path for a best-effort/malformed document (the compiler's own
 * validation, Section 17.16, is the normal path and already rejects an
 * unknown Variant reference before this would ever run).
 */
function variantExists(document: StoryDocument, variantId: string): boolean {
  return document.scenes.some((scene) => containsVariant(scene.blocks, variantId));
}

/**
 * Evaluates a Reader Memory builtin call (docs/CORE_SPEC.md Sections
 * 17.14–17.16). Defensive: the compiler is expected to have already
 * rejected an unknown callee, wrong arity, a non-literal argument, or an
 * unknown Scene/Variant reference — this still re-checks each, exactly as
 * `navigateTo` defensively re-checks a Goto/Choice target (17.11).
 */
export function evaluateMemoryQuery(
  call: CallExpression,
  document: StoryDocument,
  reader: ReaderState
): MemoryQueryOutcome {
  const query = MEMORY_QUERIES[call.callee];
  if (!query) {
    return { ok: false, error: RuntimeErrors.unknownBuiltin(call.callee, call.span) };
  }

  const arg = call.args[0];
  if (call.args.length !== 1 || !arg || arg.type !== "Literal" || typeof arg.value !== "string") {
    return {
      ok: false,
      error: RuntimeErrors.typeMismatch(`"${call.callee}" requires exactly one string-literal argument.`, call.span)
    };
  }

  const id = arg.value;
  if (query.kind === "scene") {
    if (!sceneExists(document, id)) {
      return { ok: false, error: RuntimeErrors.invalidSceneTarget(id, call.span) };
    }
  } else {
    if (!variantExists(document, id)) {
      return { ok: false, error: RuntimeErrors.invalidVariantReference(id, call.span) };
    }
  }

  return { ok: true, value: query.read(reader, id) };
}
