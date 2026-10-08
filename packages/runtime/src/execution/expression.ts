import type {
  BinaryExpression,
  BinaryOperator,
  ExpressionNode,
  SourceSpan,
  StoryDocument,
  UnaryExpression
} from "@aftertext/compiler";
import type { ReaderState } from "../state/reader-state.js";
import type { StoryState, StoryValue } from "../state/story-state.js";
import { RuntimeErrors } from "./errors.js";
import type { RuntimeExecutionError } from "./errors.js";
import { evaluateMemoryQuery } from "./memory-queries.js";

/**
 * Everything expression evaluation may read (docs/CORE_SPEC.md Section
 * 17.17). Responsibilities are strictly partitioned: `story` backs
 * `Identifier` resolution (unchanged since before Reader Memory queries
 * existed); `reader` backs Reader Memory builtin values, reachable only
 * through `Call` dispatch, never as an ordinary identifier; `document`
 * backs the defensive Scene/Variant existence checks a best-effort/
 * malformed document's Reader Memory call might still need. Pure and
 * immutable — evaluation never mutates any of these, and no module-global
 * or "current runtime" state exists anywhere in this module.
 */
export interface EvaluationContext {
  readonly document: StoryDocument;
  readonly story: StoryState;
  readonly reader: ReaderState;
}

/**
 * Pure evaluator for the compiler's existing `ExpressionNode` against an
 * `EvaluationContext`. Implements docs/CORE_SPEC.md Section 17.8 exactly:
 * explicit, deterministic rules, never implicit JavaScript truthiness or
 * coercion. Result-typed rather than throwing, matching this package's
 * existing no-throw, pure-function style. `Call` (Reader Memory queries)
 * is defined separately in Sections 17.14–17.16.
 */
export type ExpressionOutcome =
  | { readonly ok: true; readonly value: StoryValue }
  | { readonly ok: false; readonly error: RuntimeExecutionError };

export type ConditionOutcome =
  | { readonly ok: true; readonly value: boolean }
  | { readonly ok: false; readonly error: RuntimeExecutionError };

function describeType(value: StoryValue): string {
  return value === null ? "null" : typeof value;
}

function sameType(a: StoryValue, b: StoryValue): boolean {
  if (a === null || b === null) return a === null && b === null;
  return typeof a === typeof b;
}

export function evaluateExpression(expression: ExpressionNode, context: EvaluationContext): ExpressionOutcome {
  switch (expression.type) {
    case "Literal":
      return { ok: true, value: expression.value };

    case "Identifier": {
      if (!Object.prototype.hasOwnProperty.call(context.story, expression.name)) {
        return { ok: false, error: RuntimeErrors.unknownIdentifier(expression.name, expression.span) };
      }
      return { ok: true, value: context.story[expression.name] as StoryValue };
    }

    case "Unary":
      return evaluateUnary(expression, context);

    case "Binary":
      return evaluateBinary(expression, context);

    case "Call":
      return evaluateMemoryQuery(expression, context.document, context.reader);
  }
}

/**
 * Evaluates `expression` and requires the result to be an actual boolean —
 * no truthiness of any kind. Used for `@if`/`@elseif`/`@when`/choice `if`
 * conditions, and reused below to give `!`/`&&`/`||` the same strict rule.
 */
export function evaluateCondition(expression: ExpressionNode, context: EvaluationContext): ConditionOutcome {
  const result = evaluateExpression(expression, context);
  if (!result.ok) return result;
  if (typeof result.value !== "boolean") {
    return {
      ok: false,
      error: RuntimeErrors.typeMismatch(
        `Expected a boolean condition, got ${describeType(result.value)}.`,
        expression.span
      )
    };
  }
  return { ok: true, value: result.value };
}

function evaluateUnary(expression: UnaryExpression, context: EvaluationContext): ExpressionOutcome {
  if (expression.operator === "!") {
    const argument = evaluateCondition(expression.argument, context);
    if (!argument.ok) return argument;
    return { ok: true, value: !argument.value };
  }

  // operator === "-"
  const argument = evaluateExpression(expression.argument, context);
  if (!argument.ok) return argument;
  if (typeof argument.value !== "number") {
    return {
      ok: false,
      error: RuntimeErrors.typeMismatch(
        `Unary "-" requires a number operand, got ${describeType(argument.value)}.`,
        expression.span
      )
    };
  }
  return { ok: true, value: -argument.value };
}

