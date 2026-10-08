export type ExpressionTokenType =
  | "number"
  | "string"
  | "identifier"
  | "true"
  | "false"
  | "null"
  | "punct"
  | "eof";

export interface ExpressionToken {
  readonly type: ExpressionTokenType;
  /** Raw text for punct/identifier tokens; decoded value lives on literal tokens below. */
  readonly text: string;
  readonly numberValue?: number;
  readonly stringValue?: string;
  /** 0-based offsets into the expression source text. */
  readonly start: number;
  readonly end: number;
}

/**
 * `code` and `endOffset` are optional and exist solely so a non-finite
 * numeric literal (docs/CORE_SPEC.md Section 24.6) can be reported as
 * AT2005 with its own token span instead of the default AT2001 zero-width
 * point every other syntax error uses — every other throw site is
 * unaffected and keeps producing AT2001 via the default.
 */
export class ExpressionSyntaxError extends Error {
  constructor(
    message: string,
    readonly offset: number,
    readonly code: "AT2001" | "AT2005" = "AT2001",
    readonly endOffset: number = offset
  ) {
    super(message);
    this.name = "ExpressionSyntaxError";
  }
}

/**
 * Words the expression lexer always tokenizes as literals, never as
 * identifiers. A `@set` variable with one of these names could be assigned
 * but never read back, so `parseSet` rejects them. Shared here so the lexer
 * and the Set name check cannot drift apart.
 */
export const RESERVED_VARIABLE_NAMES: ReadonlySet<string> = new Set([
  "true",
  "false",
  "null"
]);

const PUNCTUATION: readonly string[] = [
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "!",
  "-",
  "+",
  "*",
  "/",
  "%",
  "<",
  ">",
  "(",
  ")",
  ","
];

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

export type VariableNameProblem = "invalid-identifier" | "reserved-literal";

/**
 * Why `name` cannot be a story-state variable name, or `undefined` if it can.
 * Single authority for the identifier grammar (`[A-Za-z_][A-Za-z0-9_]*`, the
 * same one the lexer uses for identifier tokens) and the reserved literal
 * words, used by frontmatter `state:` key validation. `@set` names are
 * constrained by `SET_PATTERN` plus `RESERVED_VARIABLE_NAMES` in the block
 * parser; `__proto__` is deliberately NOT handled here (frontmatter-only
 * policy, see CORE_SPEC Section 12).
 */
export function variableNameProblem(name: string): VariableNameProblem | undefined {
  if (name.length === 0 || !isIdentifierStart(name[0] as string)) return "invalid-identifier";
  for (let i = 1; i < name.length; i++) {
    if (!isIdentifierPart(name[i] as string)) return "invalid-identifier";
  }
  return RESERVED_VARIABLE_NAMES.has(name) ? "reserved-literal" : undefined;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

export function tokenizeExpression(source: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i] as string;

    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }

    if (isDigit(ch)) {
      const start = i;
      while (i < n && isDigit(source[i] as string)) i += 1;
      if (i < n && source[i] === "." && isDigit(source[i + 1] ?? "")) {
        i += 1;
        while (i < n && isDigit(source[i] as string)) i += 1;
      }
      const text = source.slice(start, i);
      tokens.push({
        type: "number",
        text,
        numberValue: Number(text),
        start,
        end: i
      });
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i += 1;
      let value = "";
      let closed = false;
      while (i < n) {
        const c = source[i] as string;
        if (c === quote) {
          i += 1;
          closed = true;
          break;
        }
        if (c === "\\" && i + 1 < n) {
          const next = source[i + 1] as string;
          const escapes: Record<string, string> = {
            n: "\n",
            t: "\t",
            r: "\r",
            "\\": "\\",
            '"': '"',
            "'": "'"
          };
          value += escapes[next] ?? next;
          i += 2;
          continue;
        }
        value += c;
        i += 1;
      }
      if (!closed) {
        throw new ExpressionSyntaxError("unterminated string literal", start);
      }
      tokens.push({ type: "string", text: source.slice(start, i), stringValue: value, start, end: i });
      continue;
    }

    if (isIdentifierStart(ch)) {
      const start = i;
      while (i < n && isIdentifierPart(source[i] as string)) i += 1;
      const text = source.slice(start, i);
      if (RESERVED_VARIABLE_NAMES.has(text)) {
        tokens.push({ type: text as "true" | "false" | "null", text, start, end: i });
      } else {
        tokens.push({ type: "identifier", text, start, end: i });
      }
      continue;
    }

    const punct = PUNCTUATION.find((p) => source.startsWith(p, i));
    if (punct) {
      tokens.push({ type: "punct", text: punct, start: i, end: i + punct.length });
      i += punct.length;
      continue;
    }

    throw new ExpressionSyntaxError(`unexpected character "${ch}"`, i);
  }

  tokens.push({ type: "eof", text: "", start: n, end: n });
  return tokens;
}
