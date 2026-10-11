import type { SourcePosition, SourceSpan } from "../ast/span.js";
import type {
  BinaryOperator,
  CallExpression,
  ExpressionNode,
  UnaryOperator
} from "../ast/expression.js";
import {
  ExpressionSyntaxError,
  tokenizeExpression,
  type ExpressionToken
} from "./expression-lexer.js";
import { MAX_EXPRESSION_DEPTH } from "../limits.js";

export { ExpressionSyntaxError };

const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6
};

const UNARY_OPERATORS = new Set(["!", "-"]);

/**
 * Precedence-climbing (Pratt) parser for AfterText expressions. `basePosition`
 * anchors the (single-line) expression text back into the source document so
 * every produced node carries an accurate SourceSpan.
 */
class ExpressionParser {
  private readonly tokens: readonly ExpressionToken[];
  private pos = 0;
  /** Current parser recursion depth (parentheses, unary chains, call arguments). */
  private depth = 0;
  /** Height of every node built so far, so left-deep chains are bounded too. */
  private readonly heights = new WeakMap<ExpressionNode, number>();

  constructor(
    source: string,
    private readonly basePosition: SourcePosition
  ) {
    this.tokens = tokenizeExpression(source);
  }

  parseProgram(): ExpressionNode {
    const expr = this.parseExpression(0);
    const trailing = this.current();
    if (trailing.type !== "eof") {
      throw new ExpressionSyntaxError(
        `unexpected token "${trailing.text}"`,
        trailing.start
      );
    }
    return expr;
  }

  private current(): ExpressionToken {
    return this.tokens[this.pos] as ExpressionToken;
  }

  private advance(): ExpressionToken {
    const token = this.current();
    if (token.type !== "eof") this.pos += 1;
    return token;
  }

  private spanFor(start: number, end: number): SourceSpan {
    return {
      start: this.positionAt(start),
      end: this.positionAt(end)
    };
  }

  private positionAt(charOffset: number): SourcePosition {
    return {
      line: this.basePosition.line,
      column: this.basePosition.column + charOffset,
      offset: this.basePosition.offset + charOffset
    };
  }

  private heightOf(node: ExpressionNode): number {
    return this.heights.get(node) ?? 1;
  }

  /** Records `node`'s height (one more than its tallest child) and enforces the depth limit. */
  private track<T extends ExpressionNode>(node: T, children: readonly ExpressionNode[], offset: number): T {
    let tallest = 0;
    for (const child of children) tallest = Math.max(tallest, this.heightOf(child));
    const height = tallest + 1;
    if (height > MAX_EXPRESSION_DEPTH) this.tooDeep(offset);
    this.heights.set(node, height);
    return node;
  }

  private tooDeep(offset: number): never {
    throw new ExpressionSyntaxError(`expression is nested too deeply (limit ${MAX_EXPRESSION_DEPTH})`, offset);
  }

  private enter(): void {
    this.depth += 1;
    if (this.depth > MAX_EXPRESSION_DEPTH) this.tooDeep(this.current().start);
  }

  private parseExpression(minPrecedence: number): ExpressionNode {
    this.enter();
    try {
      return this.parseExpressionBody(minPrecedence);
    } finally {
      this.depth -= 1;
    }
  }

  private parseExpressionBody(minPrecedence: number): ExpressionNode {
    let left = this.parseUnary();

    for (;;) {
      const token = this.current();
      if (token.type !== "punct") break;
      const precedence = BINARY_PRECEDENCE[token.text];
      if (precedence === undefined || precedence < minPrecedence) break;

      this.advance();
      const right = this.parseExpression(precedence + 1);
      left = this.track(
        {
          type: "Binary",
          operator: token.text as BinaryOperator,
          left,
          right,
          span: this.spanFor(left.span.start.offset - this.basePosition.offset, right.span.end.offset - this.basePosition.offset)
        },
        [left, right],
        token.start
      );
    }

    return left;
  }

