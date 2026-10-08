import type { ExpressionNode } from "./expression.js";
import type { InlineNode } from "./inline.js";
import type { PresentationCommand } from "./presentation.js";
import type { SourcePosition, SourceSpan } from "./span.js";

/** A state value allowed in v0.1 frontmatter `state:` and in `@set`. */
export type StateValue = string | number | boolean | null;

/**
 * The story's initial state, declared in frontmatter's `state:` block and
 * normalized into a plain map. First-class on StoryDocument — not folded
 * into generic metadata — since it is the seed for runtime story state,
 * a distinct concern from title/entry.
 */
export type StoryStateDefinition = Readonly<Record<string, StateValue>>;

export interface StoryMetadata {
  readonly title: string | undefined;
  readonly entry: string | undefined;
  /** Absent when the source had no frontmatter block. */
  readonly span: SourceSpan | undefined;
}

// ---------------------------------------------------------------------------
// Markdown-derived prose blocks
// ---------------------------------------------------------------------------

export interface ParagraphNode {
  readonly type: "Paragraph";
  readonly children: readonly InlineNode[];
  readonly span: SourceSpan;
}

export interface HeadingNode {
  readonly type: "Heading";
  readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
  readonly children: readonly InlineNode[];
  readonly span: SourceSpan;
  /**
   * The exact authored Heading content bytes, excluding the opening marker,
   * opening separator whitespace, any recognized ATX closing-hash sequence,
   * trailing Heading syntax/whitespace, the Setext underline (and its
   * indentation), and the line ending. Non-optional: an empty ATX Heading
   * (e.g. `#`) still has a valid zero-width `contentSourceSpan` rather than
   * `undefined` — see docs/CORE_SPEC.md Section 25.49. This is the sole
   * patch target for Heading Structured Editing; never reconstruct source
   * from `children`, which is not lossless (delimiter choice, escaping,
   * spacing, and closing-hash/underline syntax are not AST-preserved).
   */
  readonly contentSourceSpan: SourceSpan;
  /**
   * The exact authored Heading *level* marker bytes, excluding everything
   * else: for ATX, exactly the opening `#` run (e.g. `###` in
   * `###   Heading ###`), excluding separator whitespace, content, closing
   * hashes, trailing whitespace, and the line ending; for Setext, exactly
   * the underline character run (e.g. `=======` in `Heading\n=======`),
   * excluding content, the line ending before the underline, underline
   * indentation, underline trailing whitespace, and the line ending after.
   * Non-optional: every Heading has a valid, non-zero-width level span.
   * This is the sole patch target for Heading Level Editing — changing only
   * this span changes `depth` while preserving authored style and content
   * exactly. docs/CORE_SPEC.md Section 25.50.
   */
  readonly levelSourceSpan: SourceSpan;
}

// ---------------------------------------------------------------------------
// Simple presentation directives: @background, @layer, @camera, @music,
// @sfx, @pause. The directive is parsed, validated, and normalized (units,
// numeric params) into a typed PresentationCommand at compile time — see
// ast/presentation.ts — so runtime code never re-parses directive strings.
// ---------------------------------------------------------------------------

