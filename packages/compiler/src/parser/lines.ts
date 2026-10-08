import type { SourcePosition } from "../ast/span.js";

/** One physical line of source, with its absolute offsets in the full source string. */
export interface SourceLine {
  /** 1-based line number. */
  readonly number: number;
  /** Offset of the first character of this line (before any trailing \r\n stripping). */
  readonly startOffset: number;
  /** Offset just past the last content character, excluding the line terminator. */
  readonly endOffset: number;
  /** Line text with any trailing \r\n / \n stripped. */
  readonly text: string;
  /** Length of the line terminator that followed this line: 0, 1 (\n) or 2 (\r\n). */
  readonly newlineLength: 0 | 1 | 2;
}

/**
 * Splits source into lines while tracking absolute offsets, so downstream
 * AST nodes can carry accurate SourceSpans back into the original text.
 */
export function splitLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  let lineNumber = 1;

  for (let i = 0; i <= source.length; i++) {
    if (i === source.length || source[i] === "\n") {
      let end = i;
      let newlineLength: 0 | 1 | 2 = i === source.length ? 0 : 1;
      if (end > start && source[end - 1] === "\r") {
        end -= 1;
        newlineLength = 2;
      }
      lines.push({
        number: lineNumber,
        startOffset: start,
        endOffset: end,
        text: source.slice(start, end),
        newlineLength
      });
      lineNumber += 1;
      start = i + 1;
    }
  }

  return lines;
}

/** The position of the start of a line (column 1). */
export function lineStart(line: SourceLine): SourcePosition {
  return { line: line.number, column: 1, offset: line.startOffset };
}

/** The position just past the end of a line's content. */
export function lineEnd(line: SourceLine): SourcePosition {
  return {
    line: line.number,
    column: line.endOffset - line.startOffset + 1,
    offset: line.endOffset
  };
}

/**
 * Reconstructs the exact original source text spanned by a contiguous run
 * of lines (including original line terminators), so it can be re-parsed
 * (e.g. by remark) with offsets that stay in lockstep with the full source.
 */
export function joinLineText(lines: readonly SourceLine[]): string {
  return lines
    .map((line) => line.text + (line.newlineLength === 2 ? "\r\n" : line.newlineLength === 1 ? "\n" : ""))
    .join("");
}

/** Position of a given 0-based character index within a line's text. */
export function positionAt(line: SourceLine, charIndex: number): SourcePosition {
  return {
    line: line.number,
    column: charIndex + 1,
    offset: line.startOffset + charIndex
  };
}
