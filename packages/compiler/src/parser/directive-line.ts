export const SIMPLE_PRESENTATION_DIRECTIVES = [
  "background",
  "layer",
  "camera",
  "music",
  "sfx",
  "pause"
] as const;

export type SimplePresentationDirective = (typeof SIMPLE_PRESENTATION_DIRECTIVES)[number];

/** Every directive name recognized in AfterText v0.1. */
export const REGISTERED_DIRECTIVES = new Set<string>([
  "scene",
  ...SIMPLE_PRESENTATION_DIRECTIVES,
  "set",
  "goto",
  "if",
  "elseif",
  "else",
  "end",
  "variant",
  "when",
  "otherwise",
  "choice"
]);

export interface ParsedDirectiveLine {
  readonly name: string;
  /** Raw text following the directive name, trimmed; empty string if none. */
  readonly args: string;
  /** 0-based character index within the line where `args` begins. */
  readonly argsStartColumn: number;
}

const DIRECTIVE_NAME_PATTERN = /^@([A-Za-z][A-Za-z0-9_-]*)/;

// The characters `.` does not match. A directive's argument text must not
// contain any of them (the line is then not a directive at all).
const LINE_TERMINATOR_PATTERN = /[\n\r\u2028\u2029]/;

const LEADING_SEPARATOR_PATTERN = /^[ \t]+/;

/**
 * Recognizes a line as an AfterText directive: it must begin with `@` at
 * column 1 (no leading whitespace — v0.1 does not support indented
 * directives) with a name matching the directive grammar. Returns `null`
 * for lines that are not shaped like a directive at all.
 *
 * Deliberately not one regular expression with a trailing `(.*)$`: a long
 * separator run followed by a line terminator that `.` cannot match made
 * that pattern backtrack quadratically on adversarial input. The name is
 * matched by a pattern that cannot backtrack across the rest of the line,
 * and the remainder is checked with two linear steps.
 */
export function matchDirectiveLine(text: string): ParsedDirectiveLine | null {
  const match = DIRECTIVE_NAME_PATTERN.exec(text);
  if (!match) return null;

  const name = match[1] as string;
  const rest = text.slice(match[0].length);
  if (rest === "") {
    return { name, args: "", argsStartColumn: text.length };
  }

  // After the name only `[ \t]+` followed by terminator-free text is a directive.
  const separator = LEADING_SEPARATOR_PATTERN.exec(rest);
  if (separator === null || LINE_TERMINATOR_PATTERN.test(rest)) return null;
  const rawArgs = rest.slice(separator[0].length);

  const argsStartColumn = text.indexOf(rawArgs, name.length + 1);
  return { name, args: rawArgs.trimEnd(), argsStartColumn: argsStartColumn === -1 ? text.length : argsStartColumn };
}

/** True when a line is an escaped literal `@`-line: `\@example`. */
export function matchEscapedAtLine(text: string): string | null {
  if (text.startsWith("\\@")) {
    return text.slice(1);
  }
  return null;
}
