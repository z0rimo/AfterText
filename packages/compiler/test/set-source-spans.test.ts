import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import type { SetNode, StoryBlock } from "../src/ast/story.js";
import { compileOk } from "./helpers.js";

function setOf(source: string): SetNode {
  const document = compileOk(source).document;
  const block = document.scenes[0]!.blocks.find((b) => b.type === "Set");
  if (!block || block.type !== "Set") throw new Error("expected Set");
  return block;
}

function nameSlice(source: string, node: SetNode): string {
  return source.slice(node.nameSourceSpan.start.offset, node.nameSourceSpan.end.offset);
}

function exprSlice(source: string, node: SetNode): string {
  return source.slice(node.expressionSourceSpan.start.offset, node.expressionSourceSpan.end.offset);
}

function setsIn(blocks: readonly StoryBlock[]): SetNode[] {
  return blocks.flatMap((block): SetNode[] => {
    if (block.type === "Set") return [block];
    if (block.type === "Conditional" || block.type === "Variant") {
      return block.branches.flatMap((branch) => setsIn(branch.blocks));
    }
    return [];
  });
}

describe("SetNode name and expression spans", () => {
  it("covers a simple name and expression exactly", () => {
    const source = "@scene s\n@set score = 10\n";
    const node = setOf(source);
    expect(node.name).toBe("score");
    expect(nameSlice(source, node)).toBe("score");
    expect(exprSlice(source, node)).toBe("10");
    expect(node.nameSourceSpan.start).toEqual({ line: 2, column: 6, offset: 14 });
    expect(node.nameSourceSpan.end).toEqual({ line: 2, column: 11, offset: 19 });
    expect(node.expressionSourceSpan.start).toEqual({ line: 2, column: 14, offset: 22 });
    expect(node.expressionSourceSpan.end).toEqual({ line: 2, column: 16, offset: 24 });
  });

  it.each([
    ["@scene s\n@set x=1\n", "x", "1"],
    ["@scene s\n@set x = 1\n", "x", "1"],
    ["@scene s\n@set x    =    1\n", "x", "1"],
    ["@scene s\n@set    x    =    1\n", "x", "1"],
    ["@scene s\n@set x\t=\t1\n", "x", "1"],
  ])("excludes assignment spacing in %j", (source, name, expr) => {
    const node = setOf(source);
    expect(nameSlice(source, node)).toBe(name);
    expect(exprSlice(source, node)).toBe(expr);
  });

  it("excludes trailing whitespace from the expression", () => {
    const source = "@scene s\n@set x = a + b    \n";
    const node = setOf(source);
    expect(exprSlice(source, node)).toBe("a + b");
  });

  it.each([
    ["@scene s\n@set x = (a + b) * c\n", "(a + b) * c"],
    ["@scene s\n@set x = a + (b * c)\n", "a + (b * c)"],
    ["@scene s\n@set x = ((a))\n", "((a))"],
    ["@scene s\n@set x = (a)\n", "(a)"],
  ])("preserves grouping parentheses in %j", (source, expr) => {
    const node = setOf(source);
    expect(exprSlice(source, node)).toBe(expr);
    expect(node.expressionSourceSpan.start.offset).toBeLessThan(
      node.expressionSourceSpan.end.offset
    );
  });

  it("covers a string literal exactly", () => {
    const source = "@scene s\n@set msg = \"hi there\"\n";
    expect(exprSlice(source, setOf(source))).toBe("\"hi there\"");
  });

  it("covers logical and comparison expressions exactly", () => {
    const logical = "@scene s\n@set ok = a && b || c\n";
    expect(exprSlice(logical, setOf(logical))).toBe("a && b || c");
    const comparison = "@scene s\n@set big = score >= 10\n";
    expect(exprSlice(comparison, setOf(comparison))).toBe("score >= 10");
  });

  it("preserves spacing-heavy expressions exactly", () => {
    const source = "@scene s\n@set x =   a   +   b   \n";
    expect(exprSlice(source, setOf(source))).toBe("a   +   b");
  });

  it("covers a Unicode string literal exactly", () => {
    const source = "@scene s\n@set t = \"안녕 👋\"\n";
    expect(exprSlice(source, setOf(source))).toBe("\"안녕 👋\"");
  });

  it.each([
    ["@scene s\n@set score_total_2 = 1\n", "score_total_2"],
    ["@scene s\n@set _x = 1\n", "_x"],
  ])("covers longer and underscore/digit names in %j", (source, name) => {
    expect(nameSlice(source, setOf(source))).toBe(name);
  });

  it("covers CRLF with exact offsets and no off-by-one", () => {
    const source = "@scene s\r\n@set score = (a + b)\r\n";
    const node = setOf(source);
    expect(nameSlice(source, node)).toBe("score");
    expect(exprSlice(source, node)).toBe("(a + b)");
    expect(node.nameSourceSpan.start).toEqual({ line: 2, column: 6, offset: 15 });
    expect(node.expressionSourceSpan.start).toEqual({ line: 2, column: 14, offset: 23 });
    expect(node.expressionSourceSpan.end).toEqual({ line: 2, column: 21, offset: 30 });
  });

  it("keeps name, expression, and span semantically unchanged", () => {
    const source = "@scene s\n@set x = (a + b) * c\n";
    const node = setOf(source);
    expect(node.name).toBe("x");
    expect(node.expression.type).toBe("Binary");
    expect(node.span.start).toEqual({ line: 2, column: 1, offset: 9 });
  });

  it("covers a nested Set inside a Conditional branch", () => {
    const source = "@scene s\n@if true\n@set x = (a + b)\n@end\n";
    const document = compileOk(source).document;
    const sets = setsIn(document.scenes[0]!.blocks);
    expect(sets).toHaveLength(1);
    expect(nameSlice(source, sets[0]!)).toBe("x");
    expect(exprSlice(source, sets[0]!)).toBe("(a + b)");
  });

  it("covers a nested Set inside a Variant branch", () => {
    const source = "@scene s\n@variant v\n@when true\n@set x = (a + b)\n@end\n";
    const document = compileOk(source).document;
    const sets = setsIn(document.scenes[0]!.blocks);
    expect(sets).toHaveLength(1);
    expect(nameSlice(source, sets[0]!)).toBe("x");
    expect(exprSlice(source, sets[0]!)).toBe("(a + b)");
  });
});

describe("malformed Set forms remain unchanged", () => {
  it.each([
    ["@scene s\n@set\n"],
    ["@scene s\n@set = 1\n"],
    ["@scene s\n@set x =\n"],
    ["@scene s\n@set x =    \n"],
    ["@scene s\n@set a = b = c\n"],
  ])("emits AT2001 and no Set node for %j", (source) => {
    const result = compile(source);
    expect(result.hasErrors).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toContain("AT2001");
    const sets = setsIn(result.document.scenes[0]?.blocks ?? []);
    expect(sets).toHaveLength(0);
  });
});
