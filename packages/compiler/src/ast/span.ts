/**
 * A single position in AfterText source: 1-based line, 1-based column,
 * and a 0-based absolute character offset into the source string.
 */
export interface SourcePosition {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

/**
 * A half-open range `[start, end)` in AfterText source. Every AST node that
 * originates from source text carries one of these so downstream tools
 * (editors, error reporters) can map back to the original text.
 */
export interface SourceSpan {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}
