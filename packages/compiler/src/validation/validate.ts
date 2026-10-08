import type { SourcePosition, SourceSpan } from "../ast/span.js";
import type { CallExpression, ExpressionNode } from "../ast/expression.js";
import type { SceneNode, StoryBlock, StoryDocument, VariantNode } from "../ast/story.js";
import { Diagnostics } from "../diagnostics/codes.js";
import type { Diagnostic } from "../diagnostics/types.js";

/**
 * Reader Memory query builtins recognized by this compiler (docs/CORE_SPEC.md
 * Section 17.15) — a fixed, non-extensible-by-authors registry. `kind`
 * says which id-space (scene or Variant) the builtin's single string-literal
 * argument must reference.
 */
const READER_MEMORY_BUILTINS: Readonly<Record<string, { readonly kind: "scene" | "variant" }>> = {
  visited: { kind: "scene" },
  visit_count: { kind: "scene" },
  seen_variant: { kind: "variant" },
  last_seen_variant_branch: { kind: "variant" }
};

/** Depth-first walk of every `CallExpression` reachable from `expression`, including nested call arguments. */
function* walkCalls(expression: ExpressionNode): Generator<CallExpression> {
  switch (expression.type) {
    case "Literal":
    case "Identifier":
      return;
    case "Unary":
      yield* walkCalls(expression.argument);
      return;
    case "Binary":
      yield* walkCalls(expression.left);
      yield* walkCalls(expression.right);
      return;
    case "Call":
      yield expression;
      for (const arg of expression.args) yield* walkCalls(arg);
      return;
  }
}

const DOCUMENT_START: SourcePosition = { line: 1, column: 1, offset: 0 };

/**
 * Best available anchor for a diagnostic about `document.entryScene`: the
 * frontmatter block's span when the author wrote an explicit `entry`
 * (there is nothing more specific to point at — see the AT1201/AT1202
 * per-key spans for why a coarser anchor is acceptable here), otherwise a
 * fallback position at the very start of the document.
 */
function entrySceneSpan(document: StoryDocument): SourceSpan {
  if (document.metadata.entry !== undefined && document.metadata.span) {
    return document.metadata.span;
  }
  return { start: DOCUMENT_START, end: DOCUMENT_START };
}

/** Depth-first walk over a block tree, descending into conditional/variant branch bodies. */
function* walkBlocks(blocks: readonly StoryBlock[]): Generator<StoryBlock> {
  for (const block of blocks) {
    yield block;
    if (block.type === "Conditional") {
      for (const branch of block.branches) {
        yield* walkBlocks(branch.blocks);
      }
    } else if (block.type === "Variant") {
      for (const branch of block.branches) {
        yield* walkBlocks(branch.blocks);
      }
    }
  }
}

/**
 * Structural validation over a parsed StoryDocument: duplicate scenes,
 * dangling scene references (from @goto, choice targets, and the
 * normalized entry scene), variant id/branch requirements, and Reader
 * Memory builtin calls (unknown callee, wrong arity, non-literal argument,
 * unknown Scene/Variant reference — docs/CORE_SPEC.md Section 17.16).
 * Directive- and block-shape errors (AT1001, AT1002, AT1201, AT1202,
 * AT2001) are detected earlier, during parsing itself.
 */
/**
 * Validates every `CallExpression` reachable from `expression` — Reader
 * Memory builtin name, arity, argument literal-ness, and Scene/Variant
 * reference existence (docs/CORE_SPEC.md Section 17.16). An unknown
 * callee is diagnosed on its own terms, never conflated with an unknown
 * `StoryState` identifier (that remains a runtime concern, Section 17.8 —
 * `StoryState` is open/dynamic; the builtin namespace is closed and fully
 * known here).
 */