export interface PresentationNode {
  readonly type: "Presentation";
  readonly command: PresentationCommand;
  readonly span: SourceSpan;
  /**
   * Compiler/source-tooling metadata (docs/CORE_SPEC.md Section 25.36):
   * absolute source spans of each recognized `key=value` parameter's
   * authored VALUE text (e.g. `to=1.20` maps `"to"` to the span slicing
   * exactly `1.20`, never `to=` or surrounding whitespace). Optional on
   * this public type only so existing hand-constructed `PresentationNode`
   * object literals (tests, downstream tooling) remain source-compatible —
   * every `PresentationNode` the compiler itself produces always populates
   * it (an empty record when the directive has no named parameters). Not
   * part of `PresentationCommand`, never read by Runtime/Player, and does
   * not change DSL semantics — this is source-analysis data only, enabling
   * targeted, formatting-preserving source edits without re-parsing.
   */
  readonly parameterValueSpans?: Readonly<Record<string, SourceSpan>>;
  /**
   * Compiler/source-tooling metadata (docs/CORE_SPEC.md Section 25.36):
   * the absolute source span of the directive's single authored positional
   * (non-`key=value`) argument token — e.g. `@pause 0.50s` maps this to the
   * span slicing exactly `0.50s`. Populated if and only if the directive's
   * argument text contains exactly one positional token; `undefined` when
   * there are zero, or two-or-more, positional tokens. `undefined` does
   * **not** mean "no positional value was authored" — with two or more
   * positional tokens, the parser's own semantic value is a synthetic
   * join of non-contiguous source text (e.g. a named parameter may sit
   * between two positional tokens), so no single `SourceSpan` could
   * represent it without also covering unrelated source; no such span is
   * ever synthesized. Optional on this public type for the same
   * source-compatibility reason as `parameterValueSpans`.
   */
  readonly positionalValueSpan?: SourceSpan;
  /**
   * Compiler/source-tooling metadata (docs/CORE_SPEC.md Section 14): the
   * absolute source position immediately after the final non-whitespace
   * character of the directive's authored argument text, before any
   * trailing line whitespace and before the line terminator. Populated for
   * every successfully-parsed compiler-produced `PresentationNode`,
   * regardless of directive kind. Never derived from `span.end`, which
   * includes trailing line whitespace and is therefore unsafe as a source-
   * tooling append anchor. Optional on this public type for the same
   * source-compatibility reason as `parameterValueSpans`/
   * `positionalValueSpan`.
   */
  readonly argumentsEndPosition?: SourcePosition;
  /**
   * Compiler/source-tooling metadata (docs/CORE_SPEC.md Section 14): for
   * a recognized named (`key=value`) parameter, the absolute source span
   * that, deleted via a single text replacement with `""`, removes exactly
   * that parameter's complete authored `key=value` token plus exactly one
   * adjacent authored inter-token separator (chosen so the directive-name-
   * to-first-argument boundary is never touched — see the compiler source
   * for the exact position rule), while preserving every other authored
   * byte of the directive exactly. Populated for key `k` **if and only if**
   * `k` occurs exactly once in the directive's argument text; `undefined`
   * both when `k` is not authored at all and when `k` occurs two-or-more
   * times. **`undefined` does not mean "not authored"** — with duplicate
   * occurrences, the existing last-occurrence-wins `parameterValueSpans`
   * still resolves an effective value, but no single removal range could
   * safely delete "the property" (deleting only the effective last
   * occurrence would silently reveal an earlier duplicate as the new
   * authored value) — the same availability-style principle already
   * documented on `positionalValueSpan`. This is generic, directive-kind-
   * agnostic metadata: it may be populated for any recognized named key,
   * including one a particular tool does not expose Remove support for.
   * Optional on this public type for the same source-compatibility reason
   * as the other metadata fields above.
   */
  readonly parameterRemovalSpans?: Readonly<Record<string, SourceSpan>>;
  /**
   * Compiler/source-tooling metadata (docs/CORE_SPEC.md Section 14): the
   * absolute source span covering every positional (non-`key=value`) token
   * in the directive's argument text, populated **if and only if** at
   * least one positional token exists AND all positional tokens occupy one
   * uninterrupted physical run — i.e. no named `key=value` token occurs
   * between the first and last positional token. Includes all authored
   * inter-token whitespace between positional tokens verbatim (never
   * re-canonicalized, even though the parser's own semantic value joins
   * them with a single space). For exactly one positional token this
   * necessarily covers the identical raw range as `positionalValueSpan` —
   * both are populated in that case, which is expected, not a
   * contradiction; this field does not replace, broaden, or redefine
   * `positionalValueSpan`'s own unchanged one-token-only contract.
   * **`undefined` does not mean "no positional value exists"** — it may
   * also mean positional tokens exist but are physically non-contiguous
   * because a named-parameter token is interleaved among them (the same
   * availability-style principle already documented on
   * `positionalValueSpan`/`parameterRemovalSpans`). Generic and
   * directive-kind-agnostic; optional on this public type for the same
   * source-compatibility reason as the other metadata fields above.
   */
  readonly contiguousPositionalSpan?: SourceSpan;
  /**
   * Compiler/source-tooling metadata (docs/CORE_SPEC.md Section 14): the
   * absolute source span that, deleted via a single text replacement with
   * `""`, removes this entire authored Presentation directive cleanly —
   * `start` is always exactly `span.start` (never adjusted backward into
   * preceding source), and `end` extends `span.end` by this directive's
   * own physical source line's terminator width (0 at true end-of-file, 1
   * for an authored `\n`, 2 for an authored `\r\n`), so deletion never
   * leaves an accidental blank line behind. A directive owns only its own
   * immediately-following line terminator for this purpose — never a
   * preceding terminator, never additional following blank-line trivia,
   * never neighboring block or container syntax. Unlike
   * `parameterRemovalSpans`, there is no ambiguity condition: every
   * successfully-parsed `PresentationNode` has exactly one physical
   * directive line, so this field is always populated for a
   * compiler-produced node. Optional on this public type for the same
   * source-compatibility reason as the other metadata fields above.
   */
  readonly commandRemovalSpan?: SourceSpan;
}

