import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

// compile() reports ordinary source problems as diagnostics and never
// throws. Deeply nested input used to overflow the call stack in the
// recursive parser/validator (about 2,000-4,000 levels on Node's default
// stack). Resource limits now turn it into diagnostics.

const EXPRESSION_LIMIT = 256;
const BLOCK_LIMIT = 64;

function compileOrThrow(source: string) {
  // Surface a RangeError as a test failure with the original message.
  return compile(source);
}

function codes(source: string): string[] {
  return compileOrThrow(source).diagnostics.map((d) => d.code);
}

describe("expression nesting", () => {
  const generators: Record<string, (n: number) => string> = {
    "binary chain": (n) => "@scene s\n@set x = " + "1 + ".repeat(n) + "1\n",
    "logical chain in @if": (n) => "@scene s\n@if " + "a && ".repeat(n) + "a\nx\n@end\n",
    "nested parentheses": (n) => "@scene s\n@set x = " + "(".repeat(n) + "1" + ")".repeat(n) + "\n",
    "unary chain": (n) => "@scene s\n@if " + "!".repeat(n) + "a\nx\n@end\n",
    "unary minus chain": (n) => "@scene s\n@set x = " + "- ".repeat(n) + "1\n",
    "nested calls": (n) => "@scene s\n@set x = " + "visited(".repeat(n) + '"s"' + ")".repeat(n) + "\n"
  };

  for (const [name, generate] of Object.entries(generators)) {
    it(`${name}: far beyond the limit does not throw and reports AT2001 on the line`, () => {
      const result = compileOrThrow(generate(10_000));
      expect(result.diagnostics.some((d) => d.code === "AT2001" && /nested too deeply/.test(d.message))).toBe(true);
      expect(result.hasErrors).toBe(true);
    });

    it(`${name}: a moderately deep expression is still accepted`, () => {
      const result = compileOrThrow(generate(50));
      expect(result.diagnostics.filter((d) => d.code === "AT2001" && /nested too deeply/.test(d.message))).toEqual([]);
    });
  }

  it("accepts a chain exactly at the limit and rejects one just above it", () => {
    const chain = (terms: number) => "@scene s\n@set x = " + Array.from({ length: terms }, () => "1").join(" + ") + "\n";
    expect(codes(chain(EXPRESSION_LIMIT))).toEqual([]);
    expect(codes(chain(EXPRESSION_LIMIT + 2))).toContain("AT2001");
  });

  it("reports the diagnostic on the offending line only; later lines still compile", () => {
    const source = "@scene s\n@set x = " + "(".repeat(5000) + "1" + ")".repeat(5000) + "\n@set y = 2\nHello.\n";
    const result = compileOrThrow(source);
    const tooDeep = result.diagnostics.filter((d) => /nested too deeply/.test(d.message));
    expect(tooDeep).toHaveLength(1);
    expect(tooDeep[0]!.span.start.line).toBe(2);
    const blocks = result.document.scenes[0]!.blocks.map((b) => b.type);
    expect(blocks).toEqual(["Set", "Paragraph"]);
  });
});