function validateCalls(
  expression: ExpressionNode,
  scenesById: ReadonlyMap<string, SceneNode>,
  variantsById: ReadonlyMap<string, VariantNode>,
  diagnostics: Diagnostic[]
): void {
  for (const call of walkCalls(expression)) {
    const builtin = READER_MEMORY_BUILTINS[call.callee];
    if (!builtin) {
      diagnostics.push(Diagnostics.unknownBuiltin(call.callee, call.span));
      continue;
    }
    if (call.args.length !== 1) {
      diagnostics.push(Diagnostics.wrongBuiltinArity(call.callee, 1, call.args.length, call.span));
      continue;
    }
    const arg = call.args[0] as ExpressionNode;
    if (arg.type !== "Literal" || typeof arg.value !== "string") {
      diagnostics.push(Diagnostics.invalidBuiltinArgument(call.callee, call.span));
      continue;
    }
    if (builtin.kind === "scene") {
      if (!scenesById.has(arg.value)) {
        diagnostics.push(Diagnostics.unknownSceneReference(arg.value, call.span));
      }
    } else {
      if (!variantsById.has(arg.value)) {
        diagnostics.push(Diagnostics.unknownVariantReference(arg.value, call.span));
      }
    }
  }
}

export function validate(document: StoryDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const scenesById = new Map<string, SceneNode>();
  for (const scene of document.scenes) {
    if (scenesById.has(scene.id)) {
      diagnostics.push(Diagnostics.duplicateScene(scene.id, scene.span));
    } else {
      scenesById.set(scene.id, scene);
    }
  }

  if (!scenesById.has(document.entryScene)) {
    diagnostics.push(Diagnostics.unknownSceneReference(document.entryScene, entrySceneSpan(document)));
  }

  // Collected fully, before any reference is checked, so a Reader Memory
  // query (or a future reference kind) may validly refer to a Variant
  // declared later in the document — the same forward-reference guarantee
  // `scenesById` above already provides for @goto/Choice targets.
  const variantsById = new Map<string, VariantNode>();
  for (const scene of document.scenes) {
    for (const block of walkBlocks(scene.blocks)) {
      if (block.type === "Conditional") {
        // "@else" matches unconditionally once Runtime's branch resolution
        // reaches it (mirrors "@otherwise"'s identical semantics below), so
        // any branch authored after it — whether another "@elseif" or a
        // duplicate "@else" — is permanently unreachable. Reports every such
        // branch, not just the first, matching duplicateScene's/
        // variantBranchAfterOtherwise's exhaustive-not-first-only convention.
        let seenElse = false;
        for (const branch of block.branches) {
          if (seenElse) {
            diagnostics.push(Diagnostics.conditionalBranchAfterElse(branch.span));
          }
          if (branch.kind === "else") {
            seenElse = true;
          }
        }
        continue;
      }
      if (block.type !== "Variant") continue;
      if (variantsById.has(block.id)) {
        diagnostics.push(Diagnostics.duplicateVariantId(block.id, block.span));
      } else {
        variantsById.set(block.id, block);
      }
      const hasWhenBranch = block.branches.some((branch) => branch.kind === "when");
      if (!hasWhenBranch) {
        diagnostics.push(Diagnostics.variantWithoutWhenBranch(block.id, block.span));
      }

      // "@otherwise" matches unconditionally the instant Runtime's branch
      // resolution reaches it (see resolveVariant), so any branch authored
      // after it is permanently unreachable — this reports every such
      // branch, not just the first, matching duplicateScene's
      // exhaustive-not-first-only convention above.
      let seenOtherwise = false;
      for (const branch of block.branches) {
        if (seenOtherwise) {
          diagnostics.push(Diagnostics.variantBranchAfterOtherwise(block.id, branch.span));
        }
        if (branch.kind === "otherwise") {
          seenOtherwise = true;
        }
      }
    }
  }

  for (const scene of document.scenes) {
    for (const block of walkBlocks(scene.blocks)) {
      switch (block.type) {
        case "Goto": {
          if (!scenesById.has(block.target)) {
            diagnostics.push(Diagnostics.unknownSceneReference(block.target, block.span));
          }
          break;
        }
        case "Choice": {
          for (const item of block.items) {
            if (!scenesById.has(item.target)) {
              diagnostics.push(Diagnostics.unknownSceneReference(item.target, item.span));
            }
            if (item.condition) validateCalls(item.condition, scenesById, variantsById, diagnostics);
          }
          break;
        }
        case "Set": {
          validateCalls(block.expression, scenesById, variantsById, diagnostics);
          break;
        }
        case "Conditional": {
          for (const branch of block.branches) {
            if (branch.condition) validateCalls(branch.condition, scenesById, variantsById, diagnostics);
          }
          break;
        }
        case "Variant": {
          for (const branch of block.branches) {
            if (branch.condition) validateCalls(branch.condition, scenesById, variantsById, diagnostics);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  return diagnostics;
}