type ArithmeticOperator = "+" | "-" | "*" | "/" | "%";
type ComparisonOperator = "<" | "<=" | ">" | ">=";

function isArithmeticOperator(operator: BinaryOperator): operator is ArithmeticOperator {
  return operator === "+" || operator === "-" || operator === "*" || operator === "/" || operator === "%";
}

function isComparisonOperator(operator: BinaryOperator): operator is ComparisonOperator {
  return operator === "<" || operator === "<=" || operator === ">" || operator === ">=";
}

function evaluateBinary(expression: BinaryExpression, context: EvaluationContext): ExpressionOutcome {
  const { operator } = expression;

  if (operator === "&&" || operator === "||") {
    const left = evaluateCondition(expression.left, context);
    if (!left.ok) return left;
    // Short-circuit: the right operand is not evaluated once the left
    // already determines the result, so an unevaluated branch (including
    // one containing a Reader Memory query) can never surface an error or
    // execute at all.
    if (operator === "&&" && left.value === false) return { ok: true, value: false };
    if (operator === "||" && left.value === true) return { ok: true, value: true };
    return evaluateCondition(expression.right, context);
  }

  const left = evaluateExpression(expression.left, context);
  if (!left.ok) return left;
  const right = evaluateExpression(expression.right, context);
  if (!right.ok) return right;

  if (operator === "==" || operator === "!=") {
    const equal = sameType(left.value, right.value) && left.value === right.value;
    return { ok: true, value: operator === "==" ? equal : !equal };
  }

  if (isArithmeticOperator(operator)) {
    return evaluateArithmetic(operator, left.value, right.value, expression.span);
  }

  if (isComparisonOperator(operator)) {
    return evaluateComparison(operator, left.value, right.value, expression.span);
  }

  return { ok: true, value: false }; // unreachable — all BinaryOperator members are handled above
}

function evaluateArithmetic(
  operator: "+" | "-" | "*" | "/" | "%",
  left: StoryValue,
  right: StoryValue,
  span: SourceSpan
): ExpressionOutcome {
  if (typeof left !== "number" || typeof right !== "number") {
    return {
      ok: false,
      error: RuntimeErrors.typeMismatch(
        `"${operator}" requires two number operands, got ${describeType(left)} and ${describeType(right)}.`,
        span
      )
    };
  }
  if ((operator === "/" || operator === "%") && right === 0) {
    return { ok: false, error: RuntimeErrors.divisionByZero(span) };
  }

  let result: number;
  switch (operator) {
    case "+":
      result = left + right;
      break;
    case "-":
      result = left - right;
      break;
    case "*":
      result = left * right;
      break;
    case "/":
      result = left / right;
      break;
    case "%":
      result = left % right;
      break;
  }

  // General rule (17.8): any arithmetic result must remain a valid JSON
  // number. Division/modulo by zero is the common case (already caught
  // above); this also catches the rare overflow-to-Infinity case.
  if (!Number.isFinite(result)) {
    return { ok: false, error: RuntimeErrors.invalidArithmeticResult(span) };
  }
  return { ok: true, value: result };
}

function evaluateComparison(
  operator: "<" | "<=" | ">" | ">=",
  left: StoryValue,
  right: StoryValue,
  span: SourceSpan
): ExpressionOutcome {
  if (typeof left !== "number" || typeof right !== "number") {
    return {
      ok: false,
      error: RuntimeErrors.typeMismatch(
        `"${operator}" requires two number operands, got ${describeType(left)} and ${describeType(right)}.`,
        span
      )
    };
  }
  switch (operator) {
    case "<":
      return { ok: true, value: left < right };
    case "<=":
      return { ok: true, value: left <= right };
    case ">":
      return { ok: true, value: left > right };
    case ">=":
      return { ok: true, value: left >= right };
  }
}