export interface SetNode {
  readonly type: "Set";
  readonly name: string;
  readonly expression: ExpressionNode;
  readonly span: SourceSpan;
  // Exact authored name characters (0-based character offsets). Malformed `@set` forms emit AT2001 and no node,
  // so both field spans are always present on an emitted SetNode.
  readonly nameSourceSpan: SourceSpan;
  // Exact authored expression characters, including grouping parentheses. Never
  // derived from `expression.span`, which excludes parentheses.
  readonly expressionSourceSpan: SourceSpan;
}

export interface GotoNode {
  readonly type: "Goto";
  readonly target: string;
  readonly span: SourceSpan;
  // Exact authored target bytes. Zero-width at the argument start for a
  // malformed empty `@goto`, for metadata completeness only.
  readonly targetSourceSpan: SourceSpan;
}

// ---------------------------------------------------------------------------
// Choice
// ---------------------------------------------------------------------------

export interface ChoiceItem {
  readonly text: string;
  readonly target: string;
  readonly condition: ExpressionNode | undefined;
  readonly span: SourceSpan;

  /**
   * The exact absolute source span of the authored condition text, after
   * the syntactic `if` separator — e.g. for `- Go -> north if (a || b) && c`
   * this slices exactly to `(a || b) && c`. Populated whenever the Choice
   * tail syntactically contains `target if <condition text>`, independently
   * of whether that condition text later parses successfully — it is a
   * source-tooling fact about the Choice grammar's own tail shape, not a
   * semantic-success signal. `undefined` for an unconditional item. A
   * malformed condition has `condition === undefined` while this span is
   * still defined, so test this field (not `condition`) to learn whether a
   * condition was authored.
   *
   * `condition.span` (an `ExpressionNode`'s own span) must NOT be used as a
   * substitute for this field: the expression parser returns the inner node
   * directly for a parenthesized sub-expression without widening its span to
   * include the surrounding parentheses, so `condition.span` silently omits
   * an opening `(` whenever parentheses wrap only part of a larger
   * expression (needed for operator precedence) rather than the whole
   * condition — corrupting any source slice built from it.
   */
  readonly conditionSourceSpan?: SourceSpan;
}

export interface ChoiceNode {
  readonly type: "Choice";
  readonly items: readonly ChoiceItem[];
  readonly span: SourceSpan;
}

// ---------------------------------------------------------------------------
// Conditional: @if / @elseif / @else / @end
// ---------------------------------------------------------------------------

export type ConditionalBranchKind = "if" | "elseif" | "else";

export interface ConditionalBranch {
  readonly kind: ConditionalBranchKind;
  /** Present for "if" and "elseif" branches; absent for "else". */
  readonly condition: ExpressionNode | undefined;
  readonly blocks: readonly StoryBlock[];
  readonly span: SourceSpan;
  /**
   * Compiler/source-tooling metadata (docs/CORE_SPEC.md Section 25.36,
   * "Expansion: Nested Presentation Command Insertion"): the exact line-
   * terminator byte sequence immediately following `span.end`, if one
   * exists — `"\n"`, `"\r\n"`, or `""` when `span.end` sits at true end-of-
   * file with no authored terminator to reuse (only reachable for a branch
   * whose enclosing Conditional is itself unclosed/malformed). A local
   * source fact only, mirroring `SceneNode.followingLineEnding`. Optional
   * on this public type for the same hand-construction-compatibility
   * reason as every other metadata field in this line; every compiler-
   * produced `ConditionalBranch` populates it.
   */
  readonly followingLineEnding?: "\n" | "\r\n" | "";
  /**
   * The exact absolute source span of the authored condition text on an
   * `@if` or `@elseif` header line. Populated only for non-`else` branches
   * whose directive has non-empty args; `undefined` for `@else`, which has no
   * condition value at all (never a zero-width span). Mirrors
   * `VariantBranch.conditionSourceSpan`: `condition.span` must not be used as
   * a substitute, since it omits surrounding parentheses for partially
   * parenthesized expressions.
   */
  readonly conditionSourceSpan?: SourceSpan;
}

export interface ConditionalNode {
  readonly type: "Conditional";
  readonly branches: readonly ConditionalBranch[];
  readonly span: SourceSpan;
}

// ---------------------------------------------------------------------------
// Variant: @variant / @when / @otherwise / @end
// ---------------------------------------------------------------------------

export type VariantBranchKind = "when" | "otherwise";

