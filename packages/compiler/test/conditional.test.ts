import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import type { ConditionalNode } from "../src/ast/story.js";
import { codesOf, compileOk } from "./helpers.js";

function conditionalOf(document: ReturnType<typeof compileOk>["document"], blockIndex = 0): ConditionalNode {
  const block = document.scenes[0]!.blocks[blockIndex]!;
  if (block.type !== "Conditional") throw new Error("expected Conditional");
  return block;
}

describe("conditional blocks", () => {
  it("parses if/elseif/else/end into branches", () => {
    const source = [
      "@scene s",
      "@if timeline == 0",
      "Zero.",
      "@elseif timeline == 1",
      "One.",
      "@else",
      "Other.",
      "@end"
    ].join("\n");

    const { document } = compileOk(source);
    const block = document.scenes[0]!.blocks[0]!;
    if (block.type !== "Conditional") throw new Error("expected Conditional");
    expect(block.branches.map((b) => b.kind)).toEqual(["if", "elseif", "else"]);
    expect(block.branches[2]!.condition).toBeUndefined();
    expect(block.branches[0]!.blocks).toHaveLength(1);
  });

  it("supports nested conditionals", () => {
    const source = [
      "@scene s",
      "@if a == 1",
      "@if b == 2",
      "Inner.",
      "@end",
      "Outer.",
      "@end"
    ].join("\n");

    const { document } = compileOk(source);
    const outer = document.scenes[0]!.blocks[0]!;
    if (outer.type !== "Conditional") throw new Error("expected Conditional");
    const [inner, outerParagraph] = outer.branches[0]!.blocks;
    expect(inner!.type).toBe("Conditional");
    expect(outerParagraph!.type).toBe("Paragraph");
  });

  it("reports AT1002 for a conditional missing @end", () => {
    const result = compile(["@scene s", "@if a == 1", "Body."].join("\n"));
    expect(codesOf(result.diagnostics)).toContain("AT1002");
  });

  it("reports AT2001 for a malformed condition expression", () => {
    const result = compile(["@scene s", "@if a ==", "Body.", "@end"].join("\n"));
    expect(codesOf(result.diagnostics)).toContain("AT2001");
  });
});

/**
 * docs/CORE_SPEC.md Section 25.36 (Nested Presentation Command Insertion
 * expansion) — `ConditionalBranch.span.end` is unchanged (verified below,
 * not merely asserted) and is already the correct branch-body append
 * coordinate; `ConditionalBranch.followingLineEnding` is new, purely
 * additive source-tooling metadata reporting the exact line-terminator
 * bytes immediately following it, mirroring `SceneNode.followingLineEnding`.
 */
