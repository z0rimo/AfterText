import { describe, expect, it } from "vitest";
import { compile } from "@aftertext/compiler";
import type { SceneNode, StoryBlock, StoryDocument } from "@aftertext/compiler";
import { evaluateExpression, type EvaluationContext } from "../src/execution/expression.js";
import type { ReaderState, StoryState } from "../src/index.js";
import { compileDoc } from "./helpers.js";

/**
 * Reader Memory query builtins (docs/CORE_SPEC.md Sections 17.14–17.17),
 * tested at the evaluator level — including the defensive runtime path for
 * a best-effort document that bypassed compiler validation (Section 17.16).
 */

/** Extracts the parsed expression from a document's first Set block. */
function firstSetExpression(document: StoryDocument) {
  const block = document.scenes
    .flatMap((s: SceneNode) => s.blocks)
    .find((b: StoryBlock) => b.type === "Set");
  if (!block || block.type !== "Set") throw new Error("expected a Set block");
  return block.expression;
}

function ctx(document: StoryDocument, story: StoryState = {}, reader: ReaderState = { visitedScenes: {}, seenVariants: {} }): EvaluationContext {
  return { document, story, reader };
}

describe("Reader Memory query builtins — valid Scene queries", () => {
  it("visited: true when the scene has been visited", () => {
    const document = compileDoc('@scene s\n@set x = visited("s")\n');
    const reader: ReaderState = { visitedScenes: { s: { visitCount: 1 } }, seenVariants: {} };
    expect(evaluateExpression(firstSetExpression(document), ctx(document, {}, reader))).toEqual({
      ok: true,
      value: true
    });
  });

  it("visited: false when the scene is valid but never visited", () => {
    const document = compileDoc('@scene s\n@set x = visited("s")\n');
    expect(evaluateExpression(firstSetExpression(document), ctx(document))).toEqual({ ok: true, value: false });
  });

  it("visit_count: returns the recorded count", () => {
    const document = compileDoc('@scene s\n@set x = visit_count("s")\n');
    const reader: ReaderState = { visitedScenes: { s: { visitCount: 3 } }, seenVariants: {} };
    expect(evaluateExpression(firstSetExpression(document), ctx(document, {}, reader))).toEqual({
      ok: true,
      value: 3
    });
  });

  it("visit_count: 0 when the scene is valid but never visited", () => {
    const document = compileDoc('@scene s\n@set x = visit_count("s")\n');
    expect(evaluateExpression(firstSetExpression(document), ctx(document))).toEqual({ ok: true, value: 0 });
  });
});

describe("Reader Memory query builtins — valid Variant queries", () => {
  const VARIANT_DOC = '@scene s\n@variant mood\n@when true\nHi.\n@end\n@set x = seen_variant("mood")\n';

  it("seen_variant: true when the Variant has been seen", () => {
    const document = compileDoc(VARIANT_DOC);
    const reader: ReaderState = {
      visitedScenes: {},
      seenVariants: { mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 1 } }
    };
    expect(evaluateExpression(firstSetExpression(document), ctx(document, {}, reader))).toEqual({
      ok: true,
      value: true
    });
  });

  it("seen_variant: false when the Variant is valid but never seen", () => {
    const document = compileDoc(VARIANT_DOC);
    expect(evaluateExpression(firstSetExpression(document), ctx(document))).toEqual({ ok: true, value: false });
  });

  it("seen_variant: agrees with the compiler for a Variant nested inside a Conditional branch", () => {
    // Both the compiler's Variant-id collection and the runtime's defensive
    // containsVariant scan must descend into Conditional branches — this
    // document only compiles cleanly, and this query only avoids an
    // invalid-variant-reference error, if both actually do.
    const document = compileDoc(
      [
        "@scene s",
        "@if true",
        "@variant mood",
        "@when true",
        "Hi.",
        "@end",
        "@end",
        '@set x = seen_variant("mood")'
      ].join("\n")
    );
    expect(evaluateExpression(firstSetExpression(document), ctx(document))).toEqual({ ok: true, value: false });
  });

  it("last_seen_variant_branch: returns lastSeenBranchId when seen", () => {
    const document = compileDoc(
      '@scene s\n@variant mood\n@when true\nHi.\n@end\n@set x = last_seen_variant_branch("mood")\n'
    );
    const reader: ReaderState = {
      visitedScenes: {},
      seenVariants: { mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 2 } }
    };
    expect(evaluateExpression(firstSetExpression(document), ctx(document, {}, reader))).toEqual({
      ok: true,
      value: "mood:0"
    });
  });

  it("last_seen_variant_branch: null when the Variant is valid but never seen", () => {
    const document = compileDoc(
      '@scene s\n@variant mood\n@when true\nHi.\n@end\n@set x = last_seen_variant_branch("mood")\n'
    );
    expect(evaluateExpression(firstSetExpression(document), ctx(document))).toEqual({ ok: true, value: null });
  });
});