export interface VariantBranch {
  readonly kind: VariantBranchKind;
  /** Deterministic id, e.g. `alice-status:0` or `alice-status:otherwise`. */
  readonly branchId: string;
  /** Present for "when" branches; absent for "otherwise". */
  readonly condition: ExpressionNode | undefined;
  readonly blocks: readonly StoryBlock[];
  readonly span: SourceSpan;
  /**
   * Compiler/source-tooling metadata (docs/CORE_SPEC.md Section 25.36,
   * "Expansion: Nested Presentation Command Insertion"): identical contract
   * to `ConditionalBranch.followingLineEnding` above — the exact line-
   * terminator byte sequence immediately following `span.end`, `""` only
   * when `span.end` sits at true end-of-file (only reachable for a branch
   * whose enclosing Variant is itself unclosed/malformed). Optional on this
   * public type for the same hand-construction-compatibility reason as
   * every other metadata field in this line; every compiler-produced
   * `VariantBranch` populates it.
   */
  readonly followingLineEnding?: "\n" | "\r\n" | "";
  /**
   * The exact absolute source span of the authored condition text on a
   * `@when` header line — e.g. for `@when (a || b) && c` this slices exactly
   * to `(a || b) && c`. Populated whenever the branch directive syntactically
   * presents a condition payload (i.e. `kind === "when"` with non-empty
   * directive args), independently of whether that payload later parses
   * successfully — a source-tooling fact about the branch header's own
   * shape, not a semantic-success signal. `undefined` for an `otherwise`
   * branch, exactly matching `condition === undefined`.
   *
   * `condition.span` (an `ExpressionNode`'s own span) must NOT be used as a
   * substitute for this field, for the identical reason documented on
   * `ChoiceItem.conditionSourceSpan` above: the expression parser returns
   * the inner node directly for a parenthesized sub-expression without
   * widening its span to include the surrounding parentheses, so
   * `condition.span` silently omits an opening `(` whenever parentheses wrap
   * only part of a larger expression rather than the whole condition —
   * corrupting any source slice built from it.
   */
  readonly conditionSourceSpan?: SourceSpan;
}

export interface VariantNode {
  readonly type: "Variant";
  readonly id: string;
  /**
   * The exact absolute source span of the authored Variant declaration ID
   * on the `@variant` header line — e.g. for `@variant   my variant` this
   * slices exactly to `my variant`, excluding `@variant`, the separator
   * whitespace before the ID, any trailing header whitespace, and the EOL.
   * Unlike `VariantBranch.conditionSourceSpan`, this field is always
   * present (never `undefined`): for an empty authored ID — both bare
   * `@variant` and separator-only `@variant   ` (the parser cannot
   * distinguish these two forms at the `args` level) — this is a
   * zero-width span (`start.offset === end.offset`) at the parser-computed
   * `argsStartColumn` position, giving source-tooling a coordinate to patch
   * even when no ID text was authored at all. docs/CORE_SPEC.md Section
   * 25.46.
   */
  readonly idSourceSpan: SourceSpan;
  readonly branches: readonly VariantBranch[];
  readonly span: SourceSpan;
}

// ---------------------------------------------------------------------------
// Story block union + scene + document
// ---------------------------------------------------------------------------

export type StoryBlock =
  | ParagraphNode
  | HeadingNode
  | PresentationNode
  | SetNode
  | GotoNode
  | ChoiceNode
  | ConditionalNode
  | VariantNode;

export interface SceneNode {
  readonly type: "Scene";
  readonly id: string;
  readonly blocks: readonly StoryBlock[];
  readonly span: SourceSpan;
  /**
   * Compiler/source-tooling metadata (docs/CORE_SPEC.md Section 25.35):
   * the exact line-terminator byte sequence immediately following
   * `span.end`, if one exists — `"\n"`, `"\r\n"`, or `""` when `span.end`
   * sits at true end-of-file with no authored terminator to reuse. Carries
   * no indentation, blank-line trivia, or generated text — a neutral fact
   * only, derived directly from the same per-line terminator tracking the
   * parser already performs while splitting source into lines. Optional on
   * this public type for the same source-compatibility reason as every
   * other metadata field in this line (existing hand-constructed
   * `SceneNode` object literals remain source-compatible); every
   * compiler-produced `SceneNode` populates it.
   */
  readonly followingLineEnding?: "\n" | "\r\n" | "";
}

export interface StoryDocument {
  readonly type: "StoryDocument";
  readonly metadata: StoryMetadata;
  readonly initialState: StoryStateDefinition;
  /**
   * The scene id runtime code should start execution from — compiler-
   * normalized execution semantics, distinct from author-facing
   * `metadata.entry`. Resolution order: the author's explicit `entry` if
   * given (even if it turns out not to reference a real scene — that is
   * reported separately as an AT1004 diagnostic, the same way a dangling
   * `@goto` target is), otherwise the document's first scene, otherwise
   * the synthetic leading scene id ("main"). Always set, so runtime code
   * never needs to guess or re-derive which scene starts the story.
   */
  readonly entryScene: string;
  readonly scenes: readonly SceneNode[];
}