  private parseUnary(): ExpressionNode {
    this.enter();
    try {
      const token = this.current();
      if (token.type === "punct" && UNARY_OPERATORS.has(token.text)) {
        this.advance();
        const argument = this.parseUnary();
        return this.track(
          {
            type: "Unary",
            operator: token.text as UnaryOperator,
            argument,
            span: this.spanFor(token.start, argument.span.end.offset - this.basePosition.offset)
          },
          [argument],
          token.start
        );
      }
      return this.parsePrimary();
    } finally {
      this.depth -= 1;
    }
  }

  private parsePrimary(): ExpressionNode {
    const token = this.current();

    switch (token.type) {
      case "number":
        if (!Number.isFinite(token.numberValue)) {
          throw new ExpressionSyntaxError(
            "numeric literal is not representable as a finite number",
            token.start,
            "AT2005",
            token.end
          );
        }
        this.advance();
        return {
          type: "Literal",
          value: token.numberValue as number,
          span: this.spanFor(token.start, token.end)
        };
      case "string":
        this.advance();
        return {
          type: "Literal",
          value: token.stringValue as string,
          span: this.spanFor(token.start, token.end)
        };
      case "true":
      case "false":
        this.advance();
        return {
          type: "Literal",
          value: token.type === "true",
          span: this.spanFor(token.start, token.end)
        };
      case "null":
        this.advance();
        return { type: "Literal", value: null, span: this.spanFor(token.start, token.end) };
      case "identifier": {
        this.advance();
        if (this.current().type === "punct" && this.current().text === "(") {
          return this.parseCall(token);
        }
        return {
          type: "Identifier",
          name: token.text,
          span: this.spanFor(token.start, token.end)
        };
      }
      case "punct":
        if (token.text === "(") {
          this.advance();
          const inner = this.parseExpression(0);
          const closing = this.current();
          if (!(closing.type === "punct" && closing.text === ")")) {
            throw new ExpressionSyntaxError('expected ")"', closing.start);
          }
          this.advance();
          return inner;
        }
        throw new ExpressionSyntaxError(`unexpected token "${token.text}"`, token.start);
      case "eof":
        throw new ExpressionSyntaxError("unexpected end of expression", token.start);
      default:
        throw new ExpressionSyntaxError(`unexpected token "${token.text}"`, token.start);
    }
  }

  /**
   * Parses `(args...)` immediately following an already-consumed identifier
   * token, producing a `CallExpression`. Purely structural — arguments are
   * ordinary, general expressions; whether `nameToken`'s text is a known
   * builtin, and whether the arguments satisfy that builtin's contract, is
   * not the parser's concern (semantic validation, docs/CORE_SPEC.md
   * Section 17.16).
   */
  private parseCall(nameToken: ExpressionToken): CallExpression {
    this.advance(); // consume "("
    const args: ExpressionNode[] = [];

    if (!(this.current().type === "punct" && this.current().text === ")")) {
      args.push(this.parseExpression(0));
      while (this.current().type === "punct" && this.current().text === ",") {
        this.advance();
        args.push(this.parseExpression(0));
      }
    }

    const closing = this.current();
    if (!(closing.type === "punct" && closing.text === ")")) {
      throw new ExpressionSyntaxError('expected ")"', closing.start);
    }
    this.advance();

    return this.track(
      {
        type: "Call",
        callee: nameToken.text,
        args,
        span: this.spanFor(nameToken.start, closing.end)
      },
      args,
      nameToken.start
    );
  }
}

/**
 * Parses a single-line AfterText expression, anchoring produced spans at
 * `basePosition` (the position of the expression text's first character
 * within the full source document).
 *
 * @throws {ExpressionSyntaxError} on malformed input.
 */
export function parseExpression(source: string, basePosition: SourcePosition): ExpressionNode {
  if (source.trim().length === 0) {
    throw new ExpressionSyntaxError("expected an expression", 0);
  }
  return new ExpressionParser(source, basePosition).parseProgram();
}
