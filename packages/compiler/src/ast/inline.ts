import type { SourceSpan } from "./span.js";

/**
 * Inline content types produced by converting prose regions out of the
 * Markdown parser's AST. This is intentionally a small subset of Markdown's
 * inline grammar (see architecture notes in parser/markdown.ts) — AfterText
 * v0.1 does not attempt to reimplement the complete Markdown spec.
 */
export interface TextInline {
  readonly type: "Text";
  readonly value: string;
  readonly span: SourceSpan;
}

export interface EmphasisInline {
  readonly type: "Emphasis";
  readonly children: readonly InlineNode[];
  readonly span: SourceSpan;
}

export interface StrongInline {
  readonly type: "Strong";
  readonly children: readonly InlineNode[];
  readonly span: SourceSpan;
}

export interface InlineCodeInline {
  readonly type: "InlineCode";
  readonly value: string;
  readonly span: SourceSpan;
}

export interface LinkInline {
  readonly type: "Link";
  readonly url: string;
  readonly children: readonly InlineNode[];
  readonly span: SourceSpan;
}

export interface LineBreakInline {
  readonly type: "LineBreak";
  readonly span: SourceSpan;
}

export type InlineNode =
  | TextInline
  | EmphasisInline
  | StrongInline
  | InlineCodeInline
  | LinkInline
  | LineBreakInline;