describe("Reader Memory query builtins — defensive runtime validation (best-effort document)", () => {
  it("an unknown builtin reaching the evaluator is a runtime error, distinct from unknown-identifier", () => {
    const document = compile('@scene s\n@set x = frobnicate("s")\n').document; // compiler already flags AT2002
    const result = evaluateExpression(firstSetExpression(document), ctx(document));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown-builtin");
  });

  it("an invalid Scene reference reaching the evaluator is a runtime error, not treated as unseen", () => {
    const document = compile('@scene s\n@set x = visited("nowhere")\n').document; // compiler already flags AT1004
    const result = evaluateExpression(firstSetExpression(document), ctx(document));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid-scene-target");
  });

  it("an invalid Variant reference reaching the evaluator is a runtime error, not treated as unseen", () => {
    const document = compile('@scene s\n@set x = seen_variant("nowhere")\n').document; // compiler already flags AT1103
    const result = evaluateExpression(firstSetExpression(document), ctx(document));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid-variant-reference");
  });
});

describe("Reader Memory query builtins — composition", () => {
  it("composes with an ordinary StoryState identifier via &&", () => {
    const document = compileDoc('@scene s\n@set flag = true\n@set x = visited("s") && flag\n');
    const setBlocks = document.scenes[0]!.blocks.filter((b) => b.type === "Set");
    const expression = setBlocks[1]!.type === "Set" ? setBlocks[1]!.expression : undefined;
    const reader: ReaderState = { visitedScenes: { s: { visitCount: 1 } }, seenVariants: {} };
    expect(evaluateExpression(expression!, ctx(document, { flag: true }, reader))).toEqual({
      ok: true,
      value: true
    });
  });

  it('equality with null: last_seen_variant_branch(...) == null', () => {
    const document = compileDoc(
      '@scene s\n@variant mood\n@when true\nHi.\n@end\n@set x = last_seen_variant_branch("mood") == null\n'
    );
    expect(evaluateExpression(firstSetExpression(document), ctx(document))).toEqual({ ok: true, value: true });
  });

  it("numeric comparison of visit_count", () => {
    const document = compileDoc('@scene s\n@set x = visit_count("s") >= 2\n');
    const reader: ReaderState = { visitedScenes: { s: { visitCount: 2 } }, seenVariants: {} };
    expect(evaluateExpression(firstSetExpression(document), ctx(document, {}, reader))).toEqual({
      ok: true,
      value: true
    });
  });

  it("short-circuit: the unevaluated side of && never dispatches its query, even if that reference is invalid", () => {
    // "nowhere" is not a real scene — if the right side were ever evaluated
    // this would be a runtime error, not `false`.
    const document = compile('@scene s\n@set x = false && visited("nowhere")\n').document;
    const result = evaluateExpression(firstSetExpression(document), ctx(document));
    expect(result).toEqual({ ok: true, value: false });
  });

  it("short-circuit: the unevaluated side of || never dispatches its query, even if that reference is invalid", () => {
    const document = compile('@scene s\n@set x = true || visited("nowhere")\n').document;
    const result = evaluateExpression(firstSetExpression(document), ctx(document));
    expect(result).toEqual({ ok: true, value: true });
  });
});
