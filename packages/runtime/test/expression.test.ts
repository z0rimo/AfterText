import { describe, expect, it } from "vitest";
import type { ExpressionNode } from "@aftertext/compiler";
// evaluateExpression/evaluateCondition are internal (not re-exported from
// the public barrel — see src/index.ts) — tested directly here by deliberate
// choice, since driving every one of these edge cases through full
// advance()/@set integration would be far less precise for little benefit.
import { evaluateCondition, evaluateExpression, type EvaluationContext } from "../src/execution/expression.js";
import type { ReaderState, StoryState } from "../src/index.js";
import { compileDoc } from "./helpers.js";

/** Compiles a bare expression via `@set x = <source>` and returns its AST. */
function expressionOf(source: string): ExpressionNode {
  const document = compileDoc(`@scene s\n@set x = ${source}\n`);
  const block = document.scenes[0]!.blocks[0]!;
  if (block.type !== "Set") throw new Error("expected Set");
  return block.expression;
}

// None of these tests exercise Reader Memory queries or defensive
// Scene/Variant lookups (that's covered in advance-reader-memory-query.test.ts)
// — a single trivial shared document/empty ReaderState is enough context.
const CONTEXT_DOCUMENT = compileDoc("@scene s\n");
const EMPTY_READER: ReaderState = { visitedScenes: {}, seenVariants: {} };

/** Builds the EvaluationContext these tests need, from just a StoryState. */
function ctx(story: StoryState): EvaluationContext {
  return { document: CONTEXT_DOCUMENT, story, reader: EMPTY_READER };
}

describe("evaluateExpression / evaluateCondition", () => {
  describe("unknown identifiers", () => {
    it("is a runtime error, not null", () => {
      const result = evaluateExpression(expressionOf("saw_preson"), ctx({}));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("unknown-identifier");
    });

    it("a declared null is a distinct, valid value (not confused with absence)", () => {
      const story: StoryState = { flag: null };
      expect(evaluateExpression(expressionOf("flag"), ctx(story))).toEqual({ ok: true, value: null });
    });
  });

  describe("boolean conditions — no truthiness", () => {
    it.each([
      ["true", true],
      ["false", false]
    ])("accepts an actual boolean: %s", (source, expected) => {
      expect(evaluateCondition(expressionOf(source), ctx({}))).toEqual({ ok: true, value: expected });
    });

    it.each([
      ["null", "null"],
      ["0", "number 0"],
      ["1", "number 1"],
      ['""', "empty string"],
      ['"text"', "non-empty string"]
    ])("rejects %s (%s) as a condition", (source) => {
      const result = evaluateCondition(expressionOf(source), ctx({}));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("type-mismatch");
    });

    it("rejects a non-boolean logical operand (1 && true)", () => {
      const result = evaluateCondition(expressionOf("1 && true"), ctx({}));
      expect(result.ok).toBe(false);
    });
  });

  describe("&& / || short-circuit", () => {
    it("&&: false short-circuits without evaluating an erroring right side", () => {
      expect(evaluateCondition(expressionOf("false && (1 / 0 == 0)"), ctx({}))).toEqual({ ok: true, value: false });
    });

    it("||: true short-circuits without evaluating an erroring right side", () => {
      expect(evaluateCondition(expressionOf("true || (1 / 0 == 0)"), ctx({}))).toEqual({ ok: true, value: true });
    });

    it("&&: evaluates the right side when the left doesn't already decide", () => {
      expect(evaluateCondition(expressionOf("true && false"), ctx({}))).toEqual({ ok: true, value: false });
    });

    it("||: evaluates the right side when the left doesn't already decide", () => {
      expect(evaluateCondition(expressionOf("false || true"), ctx({}))).toEqual({ ok: true, value: true });
    });
  });

  describe("cross-type equality", () => {
    it.each([
      ['1 == "1"', false],
      ['1 != "1"', true],
      ["null == false", false],
      ["null == null", true],
      ["null != null", false],
      ["1 == 1", true],
      ['"a" == "a"', true],
      ['"a" == "b"', false]
    ])("%s -> %s", (source, expected) => {
      expect(evaluateExpression(expressionOf(source), ctx({}))).toEqual({ ok: true, value: expected });
    });
  });

  describe("arithmetic — numbers only, no coercion", () => {
    it.each([
      ["1 + 2", 3],
      ["5 - 2", 3],
      ["3 * 4", 12],
      ["10 / 4", 2.5],
      ["10 % 3", 1]
    ])("%s -> %s", (source, expected) => {
      expect(evaluateExpression(expressionOf(source), ctx({}))).toEqual({ ok: true, value: expected });
    });

    it('does not concatenate strings through "+"', () => {
      const result = evaluateExpression(expressionOf('"a" + "b"'), ctx({}));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("type-mismatch");
    });

    it("rejects a boolean operand", () => {
      expect(evaluateExpression(expressionOf("true + 1"), ctx({})).ok).toBe(false);
    });

    it("rejects a null operand", () => {
      expect(evaluateExpression(expressionOf("null + 1"), ctx({})).ok).toBe(false);
    });

    it("division by zero is a runtime error, not Infinity/NaN", () => {
      const result = evaluateExpression(expressionOf("1 / 0"), ctx({}));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("division-by-zero");
    });

    it("modulo by zero is a runtime error", () => {
      const result = evaluateExpression(expressionOf("1 % 0"), ctx({}));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("division-by-zero");
    });
  });

  describe("ordering — numbers only", () => {
    it.each([
      ["1 < 2", true],
      ["2 <= 2", true],
      ["3 > 2", true],
      ["2 >= 3", false]
    ])("%s -> %s", (source, expected) => {
      expect(evaluateExpression(expressionOf(source), ctx({}))).toEqual({ ok: true, value: expected });
    });

    it('rejects string operands ("a" < "b")', () => {
      expect(evaluateExpression(expressionOf('"a" < "b"'), ctx({})).ok).toBe(false);
    });
  });
});