describe("block nesting", () => {
  const nestedIf = (n: number) => "@scene s\n" + "@if a\n".repeat(n) + "x\n" + "@end\n".repeat(n);
  const nestedVariant = (n: number) => "@scene s\n" + "@variant v\n@when true\n".repeat(n) + "x\n" + "@end\n".repeat(n);

  for (const [name, generate] of [["@if", nestedIf], ["@variant", nestedVariant]] as const) {
    it(`${name}: nesting far beyond the limit does not throw and reports AT1007`, () => {
      const result = compileOrThrow(generate(10_000));
      expect(result.diagnostics.map((d) => d.code)).toContain("AT1007");
      expect(result.hasErrors).toBe(true);
    });
  }

  it("accepts nesting up to the limit and reports AT1007 just above it", () => {
    expect(codes(nestedIf(BLOCK_LIMIT))).not.toContain("AT1007");
    expect(codes(nestedIf(BLOCK_LIMIT + 1))).toContain("AT1007");
  });

  it("skips the whole over-deep construct and resumes after its @end", () => {
    const source = "@scene s\n" + "@if a\n".repeat(BLOCK_LIMIT + 1) + "inner\n" + "@end\n".repeat(BLOCK_LIMIT + 1) + "after\n";
    const result = compileOrThrow(source);
    const rejected = result.diagnostics.filter((d) => d.code === "AT1007");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.span.start.line).toBe(2 + BLOCK_LIMIT);
    // The enclosing constructs close normally and the trailing prose is kept.
    expect(result.diagnostics.filter((d) => d.code === "AT1002")).toEqual([]);
    const outer = result.document.scenes[0]!.blocks;
    expect(outer.map((b) => b.type)).toEqual(["Conditional", "Paragraph"]);
  });

  it("an over-deep construct containing a @choice is skipped as a unit", () => {
    const source =
      "@scene s\n" + "@if a\n".repeat(BLOCK_LIMIT + 1) + "@choice\n- Go -> t\n@end\n" + "@end\n".repeat(BLOCK_LIMIT + 1) + "@scene t\nhi\n";
    const result = compileOrThrow(source);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["AT1007"]);
    expect(result.document.scenes.map((s) => s.id)).toEqual(["s", "t"]);
  });

  it("a @choice body is opaque while skipping: directive-shaped lines inside it open nothing", () => {
    const source =
      "@scene s\n" +
      "@if a\n".repeat(BLOCK_LIMIT + 1) +
      "@choice\n@if stray\n- Go -> t\n@end\n" +
      "@end\n".repeat(BLOCK_LIMIT + 1) +
      "after\n@scene t\nhi\n";
    const result = compileOrThrow(source);
    expect(result.diagnostics.filter((d) => d.code === "AT1007")).toHaveLength(1);
    expect(result.diagnostics.filter((d) => d.code === "AT1002")).toEqual([]);
    const outer = result.document.scenes[0]!.blocks;
    expect(outer.map((b) => b.type)).toEqual(["Conditional", "Paragraph"]);
  });

  it("an unclosed over-deep construct stops at the next @scene", () => {
    const source = "@scene s\n" + "@if a\n".repeat(BLOCK_LIMIT + 1) + "x\n@scene t\nhi\n";
    const result = compileOrThrow(source);
    expect(result.document.scenes.map((s) => s.id)).toEqual(["s", "t"]);
    expect(result.diagnostics.map((d) => d.code)).toContain("AT1007");
  });
});

describe("Markdown nesting", () => {
  it("deeply nested blockquotes fall back to plain text with a warning and do not throw", () => {
    const result = compileOrThrow("@scene s\n" + "> ".repeat(10_000) + "x\n");
    expect(result.diagnostics.map((d) => d.code)).toContain("AT3001");
    expect(result.document.scenes[0]!.blocks[0]!.type).toBe("Paragraph");
  });

  it("deeply nested lists fall back to plain text with a warning and do not throw", () => {
    const result = compileOrThrow("@scene s\n" + "- ".repeat(2_500) + "x\n");
    expect(result.diagnostics.map((d) => d.code)).toContain("AT3001");
    // remark itself parses nested lists in superlinear time (about 3 s here);
    // the explicit timeout keeps slow CI runners from failing the default 5 s.
  }, 30_000);

  it("deeply nested emphasis is flattened beyond the limit instead of overflowing", () => {
    const depth = 300;
    const result = compileOrThrow("@scene s\n" + "*a ".repeat(depth) + "b" + "*".repeat(depth) + "\n");
    expect(result.diagnostics.some((d) => d.code === "AT3001" && /nesting deeper/.test(d.message))).toBe(true);
    expect(result.document.scenes[0]!.blocks[0]!.type).toBe("Paragraph");
  });

  it("ordinary nesting is unchanged (no warning)", () => {
    const result = compileOrThrow("@scene s\nSome *emphasis with **strong** text* here.\n\n> not supported, one level\n");
    expect(result.diagnostics.filter((d) => /nesting deeper/.test(d.message))).toEqual([]);
  });
});
