import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { matchDirectiveLine } from "../src/parser/directive-line.js";

// The patterns the parser used before they were rewritten to remove
// ambiguous backtracking. They serve as oracles: the rewrite must accept
// exactly the same lines and capture exactly the same text.
const OLD_DIRECTIVE = /^@([A-Za-z][A-Za-z0-9_-]*)(?:[ \t]+(.*))?$/;
const OLD_SET = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/;

function oldMatchDirectiveLine(text: string) {
  const match = OLD_DIRECTIVE.exec(text);
  if (!match) return null;
  const name = match[1] as string;
  const rawArgs = match[2];
  if (rawArgs === undefined) return { name, args: "", argsStartColumn: text.length };
  const argsStartColumn = text.indexOf(rawArgs, name.length + 1);
  return { name, args: rawArgs.trimEnd(), argsStartColumn: argsStartColumn === -1 ? text.length : argsStartColumn };
}

function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const TOKENS = ["@", "a", "scene", "set", "x", "-", "_", "1", " ", "  ", "\t", "\r", "\u2028", "\u2029", "é", "\\", "!", "=", "@a b", "if"];

function randomLine(random: () => number): string {
  const parts = 1 + Math.floor(random() * 8);
  let text = "";
  for (let i = 0; i < parts; i++) text += TOKENS[Math.floor(random() * TOKENS.length)];
  return text;
}

describe("directive line matching: no super-linear backtracking", () => {
  it("handles a very long separator run followed by a line terminator in linear time", () => {
    for (const terminator of ["\u2028", "\u2029", "\r"]) {
      const text = `@a${" ".repeat(100_000)}${terminator}x`;
      const start = performance.now();
      const result = matchDirectiveLine(text);
      const elapsed = performance.now() - start;
      expect(result).toBeNull();
      expect(elapsed).toBeLessThan(500);
    }
  });

  it("compiles such a source in linear time and treats the line as prose", () => {
    const source = `@scene s\n@a${" ".repeat(100_000)}\u2028\n`;
    const start = performance.now();
    const result = compile(source);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result.document.scenes[0]!.blocks.map((b) => b.type)).toEqual(["Paragraph"]);
  });

  it("accepts exactly the same lines and captures exactly the same text as the previous pattern", () => {
    const fixed = [
      "@scene s", "@scene", "@scene  ", "@scene\t\tmain", "@a ", "@a  b  ", "@a-b c", "@a_b", "@1a", "@", "@ a", "a @b",
      "@scene s\u2028", "@scene\u2028s", "@scene s\r", "@scene s é", "@scene s \\", "@set x = 1", "@end"
    ];
    const random = lcg(20260108);
    const generated = Array.from({ length: 4000 }, () => randomLine(random));
    for (const text of [...fixed, ...generated]) {
      expect(matchDirectiveLine(text), JSON.stringify(text)).toEqual(oldMatchDirectiveLine(text));
    }
  });
});

describe("@set form matching: same accept/reject decisions as the previous pattern", () => {
  const FORM_ERROR = 'Malformed expression: expected "name = expression"';

  function rejectedAsMalformedForm(args: string): boolean {
    const source = `@scene s\n@set ${args}\n`;
    return compile(source).diagnostics.some((d) => d.code === "AT2001" && d.message === FORM_ERROR);
  }

  it("rejects exactly when the previous pattern did, for fixed and generated arguments", () => {
    const fixed = [
      "x = 1", "x=1", "  x   =   a + b", "x ==1", "= 1", "1x = 2", "x", "x =", "x =  ", "x\t=\t1", "x = (1)", "_a1 = 2",
      "x é = 1", "x = é", "x = \\"
    ];
    const random = lcg(8675309);
    const generated = Array.from({ length: 3000 }, () => randomLine(random).replace(/[\r\u2028\u2029]/g, ""));
    for (const raw of [...fixed, ...generated]) {
      const args = raw.trim();
      if (args === "") continue; // no arguments at all: not a form question
      expect(rejectedAsMalformedForm(args), JSON.stringify(args)).toBe(OLD_SET.exec(args) === null);
    }
  });

  it("stays fast on a long whitespace run after the name", () => {
    const start = performance.now();
    compile(`@scene s\n@set x${" ".repeat(100_000)}\n`);
    compile(`@scene s\n@set x =${" ".repeat(100_000)}1\n`);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