describe("ConditionalBranch.followingLineEnding", () => {
  it("is \"\\n\" after a non-empty first (if) branch, before @elseif", () => {
    const source = ["@scene s", "@if a == 1", "A.", "@elseif b == 1", "B.", "@else", "C.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = conditionalOf(document).branches[0]!;

    expect(source.slice(branch.span.end.offset)).toMatch(/^\n@elseif/);
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("is \"\\n\" after a non-empty middle (elseif) branch, before @else", () => {
    const source = ["@scene s", "@if a == 1", "A.", "@elseif b == 1", "B.", "@else", "C.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = conditionalOf(document).branches[1]!;

    expect(source.slice(branch.span.end.offset)).toMatch(/^\n@else/);
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("is \"\\n\" after a non-empty last (else) branch, before @end", () => {
    const source = ["@scene s", "@if a == 1", "A.", "@elseif b == 1", "B.", "@else", "C.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = conditionalOf(document).branches[2]!;

    expect(source.slice(branch.span.end.offset)).toBe("\n@end");
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("is \"\\n\" for an empty first (if) branch, anchored to its own marker line", () => {
    const source = ["@scene s", "@if a == 1", "@elseif b == 1", "B.", "@else", "C.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = conditionalOf(document).branches[0]!;

    expect(branch.blocks).toHaveLength(0);
    expect(source.slice(branch.span.end.offset)).toMatch(/^\n@elseif/);
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("is \"\\n\" for an empty middle (elseif) branch, anchored to its own marker line", () => {
    const source = ["@scene s", "@if a == 1", "A.", "@elseif b == 1", "@else", "C.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = conditionalOf(document).branches[1]!;

    expect(branch.blocks).toHaveLength(0);
    expect(source.slice(branch.span.end.offset)).toMatch(/^\n@else/);
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("is \"\\n\" for an empty last (else) branch, anchored to its own marker line", () => {
    const source = ["@scene s", "@if a == 1", "A.", "@else", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = conditionalOf(document).branches[1]!;

    expect(branch.blocks).toHaveLength(0);
    expect(source.slice(branch.span.end.offset)).toBe("\n@end");
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("reports only the immediate terminator when blank lines separate a branch from @else, leaving them outside the span", () => {
    const source = ["@scene s", "@if a == 1", "A.", "", "", "@else", "C.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = conditionalOf(document).branches[0]!;

    expect(branch.followingLineEnding).toBe("\n");
    expect(source.slice(branch.span.end.offset)).toBe("\n\n\n@else\nC.\n@end");
  });

  it("is \"\\r\\n\" at a CRLF branch boundary", () => {
    const source = "@scene s\r\n@if a == 1\r\nA.\r\n@else\r\nC.\r\n@end\r\n";
    const { document } = compileOk(source);
    const branch = conditionalOf(document).branches[0]!;

    expect(source[branch.span.end.offset]).toBe("\r");
    expect(branch.followingLineEnding).toBe("\r\n");
  });

  it("computes correctly when the Conditional follows YAML frontmatter", () => {
    const source = "---\ntitle: Test\n---\n@scene s\n@if a == 1\nA.\n@end\n";
    const { document } = compileOk(source);
    const branch = conditionalOf(document).branches[0]!;

    expect(branch.followingLineEnding).toBe("\n");
  });

  it("remains correct with Korean text and an emoji inside the branch", () => {
    const source = ["@scene s", "@if a == 1", "한글 문장입니다 😀 텍스트.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branch = conditionalOf(document).branches[0]!;

    expect(branch.followingLineEnding).toBe("\n");
  });

  it("chains through a nested Conditional's complete span when it is the branch's last block", () => {
    const source = ["@scene s", "@if a == 1", "@if b == 1", "Inner.", "@end", "@end"].join("\n");
    const { document } = compileOk(source);
    const outerBranch = conditionalOf(document).branches[0]!;
    const inner = outerBranch.blocks[0]!;
    if (inner.type !== "Conditional") throw new Error("expected nested Conditional");

    expect(outerBranch.span.end).toEqual(inner.span.end);
    expect(source.slice(outerBranch.span.end.offset)).toBe("\n@end");
    expect(outerBranch.followingLineEnding).toBe("\n");
  });

  it("chains through a nested Variant's complete span when it is the branch's last block", () => {
    const source = [
      "@scene s",
      "@if a == 1",
      "@variant v",
      "@when x == 1",
      "Inner.",
      "@end",
      "@end"
    ].join("\n");
    const { document } = compileOk(source);
    const outerBranch = conditionalOf(document).branches[0]!;
    const inner = outerBranch.blocks[0]!;
    if (inner.type !== "Variant") throw new Error("expected nested Variant");

    expect(outerBranch.span.end).toEqual(inner.span.end);
    expect(source.slice(outerBranch.span.end.offset)).toBe("\n@end");
    expect(outerBranch.followingLineEnding).toBe("\n");
  });

  it("is \"\" for an unclosed branch reaching true EOF with no trailing newline (malformed, defensive)", () => {
    const source = ["@scene s", "@if a == 1", "A"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1002");

    const branch = conditionalOf(result.document).branches[0]!;
    expect(branch.span.end.offset).toBe(source.length);
    expect(branch.followingLineEnding).toBe("");
  });

  it("is \"\\n\" for an unclosed branch with a trailing newline (malformed, defensive)", () => {
    const source = ["@scene s", "@if a == 1", "A", ""].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1002");

    const branch = conditionalOf(result.document).branches[0]!;
    expect(branch.followingLineEnding).toBe("\n");
  });

  it("does not change ConditionalBranch.span (purely additive)", () => {
    const source = ["@scene s", "@if a == 1", "A.", "@else", "C.", "@end"].join("\n");
    const { document } = compileOk(source);
    const branches = conditionalOf(document).branches;

    expect(branches[0]!.span).toEqual({
      start: { line: 2, column: 1, offset: 9 },
      end: { line: 3, column: 3, offset: 22 }
    });
    expect(branches[1]!.span).toEqual({
      start: { line: 4, column: 1, offset: 23 },
      end: { line: 5, column: 3, offset: 31 }
    });
  });
});

/**
 * Runtime's selectConditionalBranch (advance.ts) returns the first "@else"
 * unconditionally, so authoring any branch after it
 * (another "@elseif" or a duplicate "@else") makes that later branch
 * permanently unreachable dead code with no prior diagnostic. AT1006 closes
 * this gap, mirroring AT1104's identical rule for Variant's "@otherwise" —
 * purely additive: no parser, AST, or Runtime change.
 */
describe("AT1006 — no branch may appear after @else", () => {
  function slice(source: string, span: { start: { offset: number }; end: { offset: number } }): string {
    return source.slice(span.start.offset, span.end.offset);
  }

  describe("valid — zero AT1006", () => {
    it("a single @if branch", () => {
      const source = ["@scene s", "@if a == 1", "A.", "@end"].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1006");
    });

    it("multiple @elseif branches, no @else", () => {
      const source = [
        "@scene s",
        "@if a == 1",
        "A.",
        "@elseif a == 2",
        "B.",
        "@end"
      ].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1006");
    });

    it("@elseif followed by a final @else", () => {
      const source = ["@scene s", "@if a == 1", "A.", "@else", "B.", "@end"].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1006");
    });

    it("empty branch bodies", () => {
      const source = ["@scene s", "@if a == 1", "@else", "@end"].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1006");
    });

    it("empty branch bodies across @elseif and @else", () => {
      const source = ["@scene s", "@if a == 1", "@elseif a == 2", "@else", "@end"].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1006");
    });

    it("multiple @elseif branches plus a final @else", () => {
      const source = [
        "@scene s",
        "@if a == 1",
        "A.",
        "@elseif a == 2",
        "B.",
        "@elseif a == 3",
        "C.",
        "@else",
        "D.",
        "@end"
      ].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1006");
    });

    it("nested StoryBlocks inside branches, including a nested Conditional", () => {
      const source = [
        "@scene s",
        "@if a == 1",
        "@if b == 1",
        "Inner.",
        "@else",
        "Inner fallback.",
        "@end",
        "@else",
        "Outer fallback.",
        "@end"
      ].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1006");
    });

    it("CRLF source", () => {
      const source = ["@scene s", "@if a == 1", "A.", "@else", "B.", "@end"].join("\r\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1006");
    });

    it("a valid Variant nested inside a valid Conditional branch", () => {
      const source = [
        "@scene s",
        "@if a == 1",
        "@variant v",
        "@when x == 1",
        "X.",
        "@otherwise",
        "Y.",
        "@end",
        "@else",
        "Z.",
        "@end"
      ].join("\n");
      expect(codesOf(compileOk(source).diagnostics)).not.toContain("AT1006");
    });
  });

  describe("invalid — AT1006 on the offending branch(es), AST fully retained", () => {
    it("@elseif after @else: AT1006 on the later @elseif, branches retained in authored order", () => {
      const source = [
        "@scene s",
        "@if a == 1",
        "A.",
        "@else",
        "Fallback.",
        "@elseif a == 2",
        "B.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const at1006 = result.diagnostics.filter((d) => d.code === "AT1006");
      expect(at1006).toHaveLength(1);

      const branches = conditionalOf(result.document).branches;
      expect(branches.map((b) => b.kind)).toEqual(["if", "else", "elseif"]);
      expect(slice(source, at1006[0]!.span)).toBe(slice(source, branches[2]!.span));
      expect(branches[2]!.kind).toBe("elseif");
    });

    it("duplicate @else: AT1006 on the second @else only", () => {
      const source = [
        "@scene s",
        "@if a == 1",
        "A.",
        "@else",
        "Fallback A.",
        "@else",
        "Fallback B.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const at1006 = result.diagnostics.filter((d) => d.code === "AT1006");
      expect(at1006).toHaveLength(1);

      const branches = conditionalOf(result.document).branches;
      expect(branches.map((b) => b.kind)).toEqual(["if", "else", "else"]);
      expect(slice(source, at1006[0]!.span)).toBe(slice(source, branches[2]!.span));
    });

    it("@elseif, @else, @elseif: AT1006 on the later @elseif only (the earlier @elseif is before @else, not offending)", () => {
      const source = [
        "@scene s",
        "@if a == 1",
        "A.",
        "@elseif a == 2",
        "B.",
        "@else",
        "Fallback.",
        "@elseif a == 3",
        "C.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const at1006 = result.diagnostics.filter((d) => d.code === "AT1006");
      expect(at1006).toHaveLength(1);

      const branches = conditionalOf(result.document).branches;
      expect(branches.map((b) => b.kind)).toEqual(["if", "elseif", "else", "elseif"]);
      expect(slice(source, at1006[0]!.span)).toBe(slice(source, branches[3]!.span));
    });

    it("duplicate @else plus a later @elseif: AT1006 on every branch after the first @else", () => {
      const source = [
        "@scene s",
        "@if a == 1",
        "A.",
        "@else",
        "Fallback A.",
        "@else",
        "Fallback B.",
        "@elseif a == 2",
        "C.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const at1006 = result.diagnostics.filter((d) => d.code === "AT1006");
      expect(at1006).toHaveLength(2);

      const branches = conditionalOf(result.document).branches;
      expect(branches.map((b) => b.kind)).toEqual(["if", "else", "else", "elseif"]);
      expect(slice(source, at1006[0]!.span)).toBe(slice(source, branches[2]!.span));
      expect(slice(source, at1006[1]!.span)).toBe(slice(source, branches[3]!.span));
    });

    it("reaches a nested Conditional (inside another Conditional's @if branch): AT1006 fires on the misplaced branch, outer Conditional unaffected", () => {
      const source = [
        "@scene s",
        "@if a == 1",
        "@if b == 1",
        "Inner.",
        "@else",
        "Fallback.",
        "@elseif c == 1",
        "C.",
        "@end",
        "@else",
        "Outer fallback.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const at1006 = result.diagnostics.filter((d) => d.code === "AT1006");
      expect(at1006).toHaveLength(1);

      const outer = conditionalOf(result.document);
      expect(outer.branches.map((b) => b.kind)).toEqual(["if", "else"]);
      const innerBlock = outer.branches[0]!.blocks[0]!;
      if (innerBlock.type !== "Conditional") throw new Error("expected nested Conditional");
      expect(innerBlock.branches.map((b) => b.kind)).toEqual(["if", "else", "elseif"]);
      expect(slice(source, at1006[0]!.span)).toBe(slice(source, innerBlock.branches[2]!.span));
    });

    it("reaches a Conditional nested inside a Variant's @when branch: AT1006 fires, Variant unaffected", () => {
      const source = [
        "@scene s",
        "@variant v",
        "@when a == 1",
        "@if b == 1",
        "B.",
        "@else",
        "Fallback.",
        "@elseif c == 1",
        "C.",
        "@end",
        "@otherwise",
        "Other.",
        "@end"
      ].join("\n");
      const result = compile(source);
      const at1006 = result.diagnostics.filter((d) => d.code === "AT1006");
      expect(at1006).toHaveLength(1);
      expect(codesOf(result.diagnostics)).not.toContain("AT1101");
      expect(codesOf(result.diagnostics)).not.toContain("AT1102");
      expect(codesOf(result.diagnostics)).not.toContain("AT1104");

      const variantBlock = result.document.scenes[0]!.blocks[0]!;
      if (variantBlock.type !== "Variant") throw new Error("expected Variant");
      const inner = variantBlock.branches[0]!.blocks[0]!;
      if (inner.type !== "Conditional") throw new Error("expected nested Conditional");
      expect(inner.branches.map((b) => b.kind)).toEqual(["if", "else", "elseif"]);
    });

    it("CRLF: diagnostic location remains correct and line endings are irrelevant to the rule", () => {
      const source = ["@scene s", "@if a == 1", "A.", "@else", "Fallback.", "@elseif a == 2", "B.", "@end"].join(
        "\r\n"
      );
      const result = compile(source);
      const at1006 = result.diagnostics.filter((d) => d.code === "AT1006");
      expect(at1006).toHaveLength(1);

      const branches = conditionalOf(result.document).branches;
      expect(at1006[0]!.span.start.line).toBe(branches[2]!.span.start.line);
      expect(branches.map((b) => b.kind)).toEqual(["if", "else", "elseif"]);
    });

    it("existing AT1101/AT1102/AT1104 Variant diagnostics are unaffected by this check", () => {
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

      const otherwiseOrderSource = [
        "@scene s",
        "@variant v",
        "@otherwise",
        "Fallback.",
        "@when a == 1",
        "A.",
        "@end"
      ].join("\n");
      expect(codesOf(compile(otherwiseOrderSource).diagnostics)).toContain("AT1104");
    });
  });
});

/**
 * docs/CORE_SPEC.md Section 25.51 (Conditional Branch Structured Editing) —
 * `ConditionalBranch.conditionSourceSpan` mirrors
 * `VariantBranch.conditionSourceSpan` exactly: the authored `@if`/`@elseif`
 * condition text, derived from `parseConditional`'s already-computed
 * `branchDirective.args`/`argsStartColumn` facts, never from `condition.span`
 * (which silently drops a precedence-significant opening parenthesis).
 */
describe("ConditionalBranch.conditionSourceSpan", () => {
  function slice(source: string, span: { start: { offset: number }; end: { offset: number } }): string {
    return source.slice(span.start.offset, span.end.offset);
  }

  it("slices exactly the @if condition text", () => {
    const source = ["@scene s", "@if score > 5", "A.", "@end"].join("\n");
    const branch = conditionalOf(compileOk(source).document).branches[0]!;
    expect(branch.conditionSourceSpan).toBeDefined();
    expect(slice(source, branch.conditionSourceSpan!)).toBe("score > 5");
  });

  it("slices exactly the @elseif condition text", () => {
    const source = ["@scene s", "@if a", "A.", '@elseif name == "Alice"', "B.", "@end"].join("\n");
    const branches = conditionalOf(compileOk(source).document).branches;
    expect(slice(source, branches[1]!.conditionSourceSpan!)).toBe('name == "Alice"');
  });

  it("preserves internal spacing exactly", () => {
    const source = ["@scene s", "@if a  &&  b", "A.", "@end"].join("\n");
    const branch = conditionalOf(compileOk(source).document).branches[0]!;
    expect(slice(source, branch.conditionSourceSpan!)).toBe("a  &&  b");
  });

  it("accepts a tab separator before the condition", () => {
    const source = ["@scene s", "@if\tscore > 5", "A.", "@end"].join("\n");
    const branch = conditionalOf(compileOk(source).document).branches[0]!;
    expect(slice(source, branch.conditionSourceSpan!)).toBe("score > 5");
  });

  it("slices complex boolean expressions", () => {
    const source = ["@scene s", "@if a && b || c", "A.", "@end"].join("\n");
    const branch = conditionalOf(compileOk(source).document).branches[0]!;
    expect(slice(source, branch.conditionSourceSpan!)).toBe("a && b || c");
  });

  it("slices the full parenthesized text when parens wrap a partial sub-expression", () => {
    const source = ["@scene s", "@if (foo && bar) || baz", "A.", "@end"].join("\n");
    const branch = conditionalOf(compileOk(source).document).branches[0]!;
    expect(slice(source, branch.conditionSourceSpan!)).toBe("(foo && bar) || baz");
  });

  it("slices comparison operators exactly", () => {
    const source = ["@scene s", "@if score >= 10", "A.", "@end"].join("\n");
    const branch = conditionalOf(compileOk(source).document).branches[0]!;
    expect(slice(source, branch.conditionSourceSpan!)).toBe("score >= 10");
  });

  it("slices string literals exactly, including their quotes", () => {
    const source = ["@scene s", '@if name == "Alice"', "A.", "@end"].join("\n");
    const branch = conditionalOf(compileOk(source).document).branches[0]!;
    expect(slice(source, branch.conditionSourceSpan!)).toBe('name == "Alice"');
  });

  it("slices Unicode string content exactly", () => {
    const source = ["@scene s", '@if name == "한글"', "A.", "@end"].join("\n");
    const branch = conditionalOf(compileOk(source).document).branches[0]!;
    expect(slice(source, branch.conditionSourceSpan!)).toBe('name == "한글"');
  });

  it("produces exact absolute offsets under CRLF", () => {
    const source = ["@scene s", "@if score > 5", "A.", "@end"].join("\r\n");
    const branch = conditionalOf(compileOk(source).document).branches[0]!;
    const start = source.indexOf("score > 5");
    expect(branch.conditionSourceSpan!.start.offset).toBe(start);
    expect(branch.conditionSourceSpan!.end.offset).toBe(start + "score > 5".length);
    expect(slice(source, branch.conditionSourceSpan!)).toBe("score > 5");
  });

  it("is undefined for @else (never a zero-width span)", () => {
    const source = ["@scene s", "@if a", "A.", "@else", "B.", "@end"].join("\n");
    const branches = conditionalOf(compileOk(source).document).branches;
    expect(branches[1]!.kind).toBe("else");
    expect(branches[1]!.conditionSourceSpan).toBeUndefined();
  });

  it("slices the condition of a Conditional nested inside another Conditional branch", () => {
    const source = [
      "@scene s",
      "@if outer",
      "@if inner == 1",
      "A.",
      "@end",
      "@else",
      "B.",
      "@end"
    ].join("\n");
    const outer = conditionalOf(compileOk(source).document);
    const inner = outer.branches[0]!.blocks[0]!;
    if (inner.type !== "Conditional") throw new Error("expected nested Conditional");
    expect(slice(source, inner.branches[0]!.conditionSourceSpan!)).toBe("inner == 1");
    expect(slice(source, outer.branches[0]!.conditionSourceSpan!)).toBe("outer");
  });

  it("slices the condition of a Conditional inside a Variant branch", () => {
    const source = [
      "@scene s",
      "@variant v",
      "@when outer_ok",
      "@if inner_ok",
      "A.",
      "@end",
      "@otherwise",
      "B.",
      "@end"
    ].join("\n");
    const variant = compileOk(source).document.scenes[0]!.blocks[0]!;
    if (variant.type !== "Variant") throw new Error("expected Variant");
    const inner = variant.branches[0]!.blocks[0]!;
    if (inner.type !== "Conditional") throw new Error("expected nested Conditional");
    expect(slice(source, inner.branches[0]!.conditionSourceSpan!)).toBe("inner_ok");
  });

  it("is undefined when the @if directive has no args (AT2001, empty condition)", () => {
    const source = ["@scene s", "@if", "A.", "@end"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT2001");
    const branch = conditionalOf(result.document).branches[0]!;
    expect(branch.conditionSourceSpan).toBeUndefined();
  });
});
