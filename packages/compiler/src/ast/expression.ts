import type { SourceSpan } from "./span.js";

/** A literal value permitted inside AfterText expressions. */
export type LiteralValue = string | number | boolean | null;

export type UnaryOperator = "!" | "-";

export type BinaryOperator =
  | "*"
  | "/"
  | "%"
  | "+"
  | "-"
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!="
  | "&&"
  | "||";

export interface LiteralExpression {
  readonly type: "Literal";
  readonly value: LiteralValue;
  readonly span: SourceSpan;
}

export interface IdentifierExpression {
  readonly type: "Identifier";
  readonly name: string;
  readonly span: SourceSpan;
}

export interface UnaryExpression {
  readonly type: "Unary";
  readonly operator: UnaryOperator;
  readonly argument: ExpressionNode;
  readonly span: SourceSpan;
}

export interface BinaryExpression {
  readonly type: "Binary";
  readonly operator: BinaryOperator;
  readonly left: ExpressionNode;
  readonly right: ExpressionNode;
  readonly span: SourceSpan;
}

/**
 * A call, `callee(args...)`. This is a syntax/AST primitive only: it does
 * not mean user-defined functions, callable values, or a general standard
 * library exist. `callee` is a plain name, never itself an expression (no
 * member calls, no calling a computed value) — only a small, fixed set of
 * compiler/runtime-approved builtin names may execute (see
 * docs/CORE_SPEC.md Section 17.14). `args` stays structurally general
 * (ordinary comma-separated expressions) so a future builtin with a
 * different argument contract does not require redesigning this node;
 * individual builtins impose their own, narrower argument rules through
 * semantic validation, not through this AST shape.
 */
export interface CallExpression {
  readonly type: "Call";
  readonly callee: string;
  readonly args: readonly ExpressionNode[];
  readonly span: SourceSpan;
}

/**
 * AfterText expression AST. A discriminated union on `type`, deliberately
 * excluding member access, indexing, arrays, objects, and assignment:
 * `@set` is the only state-mutation syntax in v0.1. `Call` (added for
 * Reader Memory queries, Section 17.14) is a fixed-builtin-only primitive,
 * not a general function-call feature — see `CallExpression` above.
 */
export type ExpressionNode =
  | LiteralExpression
  | IdentifierExpression
  | UnaryExpression
  | BinaryExpression
  | CallExpression;
