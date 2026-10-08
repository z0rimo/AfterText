import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import type { VariantNode } from "../src/ast/story.js";
import { codesOf, compileOk } from "./helpers.js";

function variantOf(document: ReturnType<typeof compileOk>["document"], blockIndex = 0): VariantNode {
  const block = document.scenes[0]!.blocks[blockIndex]!;
  if (block.type !== "Variant") throw new Error("expected Variant");
  return block;
}

describe("@variant", () => {
  it("assigns deterministic branch ids", () => {
    const source = [
      "@scene s",
      "@variant alice-status",
      "@when timeline == 0",
      "She died that night.",
      "@when timeline == 1",
      "She disappeared that night.",
      "@otherwise",
      "Nothing happened that night.",
      "@end"
    ].join("\n");

    const { document } = compileOk(source);
    const block = document.scenes[0]!.blocks[0]!;
    if (block.type !== "Variant") throw new Error("expected Variant");
    expect(block.id).toBe("alice-status");
    expect(block.branches.map((b) => b.branchId)).toEqual([
      "alice-status:0",
      "alice-status:1",
      "alice-status:otherwise"
    ]);
    expect(block.branches[2]!.condition).toBeUndefined();
  });

  it("reports AT1101 for duplicate variant ids", () => {
    const source = [
      "@scene s",
      "@variant dup",
      "@when a == 1",
      "X.",
      "@end",
      "@variant dup",
      "@when a == 2",
      "Y.",
      "@end"
    ].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1101");
  });

  it("reports AT1102 for a variant with only @otherwise", () => {
    const source = ["@scene s", "@variant only-otherwise", "@otherwise", "Fallback.", "@end"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1102");
  });

  it("reports AT1002 for a variant missing @end", () => {
    const source = ["@scene s", "@variant unclosed", "@when a == 1", "X."].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1002");
  });
});

/**
 * docs/CORE_SPEC.md Section 25.36 (Nested Presentation Command Insertion
 * expansion) — `VariantBranch.span.end` is unchanged (verified below, not
 * merely asserted) and is already the correct branch-body append
 * coordinate; `VariantBranch.followingLineEnding` is new, purely additive
 * source-tooling metadata reporting the exact line-terminator bytes
 * immediately following it, mirroring `ConditionalBranch.followingLineEnding`
 * and `SceneNode.followingLineEnding`.
 */
describe("VariantBranch.followingLineEnding", () => {
  it("is \"\\n\" after a non-empty branch, before the sibling @otherwise marker", () => {
    const source = ["@scene s", "@variant v", "@when a == 1", "A.", "@otherwise", "B.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = variantOf(document).branches[0]!;

    expect(source.slice(branch.span.end.offset)).toMatch(/^\n@otherwise/);
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("is \"\\n\" for an empty branch, anchored to its own marker line", () => {
    const source = ["@scene s", "@variant v", "@when a == 1", "@otherwise", "B.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = variantOf(document).branches[0]!;

    expect(branch.blocks).toHaveLength(0);
    expect(source.slice(branch.span.end.offset)).toMatch(/^\n@otherwise/);
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("is \"\\n\" for the last branch, before the container's @end", () => {
    const source = ["@scene s", "@variant v", "@when a == 1", "A.", "@otherwise", "B.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = variantOf(document).branches[1]!;

    expect(source.slice(branch.span.end.offset)).toBe("\n@end");
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("reports only the immediate terminator when blank lines separate a branch from @otherwise, leaving them outside the span", () => {
    const source = ["@scene s", "@variant v", "@when a == 1", "A.", "", "", "@otherwise", "B.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = variantOf(document).branches[0]!;

    expect(branch.followingLineEnding).toBe("\n");
    expect(source.slice(branch.span.end.offset)).toBe("\n\n\n@otherwise\nB.\n@end");
  });

  it("is \"\\r\\n\" at a CRLF branch boundary", () => {
    const source = "@scene s\r\n@variant v\r\n@when a == 1\r\nA.\r\n@otherwise\r\nB.\r\n@end\r\n";
    const { document } = compileOk(source);
    const branch = variantOf(document).branches[0]!;

    expect(source[branch.span.end.offset]).toBe("\r");
    expect(branch.followingLineEnding).toBe("\r\n");
  });

  it("computes correctly when the Variant follows YAML frontmatter", () => {
    const source = "---\ntitle: Test\n---\n@scene s\n@variant v\n@when a == 1\nA.\n@end\n";
    const { document } = compileOk(source);
    const branch = variantOf(document).branches[0]!;

    expect(branch.followingLineEnding).toBe("\n");
  });

  it("remains correct with Korean text and an emoji inside the branch", () => {
    const source = ["@scene s", "@variant v", "@when a == 1", "한글 문장입니다 😀 텍스트.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = variantOf(document).branches[0]!;

    expect(branch.followingLineEnding).toBe("\n");
  });

  it("chains through a nested Conditional's complete span when it is the branch's final block", () => {
    const source = ["@scene s", "@variant v", "@when a == 1", "@if b == 1", "Inner.", "@end", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = variantOf(document).branches[0]!;
    const inner = branch.blocks[0]!;
    if (inner.type !== "Conditional") throw new Error("expected nested Conditional");

    expect(branch.span.end).toEqual(inner.span.end);
    expect(source.slice(branch.span.end.offset)).toBe("\n@end");
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("chains through a nested Variant's complete span when it is the branch's final block", () => {
    const source = [
      "@scene s",
      "@variant outer",
      "@when a == 1",
      "@variant inner",
      "@when b == 1",
      "Inner.",
      "@end",
      "@end"
    ].join("\n");
    const { document } = compileOk(source);
    const branch = variantOf(document).branches[0]!;
    const inner = branch.blocks[0]!;
    if (inner.type !== "Variant") throw new Error("expected nested Variant");

    expect(branch.span.end).toEqual(inner.span.end);
    expect(source.slice(branch.span.end.offset)).toBe("\n@end");
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("is \"\" for an unclosed branch reaching true EOF with no trailing newline (malformed, defensive)", () => {
    const source = ["@scene s", "@variant v", "@when a == 1", "A"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1002");

    const branch = variantOf(result.document).branches[0]!;
    expect(branch.span.end.offset).toBe(source.length);
    expect(branch.followingLineEnding).toBe("");
  });

  it("does not change VariantBranch.span (purely additive)", () => {
    const source = ["@scene s", "@variant v", "@when a == 1", "A.", "@otherwise", "B.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branches = variantOf(document).branches;

    expect(branches[0]!.span).toEqual({
      start: { line: 3, column: 1, offset: 20 },
      end: { line: 4, column: 3, offset: 35 }
    });
  });
});

/**
 * docs/CORE_SPEC.md — "@otherwise" matches unconditionally the instant
 * Runtime's branch resolution reaches it (resolveVariant), so authoring any
 * branch after it makes that later branch permanently unreachable dead code
 * with no prior diagnostic. AT1104 closes this gap in the existing
 * post-parse validation pass — purely additive: no parser, AST, branchId,
 * or Runtime change.
 */
describe("AT1104 — no branch may appear after @otherwise", () => {
  function slice(source: string, span: { start: { offset: number }; end: { offset: number } }): string {
    return source.slice(span.start.offset, span.end.offset);
  }

  describe("valid — zero AT1104", () => {
    it("a single @when branch", () => {
      const source = ["@scene s", "@variant v", "@when a == 1", "A.", "@end"].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1104");
    });

    it("multiple @when branches, no @otherwise", () => {
      const source = [
        "@scene s",
        "@variant v",
        "@when a == 1",
        "A.",
        "@when a == 2",
        "B.",
        "@end"
      ].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1104");
    });

    it("@when followed by a final @otherwise", () => {
      const source = ["@scene s", "@variant v", "@when a == 1", "A.", "@otherwise", "B.", "@end"].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1104");
    });

    it("empty branch bodies", () => {
      const source = ["@scene s", "@variant v", "@when a == 1", "@otherwise", "@end"].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1104");
    });

    it("nested StoryBlocks inside branches, including a nested Variant", () => {
      const source = [
        "@scene s",
        "@variant outer",
        "@when a == 1",
        "@variant inner",
        "@when b == 1",
        "Inner.",
        "@end",
        "@otherwise",
        "Outer fallback.",
        "@end"
      ].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1104");
    });

    it("CRLF source", () => {
      const source = ["@scene s", "@variant v", "@when a == 1", "A.", "@otherwise", "B.", "@end"].join(
        "\r\n"
      );
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1104");
    });
  });

  describe("invalid — AT1104 on the offending branch(es), AST fully retained", () => {
    it("@otherwise before @when: AT1104 on the later @when, branches retained in authored order", () => {
      const source = [
        "@scene s",
        "@variant v",
        "@otherwise",
        "Fallback.",
        "@when a == 1",
        "A.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const at1104 = result.diagnostics.filter((d) => d.code === "AT1104");
      expect(at1104).toHaveLength(1);

      const branches = variantOf(result.document).branches;
      expect(branches.map((b) => b.kind)).toEqual(["otherwise", "when"]);
      expect(slice(source, at1104[0]!.span)).toBe(slice(source, branches[1]!.span));
      expect(branches[1]!.kind).toBe("when");
    });

    it("@when / @otherwise / @when: AT1104 on the later @when only", () => {
      const source = [
        "@scene s",
        "@variant v",
        "@when a == 1",
        "A.",
        "@otherwise",
        "Fallback.",
        "@when a == 2",
        "B.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const at1104 = result.diagnostics.filter((d) => d.code === "AT1104");
      expect(at1104).toHaveLength(1);

      const branches = variantOf(result.document).branches;
      expect(branches.map((b) => b.kind)).toEqual(["when", "otherwise", "when"]);
      expect(slice(source, at1104[0]!.span)).toBe(slice(source, branches[2]!.span));
    });

    it("duplicate @otherwise: AT1104 on the second @otherwise only", () => {
      const source = [
        "@scene s",
        "@variant v",
        "@when a == 1",
        "A.",
        "@otherwise",
        "Fallback A.",
        "@otherwise",
        "Fallback B.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const at1104 = result.diagnostics.filter((d) => d.code === "AT1104");
      expect(at1104).toHaveLength(1);

      const branches = variantOf(result.document).branches;
      expect(branches.map((b) => b.kind)).toEqual(["when", "otherwise", "otherwise"]);
      expect(slice(source, at1104[0]!.span)).toBe(slice(source, branches[2]!.span));
    });

    it("duplicate @otherwise plus a later @when: AT1104 on every branch after the first @otherwise", () => {
      const source = [
        "@scene s",
        "@variant v",
        "@when a == 1",
        "A.",
        "@otherwise",
        "Fallback A.",
        "@otherwise",
        "Fallback B.",
        "@when a == 2",
        "C.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const at1104 = result.diagnostics.filter((d) => d.code === "AT1104");
      expect(at1104).toHaveLength(2);

      const branches = variantOf(result.document).branches;
      expect(branches.map((b) => b.kind)).toEqual(["when", "otherwise", "otherwise", "when"]);
      expect(slice(source, at1104[0]!.span)).toBe(slice(source, branches[2]!.span));
      expect(slice(source, at1104[1]!.span)).toBe(slice(source, branches[3]!.span));
    });

    it("does not change branchId generation for invalid source (rejection, not new identity semantics)", () => {
      const source = [
        "@scene s",
        "@variant v",
        "@when a == 1",
        "A.",
        "@otherwise",
        "Fallback A.",
        "@otherwise",
        "Fallback B.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const branches = variantOf(result.document).branches;
      expect(branches.map((b) => b.branchId)).toEqual(["v:0", "v:otherwise", "v:otherwise"]);
    });

    it("existing AT1101/AT1102 diagnostics are unaffected by this check", () => {
      const dupIdSource = [
        "@scene s",
        "@variant dup",
        "@when a == 1",
        "X.",
        "@end",
        "@variant dup",
        "@when a == 2",
        "Y.",
        "@end"
      ].join("\n");
      expect(codesOf(compile(dupIdSource).diagnostics)).toContain("AT1101");

      const noWhenSource = ["@scene s", "@variant only-otherwise", "@otherwise", "Fallback.", "@end"].join(
        "\n"
      );
      expect(codesOf(compile(noWhenSource).diagnostics)).toContain("AT1102");
    });

    it("reaches a nested Variant (inside another Variant's @when branch): AT1104 fires on the misplaced branch, outer Variant unaffected", () => {
      const source = [
        "@scene s",
        "@variant outer",
        "@when a == 1",
        "@variant inner",
        "@otherwise",
        "Fallback.",
        "@when b == 1",
        "B.",
        "@end",
        "@otherwise",
        "Outer fallback.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const at1104 = result.diagnostics.filter((d) => d.code === "AT1104");
      expect(at1104).toHaveLength(1);

      const outer = variantOf(result.document);
      expect(outer.branches.map((b) => b.kind)).toEqual(["when", "otherwise"]);
      const innerBlock = outer.branches[0]!.blocks[0]!;
      if (innerBlock.type !== "Variant") throw new Error("expected nested Variant");
      expect(innerBlock.branches.map((b) => b.kind)).toEqual(["otherwise", "when"]);
      expect(slice(source, at1104[0]!.span)).toBe(slice(source, innerBlock.branches[1]!.span));
    });
  });
});

/**
 * docs/CORE_SPEC.md Section 25.43 (Variant Branch Structured Editing) —
 * `VariantBranch.conditionSourceSpan` mirrors `ChoiceItem.conditionSourceSpan`
 * (Section 25.41) exactly: the exact authored `@when` condition text, derived
 * from `parseVariant`'s own already-computed `branchDirective.args`/
 * `argsStartColumn` facts, never from `condition.span` (the Expression AST's
 * own span, which silently drops a precedence-significant opening
 * parenthesis).
 */
describe("VariantBranch.conditionSourceSpan", () => {
  function slice(source: string, span: { start: { offset: number }; end: { offset: number } }): string {
    return source.slice(span.start.offset, span.end.offset);
  }

  function firstWhenBranch(source: string) {
    const { document } = compileOk(source);
    return variantOf(document).branches[0]!;
  }

  it("slices exactly the condition text for a simple identifier", () => {
    const source = ["@scene s", "@variant v", "@when has_key", "A.", "@end"].join("\n");
    const branch = firstWhenBranch(source);
    expect(branch.conditionSourceSpan).toBeDefined();
    expect(slice(source, branch.conditionSourceSpan!)).toBe("has_key");
  });

  it("slices the full parenthesized text when parens wrap the entire condition", () => {
    const source = ["@scene s", "@variant v", "@when (has_key)", "A.", "@end"].join("\n");
    const branch = firstWhenBranch(source);
    expect(slice(source, branch.conditionSourceSpan!)).toBe("(has_key)");
  });

  it("slices nested parentheses that fully wrap the condition", () => {
    const source = ["@scene s", "@variant v", "@when ((has_key))", "A.", "@end"].join("\n");
    const branch = firstWhenBranch(source);
    expect(slice(source, branch.conditionSourceSpan!)).toBe("((has_key))");
  });

  it("slices exactly the condition text, including an internal parenthesized sub-term, for an arithmetic expression", () => {
    const source = ["@scene s", "@variant v", "@when a + b * (c - d)", "A.", "@end"].join("\n");
    const branch = firstWhenBranch(source);
    expect(slice(source, branch.conditionSourceSpan!)).toBe("a + b * (c - d)");
  });

  it("preserves unusual-but-valid internal whitespace exactly", () => {
    const source = ["@scene s", "@variant v", "@when   has_key  &&  flag  ", "A.", "@end"].join("\n");
    const branch = firstWhenBranch(source);
    expect(slice(source, branch.conditionSourceSpan!)).toBe("has_key  &&  flag");
  });

  it("handles CRLF line endings", () => {
    const source = ["@scene s", "@variant v", "@when has_key", "A.", "@end"].join("\r\n") + "\r\n";
    const branch = firstWhenBranch(source);
    expect(slice(source, branch.conditionSourceSpan!)).toBe("has_key");
  });

  it(
    "load-bearing proof: conditionSourceSpan is correct for a precedence-significant parenthesized " +
      "condition, while condition.span (the Expression AST's own span) is incomplete for the same fixture",
    () => {
      const source = ["@scene s", "@variant v", "@when (has_key || flag) && !done", "A.", "@end"].join("\n");
      const branch = firstWhenBranch(source);
      const expected = "(has_key || flag) && !done";

      expect(slice(source, branch.conditionSourceSpan!)).toBe(expected);
      // condition.span silently drops the opening "(" here, because the
      // expression parser returns the inner node directly for a
      // parenthesized sub-expression without widening its span — this is
      // the exact bug conditionSourceSpan exists to work around.
      expect(slice(source, branch.condition!.span)).not.toBe(expected);
      expect(slice(source, branch.condition!.span)).toBe("has_key || flag) && !done");
    }
  );

  it("also demonstrates the condition.span discrepancy for a leading-parenthesized arithmetic sub-term", () => {
    const source = ["@scene s", "@variant v", "@when (a + b) * c", "A.", "@end"].join("\n");
    const branch = firstWhenBranch(source);
    expect(slice(source, branch.conditionSourceSpan!)).toBe("(a + b) * c");
    expect(slice(source, branch.condition!.span)).toBe("a + b) * c");
  });

  it("is undefined for an @otherwise branch", () => {
    const source = ["@scene s", "@variant v", "@when a == 1", "A.", "@otherwise", "B.", "@end"].join("\n");
    const { document } = compileOk(source);
    const otherwise = variantOf(document).branches[1]!;
    expect(otherwise.kind).toBe("otherwise");
    expect(otherwise.condition).toBeUndefined();
    expect(otherwise.conditionSourceSpan).toBeUndefined();
  });

  it("remains populated as a source fact even when the condition expression itself fails to parse", () => {
    const source = ["@scene s", "@variant v", "@when 1 +", "A.", "@end"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT2001");

    const branch = variantOf(result.document).branches[0]!;
    expect(branch.condition).toBeUndefined();
    expect(branch.conditionSourceSpan).toBeDefined();
    expect(slice(source, branch.conditionSourceSpan!)).toBe("1 +");
  });

  it("is undefined when the @when directive has no args at all (AT2001, empty condition)", () => {
    const source = ["@scene s", "@variant v", "@when", "A.", "@end"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT2001");

    const branch = variantOf(result.document).branches[0]!;
    expect(branch.condition).toBeUndefined();
    expect(branch.conditionSourceSpan).toBeUndefined();
  });
});

/**
 * docs/CORE_SPEC.md Section 25.46 (Variant ID Editing) —
 * `VariantNode.idSourceSpan` mirrors `VariantBranch.conditionSourceSpan`
 * architecturally, one level up, but is locked as always-present
 * (non-optional): for an empty authored ID it is a zero-width span at the
 * parser-computed `argsStartColumn`, rather than `undefined`, so structured
 * source-tooling always has a coordinate to patch around.
 */
describe("VariantNode.idSourceSpan", () => {
  function slice(source: string, span: { start: { offset: number }; end: { offset: number } }): string {
    return source.slice(span.start.offset, span.end.offset);
  }

  it("slices exactly the ID text for a simple identifier", () => {
    const source = ["@scene s", "@variant simple-id", "@when a == 1", "A.", "@end"].join("\n");
    const { document } = compileOk(source);
    const block = variantOf(document);
    expect(block.idSourceSpan).toBeDefined();
    expect(slice(source, block.idSourceSpan)).toBe("simple-id");
  });

  it("preserves internal spaces in the ID exactly", () => {
    const source = ["@scene s", "@variant my variant", "@when a == 1", "A.", "@end"].join("\n");
    const { document } = compileOk(source);
    const block = variantOf(document);
    expect(block.id).toBe("my variant");
    expect(slice(source, block.idSourceSpan)).toBe("my variant");
  });

  it("excludes separator whitespace before the ID", () => {
    const source = ["@scene s", "@variant     spaced-out", "@when a == 1", "A.", "@end"].join("\n");
    const { document } = compileOk(source);
    const block = variantOf(document);
    expect(slice(source, block.idSourceSpan)).toBe("spaced-out");
  });

  it("excludes trailing header whitespace", () => {
    const source = ["@scene s", "@variant trailing-ws    ", "@when a == 1", "A.", "@end"].join("\n");
    const { document } = compileOk(source);
    const block = variantOf(document);
    expect(block.id).toBe("trailing-ws");
    expect(slice(source, block.idSourceSpan)).toBe("trailing-ws");
  });

  it("handles CRLF line endings", () => {
    const source = ["@scene s", "@variant crlf-id", "@when a == 1", "A.", "@end"].join("\r\n") + "\r\n";
    const { document } = compileOk(source);
    const block = variantOf(document);
    expect(slice(source, block.idSourceSpan)).toBe("crlf-id");
  });

  it("preserves Unicode (Korean) IDs exactly", () => {
    const source = ["@scene s", "@variant 변이상태", "@when a == 1", "A.", "@end"].join("\n");
    const { document } = compileOk(source);
    const block = variantOf(document);
    expect(block.id).toBe("변이상태");
    expect(slice(source, block.idSourceSpan)).toBe("변이상태");
  });

  it("preserves emoji IDs exactly", () => {
    const source = ["@scene s", "@variant 🎭status", "@when a == 1", "A.", "@end"].join("\n");
    const { document } = compileOk(source);
    const block = variantOf(document);
    expect(block.id).toBe("🎭status");
    expect(slice(source, block.idSourceSpan)).toBe("🎭status");
  });

  it("covers a nested Variant's own idSourceSpan independently of its enclosing Variant", () => {
    const source = [
      "@scene s",
      "@variant outer-id",
      "@when a == 1",
      "@variant inner-id",
      "@when b == 2",
      "X.",
      "@otherwise",
      "Y.",
      "@end",
      "@otherwise",
      "Z.",
      "@end"
    ].join("\n");
    const { document } = compileOk(source);
    const outer = variantOf(document);
    expect(slice(source, outer.idSourceSpan)).toBe("outer-id");

    const innerBlock = outer.branches[0]!.blocks[0]!;
    if (innerBlock.type !== "Variant") throw new Error("expected nested Variant");
    expect(slice(source, innerBlock.idSourceSpan)).toBe("inner-id");
  });

  it("is a zero-width span at argsStartColumn for a bare @variant with no ID at all", () => {
    const source = ["@scene s", "@variant", "@when a == 1", "A.", "@end"].join("\n");
    const { document } = compileOk(source);
    const block = variantOf(document);
    expect(block.id).toBe("");
    expect(block.idSourceSpan.start.offset).toBe(block.idSourceSpan.end.offset);
    // Not just internally self-consistent (start === end) — pinned to the
    // exact absolute offset immediately after "@variant" on line 2:
    // "@scene s\n".length (9) + "@variant".length (8) = 17.
    expect(block.idSourceSpan.start.offset).toBe(17);
  });

  it("is a zero-width span at argsStartColumn for a whitespace-only @variant ID", () => {
    const source = ["@scene s", "@variant    ", "@when a == 1", "A.", "@end"].join("\n");
    const { document } = compileOk(source);
    const block = variantOf(document);
    expect(block.id).toBe("");
    expect(block.idSourceSpan.start.offset).toBe(block.idSourceSpan.end.offset);
    // Pinned to the same absolute offset as the bare case (right after
    // "@variant", before the trailing separator whitespace) — not merely
    // the end of the line.
    expect(block.idSourceSpan.start.offset).toBe(17);
  });

  it("produces the identical zero-width offset for bare @variant and whitespace-only @variant forms", () => {
    const bareSource = ["@scene s", "@variant", "@when a == 1", "A.", "@end"].join("\n");
    const wsSource = ["@scene s", "@variant    ", "@when a == 1", "A.", "@end"].join("\n");
    const bareBlock = variantOf(compileOk(bareSource).document);
    const wsBlock = variantOf(compileOk(wsSource).document);
    expect(bareBlock.idSourceSpan.start.offset).toBe(wsBlock.idSourceSpan.start.offset);
  });
});
