import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString as mdastToString } from "mdast-util-to-string";
import type {
  Content as MdastContent,
  Heading as MdastHeading,
  Paragraph as MdastParagraph,
  Parent as MdastParent,
  Root as MdastRoot
} from "mdast";
import type { Position as MdastPosition } from "unist";
import type { SourcePosition, SourceSpan } from "../ast/span.js";
import type { HeadingNode, ParagraphNode, StoryBlock } from "../ast/story.js";
import type { InlineNode } from "../ast/inline.js";
import { Diagnostics } from "../diagnostics/codes.js";
import type { Diagnostic } from "../diagnostics/types.js";
import { SEPARATOR_WHITESPACE_PATTERN } from "./lexical-primitives.js";

/**
 * Bridges remark's mdast into AfterText-owned AST types. mdast/unified
 * types are used only inside this module — nothing from `mdast` or
 * `unified` is re-exported from the compiler's public API. This is the
 * one place allowed to "leak" parser-library concepts, and it does so by
 * translation, not by re-export.
 */
const markdownProcessor = unified().use(remarkParse);

interface ChunkAnchor {
  /** 1-based line number of the chunk's first line in the full document. */
  readonly startLine: number;
  /** Absolute character offset of the chunk's first character in the full document. */
  readonly startOffset: number;
}

function remapPosition(pos: SourcePosition, anchor: ChunkAnchor): SourcePosition {
  return {
    line: anchor.startLine + (pos.line - 1),
    column: pos.column,
    offset: anchor.startOffset + pos.offset
  };
}

function remapSpan(position: MdastPosition | undefined, anchor: ChunkAnchor): SourceSpan {
  if (!position) {
    const zero: SourcePosition = { line: anchor.startLine, column: 1, offset: anchor.startOffset };
    return { start: zero, end: zero };
  }
  return {
    start: remapPosition(
      { line: position.start.line, column: position.start.column, offset: position.start.offset ?? 0 },
      anchor
    ),
    end: remapPosition(
      { line: position.end.line, column: position.end.column, offset: position.end.offset ?? 0 },
      anchor
    )
  };
}

function convertInlineChildren(
  children: readonly MdastContent[],
  anchor: ChunkAnchor,
  diagnostics: Diagnostic[]
): InlineNode[] {
  const result: InlineNode[] = [];
  for (const child of children) {
    const node = convertInline(child, anchor, diagnostics);
    if (node) result.push(node);
  }
  return result;
}

function convertInline(node: MdastContent, anchor: ChunkAnchor, diagnostics: Diagnostic[]): InlineNode | undefined {
  const span = remapSpan(node.position, anchor);
  switch (node.type) {
    case "text":
      return { type: "Text", value: node.value, span };
    case "emphasis":
      return { type: "Emphasis", children: convertInlineChildren(node.children, anchor, diagnostics), span };
    case "strong":
      return { type: "Strong", children: convertInlineChildren(node.children, anchor, diagnostics), span };
    case "inlineCode":
      return { type: "InlineCode", value: node.value, span };
    case "link":
      return {
        type: "Link",
        url: node.url,
        children: convertInlineChildren(node.children, anchor, diagnostics),
        span
      };
    case "break":
      return { type: "LineBreak", span };
    default: {
      // Fallback for inline constructs outside v0.1's supported subset
      // (images, footnotes, raw html, ...): flatten to plain text rather
      // than reimplementing the rest of Markdown's inline grammar, but
      // warn so this doesn't silently change document meaning.
      diagnostics.push(Diagnostics.unsupportedMarkdown(node.type, span));
      const text = mdastToString(node);
      return text.length > 0 ? { type: "Text", value: text, span } : undefined;
    }
  }
}

/**
 * Advances `position` forward by `count` characters on the same source
 * line. Safe only when the caller knows the scan cannot cross a line
 * ending — true for an ATX Heading's own opening-marker/separator region,
 * which is always confined to that Heading's single physical line.
 */
function advancePositionOnLine(position: SourcePosition, count: number): SourcePosition {
  return { line: position.line, column: position.column + count, offset: position.offset + count };
}

/**
 * Computes `HeadingNode.contentSourceSpan` for a Heading with zero inline
 * children (an empty authored ATX Heading — Setext Headings cannot have
 * empty content, see docs/CORE_SPEC.md Section 25.49). Scans forward
 * from immediately after the opening `#` marker run, consuming contiguous
 * separator whitespace, bounded by `span.end.offset` — which already
 * excludes the line ending but includes any trailing whitespace and any
 * recognized ATX closing-hash run. Stopping at the first non-whitespace
 * character (or at `span.end.offset`) therefore lands exactly before a
 * closing-hash run when one is present, or at the end of trailing
 * whitespace when one is not — in both cases the correct zero-width
 * position, derived purely from already-computed facts (never a second
 * Markdown parser).
 */
function computeEmptyHeadingContentSpan(
  depth: number,
  span: SourceSpan,
  chunkText: string,
  anchor: ChunkAnchor
): SourceSpan {
  const markerEnd = advancePositionOnLine(span.start, depth);
  let offset = markerEnd.offset;
  const upperBound = span.end.offset;
  while (offset < upperBound && SEPARATOR_WHITESPACE_PATTERN.test(chunkText[offset - anchor.startOffset]!)) {
    offset++;
  }
  const position = advancePositionOnLine(markerEnd, offset - markerEnd.offset);
  return { start: position, end: position };
}

