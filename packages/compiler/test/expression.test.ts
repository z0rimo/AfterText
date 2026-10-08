import { describe, expect, it } from "vitest";
import type { ExpressionNode, LiteralValue } from "../src/index.js";
import { compile } from "../src/index.js";
import { codesOf, compileOk } from "./helpers.js";

/** Minimal evaluator used only to assert precedence/associativity by result, not by tree shape. */
function evaluate(node: ExpressionNode, scope: Record<string, LiteralValue> = {}): LiteralValue {
  switch (node.type) {
    case "Literal":
      return node.value;
    case "Identifier":
      return scope[node.name] ?? null;
    case "Unary": {
      const value = evaluate(node.argument, scope);
      if (node.operator === "!") return !value;
      return -(value as number);
    }
    case "Binary": {
      const left = evaluate(node.left, scope) as number & boolean & string;
      const right = evaluate(node.right, scope) as number & boolean & string;
      switch (node.operator) {
        case "+":
          return (left as unknown as number) + (right as unknown as number);
        case "-":
          return (left as unknown as number) - (right as unknown as number);
        case "*":
          return (left as unknown as number) * (right as unknown as number);
        case "/":
          return (left as unknown as number) / (right as unknown as number);
        case "%":
          return (left as unknown as number) % (right as unknown as number);
        case "<":
          return left < right;
        case "<=":
          return left <= right;
        case ">":
          return left > right;
        case ">=":
          return left >= right;
        case "==":
          return left === right;
        case "!=":
          return left !== right;
        case "&&":
          return Boolean(left) && Boolean(right);
        case "||":
          return Boolean(left) || Boolean(right);
      }
      break;
    }
    case "Call":
      // Reader Memory builtins are evaluated by the runtime, not this
      // precedence-only test evaluator — see call-expression.test.ts.
      throw new Error("Call is not supported by this precedence-test evaluator");
  }
}

function parseSetExpression(exprSource: string): ExpressionNode {
  const { document } = compileOk(`@scene s\n@set x = ${exprSource}\n`);
  const block = document.scenes[0]!.blocks[0]!;
  if (block.type !== "Set") throw new Error("expected Set");
  return block.expression;
}

describe("expression precedence", () => {
  it.each<[string, LiteralValue]>([
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["2 * 3 + 4 * 5", 26],
    ["10 - 2 - 3", 5], // left-associative: (10 - 2) - 3
    ["2 + 3 == 5", true],
    ["1 < 2 && 2 < 3", true],
    ["1 < 2 || 2 > 3", true],
    ["!true && false", false],
    ["!(true && false)", true],
    ["-1 + 2", 1],
    ["-(1 + 2)", -3],
    ["1 == 1 && 2 == 2 || false", true]
  ])("%s => %j", (source, expected) => {
    const node = parseSetExpression(source);
    expect(evaluate(node)).toBe(expected);
  });

  it("parses literals: string, number, boolean, null", () => {
    expect(evaluate(parseSetExpression('"hi"'))).toBe("hi");
    expect(evaluate(parseSetExpression("42"))).toBe(42);
    expect(evaluate(parseSetExpression("true"))).toBe(true);
    expect(evaluate(parseSetExpression("false"))).toBe(false);
    expect(evaluate(parseSetExpression("null"))).toBe(null);
  });

  it("resolves identifiers against a scope", () => {
    const node = parseSetExpression("timeline + 1");
    expect(evaluate(node, { timeline: 4 })).toBe(5);
  });
});

describe("malformed expressions", () => {
  it.each(["a ==", "1 +", "(1 + 2", "1 + + 2", "@"])("reports AT2001 for %s", (bad) => {
    const result = compile(`@scene s\n@set x = ${bad}\n`);
    expect(codesOf(result.diagnostics)).toContain("AT2001");
  });
});
