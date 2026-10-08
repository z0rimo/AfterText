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

const DIRECTIVE_PATTERN = /^@([A-Za-z][A-Za-z0-9_-]*)(?:[ \t]+(.*))?$/;

/**
 * Recognizes a line as an AfterText directive: it must begin with `@` at
 * column 1 (no leading whitespace — v0.1 does not support indented
 * directives) with a name matching the directive grammar. Returns `null`
 * for lines that are not shaped like a directive at all.
 */
export function matchDirectiveLine(text: string): ParsedDirectiveLine | null {
  const match = DIRECTIVE_PATTERN.exec(text);
  if (!match) return null;

  const name = match[1] as string;
  const rawArgs = match[2];
  if (rawArgs === undefined) {
    return { name, args: "", argsStartColumn: text.length };
  }

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