/**
 * Computes `HeadingNode.contentSourceSpan` for a Heading with at least one
 * inline child: the first child's span start through the last child's span
 * end already excludes the opening marker/separator, any recognized ATX
 * closing-hash run, trailing Heading whitespace, the Setext underline, and
 * the line ending — confirmed sufficient by investigation, zero additional
 * computation needed.
 */
function computeNonemptyHeadingContentSpan(children: readonly InlineNode[]): SourceSpan {
  const first = children[0]!;
  const last = children[children.length - 1]!;
  return { start: first.span.start, end: last.span.end };
}

/**
 * Computes `HeadingNode.levelSourceSpan` (docs/CORE_SPEC.md Section
 * 25.50). ATX and Setext style is distinguished purely from already-
 * published `span` facts — `span.start.line === span.end.line` for ATX
 * (a single physical line) vs. Setext (always two-or-more physical lines,
 * content plus underline) — an architectural source fact, not a heuristic,
 * confirmed by investigation with no counterexample found.
 *
 * ATX: the opening marker run is exactly `[span.start.offset,
 * span.start.offset + depth)` — the same fact `computeEmptyHeadingContentSpan`
 * already uses to find the marker's end.
 *
 * Setext: the underline character run sits on the Heading's own final
 * physical line, which `span.end` already terminates (excluding the line
 * ending but including underline trailing whitespace). Scanning backward
 * from `span.end.offset` — first past trailing separator whitespace, then
 * past the homogeneous run of the underline character itself — locates the
 * run's exact boundaries. Both scans are bounded within `chunkText`, which
 * this module already holds for the current prose chunk; this is the same
 * bounded-scan technique `computeEmptyHeadingContentSpan` already uses, not
 * a second Markdown parser. Safe because every character involved (marker
 * indentation, the underline run, and trailing whitespace) is ASCII and
 * confined to one physical line, so offset and column move in lockstep.
 */
function computeHeadingLevelSpan(span: SourceSpan, depth: number, chunkText: string, anchor: ChunkAnchor): SourceSpan {
  if (span.start.line === span.end.line) {
    return { start: span.start, end: advancePositionOnLine(span.start, depth) };
  }
  const charAt = (offset: number): string => chunkText[offset - anchor.startOffset]!;
  let endOffset = span.end.offset;
  while (endOffset > span.start.offset && SEPARATOR_WHITESPACE_PATTERN.test(charAt(endOffset - 1))) {
    endOffset--;
  }
  const markerChar = charAt(endOffset - 1);
  let startOffset = endOffset;
  while (startOffset > span.start.offset && charAt(startOffset - 1) === markerChar) {
    startOffset--;
  }
  const end: SourcePosition = {
    line: span.end.line,
    column: span.end.column - (span.end.offset - endOffset),
    offset: endOffset
  };
  const start: SourcePosition = {
    line: span.end.line,
    column: end.column - (endOffset - startOffset),
    offset: startOffset
  };
  return { start, end };
}

function convertBlock(node: MdastContent, anchor: ChunkAnchor, diagnostics: Diagnostic[], chunkText: string): StoryBlock {
  const span = remapSpan(node.position, anchor);
  if (node.type === "paragraph") {
    const paragraph = node as MdastParagraph;
    const result: ParagraphNode = {
      type: "Paragraph",
      children: convertInlineChildren(paragraph.children, anchor, diagnostics),
      span
    };
    return result;
  }
  if (node.type === "heading") {
    const heading = node as MdastHeading;
    const children = convertInlineChildren(heading.children, anchor, diagnostics);
    const contentSourceSpan =
      children.length > 0
        ? computeNonemptyHeadingContentSpan(children)
        : computeEmptyHeadingContentSpan(heading.depth, span, chunkText, anchor);
    const levelSourceSpan = computeHeadingLevelSpan(span, heading.depth, chunkText, anchor);
    const result: HeadingNode = {
      type: "Heading",
      depth: heading.depth,
      children,
      span,
      contentSourceSpan,
      levelSourceSpan
    };
    return result;
  }

  // Fallback for block constructs outside v0.1's supported subset (lists,
  // blockquotes, code fences, tables, ...): rendered as a plain paragraph
  // of their flattened text so no source content is silently dropped, but
  // warn so this doesn't silently change document meaning.
  diagnostics.push(Diagnostics.unsupportedMarkdown(node.type, span));
  const text = mdastToString(node);
  const fallback: ParagraphNode = {
    type: "Paragraph",
    children: text.length > 0 ? [{ type: "Text", value: text, span }] : [],
    span
  };
  return fallback;
}

/**
 * Parses a contiguous run of prose source text (already known to contain no
 * AfterText directives) as Markdown, converting the result into
 * AfterText-owned StoryBlock nodes anchored back to the full document via
 * `anchor`. Constructs outside v0.1's supported subset (lists, blockquotes,
 * images, code blocks, ...) still fall back to flattened plain text, but
 * emit an AT3001 warning rather than changing document meaning silently.
 */
export function parseProseChunk(text: string, anchor: ChunkAnchor, diagnostics: Diagnostic[]): StoryBlock[] {
  const root = markdownProcessor.parse(text) as MdastRoot;
  const parent = root as MdastParent;
  return parent.children.map((child) => convertBlock(child as MdastContent, anchor, diagnostics, text));
}

export type { ChunkAnchor };
