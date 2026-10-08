import type { SourcePosition, SourceSpan } from "../ast/span.js";
import type { ExpressionNode } from "../ast/expression.js";
import type { CameraAction, PresentationCommand } from "../ast/presentation.js";
import type {
  ChoiceItem,
  ChoiceNode,
  ConditionalBranch,
  ConditionalBranchKind,
  ConditionalNode,
  GotoNode,
  PresentationNode,
  SceneNode,
  SetNode,
  StoryBlock,
  VariantBranch,
  VariantNode
} from "../ast/story.js";
import type { Diagnostic } from "../diagnostics/types.js";
import { Diagnostics } from "../diagnostics/codes.js";
import {
  matchDirectiveLine,
  SIMPLE_PRESENTATION_DIRECTIVES,
  type ParsedDirectiveLine,
  type SimplePresentationDirective
} from "./directive-line.js";
import { joinLineText, lineEnd, lineStart, positionAt, type SourceLine } from "./lines.js";
import { MAX_BLOCK_DEPTH } from "../limits.js";
import { parseProseChunk } from "./markdown.js";
import { ExpressionSyntaxError, parseExpression } from "./expression-parser.js";
import { RESERVED_VARIABLE_NAMES } from "./expression-lexer.js";
import {
  findLastUnescapedArrow,
  SEPARATOR_WHITESPACE_PATTERN,
  SEPARATOR_WHITESPACE_SOURCE
} from "./lexical-primitives.js";

function spanOf(line: SourceLine): SourceSpan {
  return { start: lineStart(line), end: lineEnd(line) };
}

const SIMPLE_PRESENTATION_SET = new Set<string>(SIMPLE_PRESENTATION_DIRECTIVES);

interface BlockSequenceResult {
  readonly blocks: StoryBlock[];
  readonly nextIndex: number;
  /** Directive name that stopped the sequence (a terminator, or "scene"), or null at EOF. */
  readonly stoppedBy: string | null;
}

/** Records an expression-error diagnostic anchored at a syntax error's offset (and span, if any). */
function reportExpressionError(
  err: ExpressionSyntaxError,
  base: ReturnType<typeof positionAt>,
  diagnostics: Diagnostic[]
): void {
  const start = {
    line: base.line,
    column: base.column + err.offset,
    offset: base.offset + err.offset
  };
  const end = {
    line: base.line,
    column: base.column + err.endOffset,
    offset: base.offset + err.endOffset
  };
  const span = { start, end };
  if (err.code === "AT2005") {
    diagnostics.push(Diagnostics.expressionNumericNotFinite(span));
  } else {
    diagnostics.push(Diagnostics.malformedExpression(err.message, span));
  }
}

function tryParseExpression(
  argsText: string,
  line: SourceLine,
  argsStartColumn: number,
  diagnostics: Diagnostic[]
): ExpressionNode | undefined {
  const base = positionAt(line, argsStartColumn);
  if (argsText.trim().length === 0) {
    diagnostics.push(Diagnostics.malformedExpression("expected an expression", spanOf(line)));
    return undefined;
  }
  try {
    return parseExpression(argsText, base);
  } catch (err) {
    if (err instanceof ExpressionSyntaxError) {
      reportExpressionError(err, base, diagnostics);
      return undefined;
    }
    throw err;
  }
}

/** A half-open `[start, end)` character range within a directive's `argsText`. */
interface ArgsTextRange {
  readonly start: number;
  readonly end: number;
}

/** One physically-scanned argument token (ordinary or quoted), in source order. */
interface ArgsTextToken {
  readonly start: number;
  readonly end: number;
  /** The parsed key, only for a recognized `key=value` token; `undefined` for a positional token (including every quoted token — a quoted token is always positional, never reclassified). */
  readonly key: string | undefined;
}

interface RawPresentationArgs {
  readonly value: string | undefined;
  readonly params: Readonly<Record<string, string>>;
  /**
   * `argsText`-relative ranges of each recognized `key=value` token's
   * VALUE text (docs/CORE_SPEC.md Section 25.36) — never the key or the
   * `=`. Populated for every recognized parameter regardless of whether
   * the current directive kind actually consumes it (source-analysis
   * metadata only; unused-key filtering, if ever needed, is a consumer-side
   * concern, not a compiler one). Duplicate keys follow the same
   * last-occurrence-wins behavior as `params` itself, computed in the same
   * left-to-right scan.
   */
  readonly paramValueRanges: Readonly<Record<string, ArgsTextRange>>;
  /**
   * `argsText`-relative removal range for a recognized `key=value` token
   * (docs/CORE_SPEC.md Section 14) — the complete token plus exactly
   * one adjacent authored separator, present **only** for a key occurring
   * exactly once (a duplicated key gets no entry at all, for any of its
   * occurrences — see the exactly-one-occurrence contract on
   * `PresentationNode.parameterRemovalSpans`).
   */
  readonly paramRemovalRanges: Readonly<Record<string, ArgsTextRange>>;
  /**
   * `argsText`-relative range of each positional (non-`key=value`) token,
   * in scan order (docs/CORE_SPEC.md Section 25.36/14). Never exposed
   * publicly as-is — `parsePresentation` only ever derives a public
   * `positionalValueSpan` from this when there is exactly one entry;
   * with zero or two-or-more entries, no positional span is produced,
   * since the semantic `value` these tokens join into is not guaranteed
   * to be contiguous in source (a named-parameter token may sit between
   * two positional tokens).
   */
  readonly positionalRanges: readonly ArgsTextRange[];
  /**
   * `argsText`-relative range covering every positional token when (and
   * only when) they all occupy one uninterrupted physical run — i.e. no
   * named `key=value` token occurs between the first and last positional
   * token (docs/CORE_SPEC.md Section 14). Includes all authored
   * inter-token whitespace between positional tokens, verbatim. `undefined`
   * when there are zero positional tokens, or when a named token
   * interrupts the run — never a synthesized/approximate bound.
   */
  readonly contiguousPositionalRange: ArgsTextRange | undefined;
  /**
   * `argsText`-relative offset of an opening `"` that was never closed
   * before the end of `argsText` (docs/CORE_SPEC.md Section 14, Quoted
   * Presentation positional arguments) — `undefined` for well-formed
   * argument text. When present, every other field on this result reflects
   * only the (aborted) scan up to that point and must not be used; the
   * caller reports `AT1301` and drops the directive entirely.
   */
  readonly unterminatedQuoteAt: number | undefined;
}

const PARAM_TOKEN_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/;

function tokenizePresentationArgs(argsText: string): RawPresentationArgs {
  const params: Record<string, string> = {};
  const paramValueRanges: Record<string, ArgsTextRange> = {};
  const paramOccurrences: Record<string, number> = {};
  const positional: string[] = [];
  const positionalRanges: ArgsTextRange[] = [];
  const tokens: ArgsTextToken[] = [];
  let unterminatedQuoteAt: number | undefined;

  // A small deterministic single-pass scanner (docs/CORE_SPEC.md
  // Section 14, Quoted Presentation positional arguments) — replaces the
  // previous plain `argsText.matchAll(/\S+/g)` regex scan, which could not
  // express quote-aware token grouping, escape decoding, or precise
  // unterminated-quote diagnostics. Ordinary (unquoted) token behavior is
  // preserved byte-for-byte: a token boundary is recognized on the exact
  // same `\s` separator-whitespace semantics the previous regex used, and
  // an ordinary token still runs to the next separator whitespace with no
  // decoding of any kind. Quoted-token recognition activates ONLY when a
  // token boundary's first character is `"` — a `"` occurring mid-token
  // (not at a boundary) is never special and remains ordinary literal
  // token content, exactly as before this feature existed. Every token
  // (positional, named, or quoted-positional) is retained in physical scan
  // order in `tokens`, the single source both `paramValueRanges` and the
  // removal-range/contiguous-range computations below reuse — still one
  // parsing pass, now with quote-awareness folded in rather than layered
  // alongside it.
  let i = 0;
  const n = argsText.length;
  while (i < n) {
    const ch = argsText[i] as string;
    if (SEPARATOR_WHITESPACE_PATTERN.test(ch)) {
      i += 1;
      continue;
    }

    const tokenStart = i;

    if (ch === '"') {
      // Quoted positional token (docs/CORE_SPEC.md Section 14) — always
      // positional, NEVER passed through `PARAM_TOKEN_PATTERN`: lexical
      // grouping (this whole quoted token) is determined before named-
      // parameter classification is ever considered, so a token like
      // `"foo=bar.mp3"` can never be reclassified as a named parameter no
      // matter what its decoded content looks like. Escape decoding
      // happens inline, left to right, during this same scan — never a
      // second pass, never a regex post-processing step. Exactly two
      // escape sequences are recognized (`\"` and `\\`); any other `\X` is
      // preserved as both literal characters, deliberately diverging from
      // the expression lexer's escape model (which silently drops the
      // backslash for an unrecognized escape — confirmed empirically to
      // destroy Windows-style paths, e.g. `\Users` → `Users`) — this
      // scanner keeps every authored backslash the author didn't
      // explicitly escape.
      let decoded = "";
      i += 1; // past the opening quote
      let closed = false;
      while (i < n) {
        const c = argsText[i] as string;
        if (c === '"') {
          i += 1;
          closed = true;
          break;
        }
        if (c === "\\" && i + 1 < n) {
          const next = argsText[i + 1] as string;
          decoded += next === '"' || next === "\\" ? next : c + next;
          i += 2;
          continue;
        }
        decoded += c;
        i += 1;
      }
      if (!closed) {
        unterminatedQuoteAt = tokenStart;
        break;
      }
      // No authored separator whitespace was found between this quoted
      // token's closing quote and whatever comes next — shell-style
      // concatenation is not implemented as a general grammar feature
      // (docs/CORE_SPEC.md Section 14), but this token must still end
      // deterministically somewhere: it simply continues, raw and
      // undecoded, through to the next separator whitespace, exactly like
      // an ordinary token already does. This only matters for the
      // pathological case of a quoted value with no trailing space before
      // more content; the common, documented case (a quote followed by
      // whitespace or end of `argsText`) is unaffected.
      while (i < n && !SEPARATOR_WHITESPACE_PATTERN.test(argsText[i] as string)) {
        decoded += argsText[i];
        i += 1;
      }
      const tokenEnd = i;
      positional.push(decoded);
      positionalRanges.push({ start: tokenStart, end: tokenEnd });
      tokens.push({ start: tokenStart, end: tokenEnd, key: undefined });
      continue;
    }

    while (i < n && !SEPARATOR_WHITESPACE_PATTERN.test(argsText[i] as string)) i += 1;
    const tokenEnd = i;
    const token = argsText.slice(tokenStart, tokenEnd);
    const paramMatch = PARAM_TOKEN_PATTERN.exec(token);
    if (paramMatch) {
      const key = paramMatch[1] as string;
      const value = paramMatch[2] as string;
      params[key] = value;
      const valueStart = tokenStart + key.length + 1; // past "key="
      paramValueRanges[key] = { start: valueStart, end: valueStart + value.length };
      paramOccurrences[key] = (paramOccurrences[key] ?? 0) + 1;
      tokens.push({ start: tokenStart, end: tokenEnd, key });
    } else {
      positional.push(token);
      positionalRanges.push({ start: tokenStart, end: tokenEnd });
      tokens.push({ start: tokenStart, end: tokenEnd, key: undefined });
    }
  }

  // A safe, trivia-aware removal range for a named parameter exists only
  // when its key occurs EXACTLY ONCE (docs/CORE_SPEC.md Section 14) —
  // with 2+ occurrences, no single range could delete "the property"
  // without either silently reviving an earlier duplicate (deleting only
  // the effective last occurrence) or requiring multi-range deletion, so
  // no range is produced for that key at all. Reuses the token adjacency
  // already scanned above (one extra pass over the small in-memory
  // `tokens` array — not a second scan of `argsText`, not a new grammar).
  const paramRemovalRanges: Record<string, ArgsTextRange> = {};
  tokens.forEach((tok, index) => {
    if (tok.key === undefined || paramOccurrences[tok.key] !== 1) return;
    if (index === 0) {
      // Physically first argument token: remove the token plus the
      // separator immediately FOLLOWING it. The whitespace between the
      // directive name and this first argument is never touched — it
      // lies outside argsText entirely, and deleting it would merge the
      // directive name with whichever token becomes the new first
      // argument (e.g. `@camera duration=0.50s zoom` must never become
      // `@camerazoom`).
      const next = tokens[index + 1];
      paramRemovalRanges[tok.key] = { start: tok.start, end: next ? next.start : tok.end };
    } else {
      // Middle or last: remove the separator immediately PRECEDING the
      // token plus the token itself. For a last-position token this
      // naturally excludes trailing line trivia, which lies past the end
      // of argsText entirely (see argumentsEndPosition).
      const previous = tokens[index - 1] as ArgsTextToken;
      paramRemovalRanges[tok.key] = { start: previous.end, end: tok.end };
    }
  });

  // The contiguous positional run (docs/CORE_SPEC.md Section 14) — a
  // strict, additive generalization of the single-positional-token case
  // above, reusing the same `tokens` adjacency data with no second scan.
  // Populated iff at least one positional token exists AND every token
  // between the first and last positional token (inclusive) is itself
  // positional — i.e. no named token interrupts the run. A named token
  // physically before or after the entire run does not break contiguity.
  let contiguousPositionalRange: ArgsTextRange | undefined;
  const positionalIndices: number[] = [];
  tokens.forEach((tok, index) => {
    if (tok.key === undefined) positionalIndices.push(index);
  });
  if (positionalIndices.length > 0) {
    const firstIndex = positionalIndices[0] as number;
    const lastIndex = positionalIndices[positionalIndices.length - 1] as number;
    const isContiguous = tokens.slice(firstIndex, lastIndex + 1).every((tok) => tok.key === undefined);
    if (isContiguous) {
      contiguousPositionalRange = {
        start: (tokens[firstIndex] as ArgsTextToken).start,
        end: (tokens[lastIndex] as ArgsTextToken).end
      };
    }
  }

  return {
    value: positional.length > 0 ? positional.join(" ") : undefined,
    params,
    paramValueRanges,
    paramRemovalRanges,
    positionalRanges,
    contiguousPositionalRange,
    unterminatedQuoteAt
  };
}

const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s)$/;

/** Normalizes a duration literal (`6s`, `1200ms`) to milliseconds; `undefined` if malformed. */
function parseDurationMs(text: string): number | undefined {
  const match = DURATION_PATTERN.exec(text);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return match[2] === "s" ? Math.round(amount * 1000) : Math.round(amount);
}

const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;

/** Normalizes a bare numeric literal (`1.15`, `0.5`); `undefined` if malformed. */
function parseNumericParam(text: string): number | undefined {
  return NUMBER_PATTERN.test(text) ? Number(text) : undefined;
}

const KNOWN_CAMERA_ACTIONS = new Set<CameraAction>(["zoom"]);

/**
 * Parses, validates, and normalizes a presentation directive into a typed
 * PresentationCommand (see ast/presentation.ts). Unit strings like `6s` and
 * numeric params like `to=1.15` are converted to real numbers here — the
 * only place this happens — so runtime code never re-parses directive text.
 * Returns `undefined` (with a diagnostic) for malformed directives rather
 * than producing a node with placeholder values.
 */
function parsePresentation(
  kind: SimplePresentationDirective,
  argsText: string,
  span: SourceSpan,
  line: SourceLine,
  argsStartColumn: number,
  diagnostics: Diagnostic[]
): PresentationNode | undefined {
  const tokenized = tokenizePresentationArgs(argsText);

  // An unclosed quoted positional token (docs/CORE_SPEC.md Section 14,
  // Quoted Presentation positional arguments) reuses the existing AT1301
  // (`malformedPresentation`) — no new diagnostic code — with a span from
  // the opening quote through the end of this physical directive line
  // (more precise than the whole-directive `span` every other AT1301 case
  // below uses), computed directly from the already-available `line`/
  // `argsStartColumn` with no second source scan. No PresentationNode is
  // produced; parsing of subsequent physical lines is unaffected, since
  // the caller's own line loop already advances unconditionally.
  if (tokenized.unterminatedQuoteAt !== undefined) {
    diagnostics.push(
      Diagnostics.malformedPresentation("unterminated quoted argument", {
        start: positionAt(line, argsStartColumn + tokenized.unterminatedQuoteAt),
        end: lineEnd(line)
      })
    );
    return undefined;
  }

  const { value, params, paramValueRanges, paramRemovalRanges, positionalRanges, contiguousPositionalRange } =
    tokenized;

  // Absolute source spans for every recognized parameter value (docs/CORE_SPEC.md
  // Section 25.36) — computed once, reused by every return below, always
  // present (an empty record when the directive has no named parameters).
  const parameterValueSpans: Record<string, SourceSpan> = {};
  for (const [key, range] of Object.entries(paramValueRanges)) {
    parameterValueSpans[key] = {
      start: positionAt(line, argsStartColumn + range.start),
      end: positionAt(line, argsStartColumn + range.end)
    };
  }

  // Absolute, duplicate-safe removal spans (docs/CORE_SPEC.md Section
  // 14) — present only for a key with exactly one authored occurrence;
  // computed once, reused by every return below.
  const parameterRemovalSpans: Record<string, SourceSpan> = {};
  for (const [key, range] of Object.entries(paramRemovalRanges)) {
    parameterRemovalSpans[key] = {
      start: positionAt(line, argsStartColumn + range.start),
      end: positionAt(line, argsStartColumn + range.end)
    };
  }

  // The positional value has a safe, contiguous source span only when
  // there is exactly one positional token (docs/CORE_SPEC.md Section
  // 14) — with zero or two-or-more, `value` either doesn't exist or is a
  // synthetic join of non-contiguous source text, so no span is produced.
  const positionalValueSpan: SourceSpan | undefined =
    positionalRanges.length === 1
      ? {
          start: positionAt(line, argsStartColumn + (positionalRanges[0] as ArgsTextRange).start),
          end: positionAt(line, argsStartColumn + (positionalRanges[0] as ArgsTextRange).end)
        }
      : undefined;

  // Absolute contiguous-positional-run span (docs/CORE_SPEC.md Section
  // 14) — a strict, additive generalization of `positionalValueSpan`;
  // never derived when `contiguousPositionalRange` is `undefined` (zero
  // positional tokens, or a named token interrupting the run).
  const contiguousPositionalSpan: SourceSpan | undefined = contiguousPositionalRange
    ? {
        start: positionAt(line, argsStartColumn + contiguousPositionalRange.start),
        end: positionAt(line, argsStartColumn + contiguousPositionalRange.end)
      }
    : undefined;

  // The position immediately after the last non-whitespace character of
  // `argsText` (docs/CORE_SPEC.md Section 14) — `argsText` is already
  // `.trimEnd()`-ed by `matchDirectiveLine`, so `argsStartColumn +
  // argsText.length` lands exactly there, before any trailing line
  // whitespace/terminator. Never derived from the whole-node `span.end`,
  // which includes that trailing whitespace.
  const argumentsEndPosition = positionAt(line, argsStartColumn + argsText.length);

  // Whole-command removal span (docs/CORE_SPEC.md Section 14) — always
  // starts at the directive's own span.start (never adjusted backward
  // into preceding source); extends span.end by exactly this directive's
  // own physical line's terminator width (0 at true EOF, 1 for `\n`, 2 for
  // `\r\n`) so deleting it never leaves an accidental blank line behind.
  // Computed entirely from the `line` already in hand — no lookup of a
  // different line by absolute number, no second source scan.
  const commandRemovalSpan: SourceSpan = {
    start: span.start,
    end:
      line.newlineLength === 0
        ? span.end
        : { line: line.number + 1, column: 1, offset: line.endOffset + line.newlineLength }
  };

  function fail(reason: string): undefined {
    diagnostics.push(Diagnostics.malformedPresentation(reason, span));
    return undefined;
  }

  /**
   * `parseDurationMs`/`parseNumericParam` only reject lexically malformed
   * text (AT1301); a lexically-valid literal that converts to a non-finite
   * number (e.g. an extreme digit run, or a finite seconds amount that
   * overflows only after the `* 1000` conversion) is a distinct condition
   * reported as AT1302 (docs/CORE_SPEC.md Section 24).
   */
  function failNotFinite(): undefined {
    diagnostics.push(Diagnostics.presentationNumericNotFinite(span));
    return undefined;
  }

  switch (kind) {
    case "background":
    case "layer":
    case "sfx": {
      if (!value) return fail(`@${kind} requires a file path`);
      const command: PresentationCommand =
        kind === "background"
          ? { type: "Background", image: value }
          : kind === "layer"
            ? { type: "Layer", image: value }
            : { type: "Sfx", clip: value };
      return {
        type: "Presentation",
        command,
        span,
        parameterValueSpans,
        positionalValueSpan,
        argumentsEndPosition,
        parameterRemovalSpans,
        contiguousPositionalSpan,
        commandRemovalSpan
      };
    }
    case "music": {
      if (!value) return fail("@music requires a file path");
      let volume: number | undefined;
      if (params["volume"] !== undefined) {
        volume = parseNumericParam(params["volume"]);
        if (volume === undefined) return fail(`invalid volume "${params["volume"]}"`);
        if (!Number.isFinite(volume)) return failNotFinite();
      }
      return {
        type: "Presentation",
        command: { type: "Music", track: value, volume },
        span,
        parameterValueSpans,
        positionalValueSpan,
        argumentsEndPosition,
        parameterRemovalSpans,
        contiguousPositionalSpan,
        commandRemovalSpan
      };
    }
    case "pause": {
      if (!value) return fail("@pause requires a duration");
      const durationMs = parseDurationMs(value);
      if (durationMs === undefined) return fail(`invalid duration "${value}"`);
      if (!Number.isFinite(durationMs)) return failNotFinite();
      return {
        type: "Presentation",
        command: { type: "Pause", durationMs },
        span,
        parameterValueSpans,
        positionalValueSpan,
        argumentsEndPosition,
        parameterRemovalSpans,
        contiguousPositionalSpan,
        commandRemovalSpan
      };
    }
    case "camera": {
      if (value === undefined) return fail("@camera requires an action");
      if (!KNOWN_CAMERA_ACTIONS.has(value as CameraAction)) {
        return fail(`unsupported camera action "${value}"`);
      }
      if (params["to"] === undefined) return fail('@camera zoom requires "to="');
      const to = parseNumericParam(params["to"]);
      if (to === undefined) return fail(`invalid "to" value "${params["to"]}"`);
      if (!Number.isFinite(to)) return failNotFinite();

      let durationMs: number | undefined;
      if (params["duration"] !== undefined) {
        durationMs = parseDurationMs(params["duration"]);
        if (durationMs === undefined) return fail(`invalid duration "${params["duration"]}"`);
        if (!Number.isFinite(durationMs)) return failNotFinite();
      }
      return {
        type: "Presentation",
        command: { type: "Camera", action: "zoom", to, durationMs },
        span,
        parameterValueSpans,
        positionalValueSpan,
        argumentsEndPosition,
        parameterRemovalSpans,
        contiguousPositionalSpan,
        commandRemovalSpan
      };
    }
  }
}

// `\S.*` (not `.+`) after the separator keeps `\s*` and the expression from
// overlapping, so the pattern cannot backtrack across whitespace. `args` are
// trimmed and never contain a line terminator, so it accepts the same lines.
const SET_PATTERN = /^([A-Za-z_]\w*)\s*=\s*(\S.*)$/;

function parseSet(
  directive: ParsedDirectiveLine,
  line: SourceLine,
  diagnostics: Diagnostic[]
): SetNode | undefined {
  const match = SET_PATTERN.exec(directive.args);
  if (!match) {
    diagnostics.push(
      Diagnostics.malformedExpression('expected "name = expression"', spanOf(line))
    );
    return undefined;
  }

  const name = match[1] as string;
  const exprText = match[2] as string;
  const exprOffsetInArgs = directive.args.length - exprText.length;
  const base = positionAt(line, directive.argsStartColumn + exprOffsetInArgs);
  const nameSourceSpan: SourceSpan = {
    start: positionAt(line, directive.argsStartColumn),
    end: positionAt(line, directive.argsStartColumn + name.length)
  };
  if (RESERVED_VARIABLE_NAMES.has(name)) {
    diagnostics.push(
      Diagnostics.malformedExpression(
        `"${name}" is a reserved word and cannot be a variable name`,
        nameSourceSpan
      )
    );
    return undefined;
  }
  const expressionSourceSpan: SourceSpan = {
    start: base,
    end: positionAt(line, directive.argsStartColumn + directive.args.length)
  };

  try {
    const expression = parseExpression(exprText, base);
    return {
      type: "Set",
      name,
      expression,
      span: spanOf(line),
      nameSourceSpan,
      expressionSourceSpan
    };
  } catch (err) {
    if (err instanceof ExpressionSyntaxError) {
      reportExpressionError(err, base, diagnostics);
      return undefined;
    }
    throw err;
  }
}

/** Bullet marker introducing a choice item: `* ...` or `- ...`. */
const CHOICE_BULLET_PATTERN = /^(\s*)[*-]\s+/;

/**
 * The target (+ optional condition) segment following the arrow: `room` or
 * `room if has_key`. Built from `SEPARATOR_WHITESPACE_SOURCE` rather than a
 * hardcoded `\s` so the `if`-separator whitespace it recognizes is the exact
 * same lexical fact `isChoiceTargetBoundarySafe` (`serializer-safety.ts`)
 * checks for — the two cannot silently drift apart.
 */
const CHOICE_TAIL_PATTERN = new RegExp(
  `^([A-Za-z][A-Za-z0-9_-]*)(?:${SEPARATOR_WHITESPACE_SOURCE}+if${SEPARATOR_WHITESPACE_SOURCE}+(.+))?$`
);

function parseChoice(
  lines: readonly SourceLine[],
  openIndex: number,
  diagnostics: Diagnostic[]
): { block: ChoiceNode; nextIndex: number } {
  const openLine = lines[openIndex] as SourceLine;
  let idx = openIndex + 1;
  const items: ChoiceItem[] = [];
  let lastEnd = lineEnd(openLine);

  while (idx < lines.length) {
    const line = lines[idx] as SourceLine;
    if (line.text.trim().length === 0) {
      idx += 1;
      continue;
    }

    const directive = matchDirectiveLine(line.text);
    if (directive && (directive.name === "end" || directive.name === "scene")) {
      break;
    }

    const bulletMatch = CHOICE_BULLET_PATTERN.exec(line.text);
    if (!bulletMatch) {
      idx += 1;
      continue;
    }

    const contentStart = (bulletMatch[0] as string).length;
    const content = line.text.slice(contentStart);
    const arrowIndex = findLastUnescapedArrow(content);

    // A bullet-prefixed line (`- ...`/`* ...`) is always a ChoiceItem
    // candidate — the bullet marker is the only signal this parser uses to
    // distinguish authored items from unrelated narrative lines (which are
    // silently skipped above, `!bulletMatch`, by design). Once a line clears
    // that bar, failing to parse as a complete item is always reported
    // (AT1005) rather than silently dropped, so a malformed item can never
    // vanish into a smaller-than-authored Choice with no diagnostic.
    if (arrowIndex === -1) {
      diagnostics.push(Diagnostics.malformedChoiceItem('missing "-> target" after item text', spanOf(line)));
      idx += 1;
      continue;
    }

    // Display text is only the "if" delimiter's own condition-grammar is
    // applied to the tail *after* the target — so an "if" appearing in
    // display text (before the arrow) can never be mistaken for one.
    const displayText = content.slice(0, arrowIndex).trim().replaceAll(String.raw`\->`, "->");

    const tailStart = arrowIndex + 2;
    const tailRaw = content.slice(tailStart);
    const tailLeadingWs = tailRaw.length - tailRaw.trimStart().length;
    const tailTrimmed = tailRaw.trim();
    const tailMatch = CHOICE_TAIL_PATTERN.exec(tailTrimmed);

    if (!tailMatch) {
      const tailStartOffset = contentStart + tailStart + tailLeadingWs;
      const tailSpan: SourceSpan = {
        start: positionAt(line, tailStartOffset),
        end: positionAt(line, tailStartOffset + tailTrimmed.length)
      };
      diagnostics.push(Diagnostics.malformedChoiceItem(`invalid target "${tailTrimmed}"`, tailSpan));
      idx += 1;
      continue;
    }

    const target = tailMatch[1] as string;
    const conditionText = tailMatch[2];
    let condition: ExpressionNode | undefined;
    let conditionSourceSpan: SourceSpan | undefined;

    if (conditionText !== undefined) {
      const conditionStart = tailTrimmed.lastIndexOf(conditionText);
      const base = positionAt(line, contentStart + tailStart + tailLeadingWs + conditionStart);
      // A pure source-tooling fact about the Choice tail's own shape —
      // populated whenever the grammar recognizes `target if <text>`,
      // independently of whether `text` itself goes on to parse below.
      // Derived from facts already computed above (`base`, `conditionText`),
      // never from `condition.span` (see the field's doc comment for why).
      conditionSourceSpan = {
        start: base,
        end: positionAt(line, contentStart + tailStart + tailLeadingWs + conditionStart + conditionText.length)
      };
      try {
        condition = parseExpression(conditionText, base);
      } catch (err) {
        if (err instanceof ExpressionSyntaxError) {
          reportExpressionError(err, base, diagnostics);
        } else {
          throw err;
        }
      }
    }

    items.push({ text: displayText, target, condition, span: spanOf(line), conditionSourceSpan });
    idx += 1;
  }

  const terminator = idx < lines.length ? matchDirectiveLine((lines[idx] as SourceLine).text) : null;
  if (terminator && terminator.name === "end") {
    lastEnd = lineEnd(lines[idx] as SourceLine);
    idx += 1;
  } else {
    diagnostics.push(Diagnostics.unclosedBlock("choice", spanOf(openLine)));
  }

  return {
    block: { type: "Choice", items, span: { start: lineStart(openLine), end: lastEnd } },
    nextIndex: idx
  };
}

function parseConditional(
  lines: readonly SourceLine[],
  openIndex: number,
  diagnostics: Diagnostic[],
  depth: number
): { block: ConditionalNode; nextIndex: number } {
  const openLine = lines[openIndex] as SourceLine;
  const branches: ConditionalBranch[] = [];
  let idx = openIndex;
  let kind: ConditionalBranchKind = "if";
  let lastEnd = lineEnd(openLine);

  for (;;) {
    const branchLine = lines[idx] as SourceLine;
    const branchDirective = matchDirectiveLine(branchLine.text) as ParsedDirectiveLine;
    const condition =
      kind === "else"
        ? undefined
        : tryParseExpression(branchDirective.args, branchLine, branchDirective.argsStartColumn, diagnostics);
    const conditionSourceSpan: SourceSpan | undefined =
      kind !== "else" && branchDirective.args.length > 0
        ? {
            start: positionAt(branchLine, branchDirective.argsStartColumn),
            end: positionAt(branchLine, branchDirective.argsStartColumn + branchDirective.args.length)
          }
        : undefined;

    idx += 1;
    const seq = parseBlockSequence(lines, idx, diagnostics, new Set(["elseif", "else", "end"]), depth + 1);
    const branchSpan = {
      start: lineStart(branchLine),
      end: seq.blocks.length > 0 ? (seq.blocks[seq.blocks.length - 1] as StoryBlock).span.end : lineEnd(branchLine)
    };
    branches.push({
      kind,
      condition,
      blocks: seq.blocks,
      span: branchSpan,
      followingLineEnding: lineEndingAt(lines, branchSpan.end),
      conditionSourceSpan
    });
    idx = seq.nextIndex;

    if (seq.stoppedBy === "end") {
      lastEnd = lineEnd(lines[idx] as SourceLine);
      idx += 1;
      break;
    }
    if (seq.stoppedBy === "elseif") {
      kind = "elseif";
      continue;
    }
    if (seq.stoppedBy === "else") {
      kind = "else";
      continue;
    }

    diagnostics.push(Diagnostics.unclosedBlock("if", spanOf(openLine)));
    break;
  }

  return {
    block: { type: "Conditional", branches, span: { start: lineStart(openLine), end: lastEnd } },
    nextIndex: idx
  };
}

function parseVariant(
  lines: readonly SourceLine[],
  openIndex: number,
  diagnostics: Diagnostic[],
  depth: number
): { block: VariantNode; nextIndex: number } {
  const openLine = lines[openIndex] as SourceLine;
  const openDirective = matchDirectiveLine(openLine.text) as ParsedDirectiveLine;
  const variantId = openDirective.args.trim();
  // A pure source-tooling fact about the `@variant` header's own shape —
  // see the field's doc comment for why it is always present (zero-width
  // for an empty ID) rather than `undefined`. Mirrors the branch-level
  // `conditionSourceSpan` derivation above, one level up.
  const idSourceSpan: SourceSpan =
    openDirective.args.length > 0
      ? {
          start: positionAt(openLine, openDirective.argsStartColumn),
          end: positionAt(openLine, openDirective.argsStartColumn + openDirective.args.length)
        }
      : {
          start: positionAt(openLine, openDirective.argsStartColumn),
          end: positionAt(openLine, openDirective.argsStartColumn)
        };
  const branches: VariantBranch[] = [];
  let whenCount = 0;
  let lastEnd = lineEnd(openLine);

  let idx = openIndex + 1;
  let seq = parseBlockSequence(lines, idx, diagnostics, new Set(["when", "otherwise", "end"]), depth + 1);
  idx = seq.nextIndex;

  while (seq.stoppedBy === "when" || seq.stoppedBy === "otherwise") {
    const kind = seq.stoppedBy;
    const branchLine = lines[idx] as SourceLine;
    const branchDirective = matchDirectiveLine(branchLine.text) as ParsedDirectiveLine;
    const condition =
      kind === "when"
        ? tryParseExpression(branchDirective.args, branchLine, branchDirective.argsStartColumn, diagnostics)
        : undefined;
    const branchId = kind === "when" ? `${variantId}:${whenCount++}` : `${variantId}:otherwise`;
    // A pure source-tooling fact about the `@when` header's own shape —
    // populated whenever the directive syntactically presents a condition
    // payload, independently of whether that payload goes on to parse above.
    // `branchDirective.args` already excludes the separator whitespace
    // before it (consumed by `matchDirectiveLine`'s own required `[ \t]+`)
    // and any trailing whitespace (`.trimEnd()`), so this is exactly the
    // authored condition text with no rescanning and no dependence on
    // `condition`/`condition.span` (see the field's doc comment for why).
    const conditionSourceSpan: SourceSpan | undefined =
      kind === "when" && branchDirective.args.length > 0
        ? {
            start: positionAt(branchLine, branchDirective.argsStartColumn),
            end: positionAt(branchLine, branchDirective.argsStartColumn + branchDirective.args.length)
          }
        : undefined;

    idx += 1;
    const bodySeq = parseBlockSequence(lines, idx, diagnostics, new Set(["when", "otherwise", "end"]), depth + 1);
    const branchSpan = {
      start: lineStart(branchLine),
      end:
        bodySeq.blocks.length > 0
          ? (bodySeq.blocks[bodySeq.blocks.length - 1] as StoryBlock).span.end
          : lineEnd(branchLine)
    };
    branches.push({
      kind,
      branchId,
      condition,
      blocks: bodySeq.blocks,
      span: branchSpan,
      followingLineEnding: lineEndingAt(lines, branchSpan.end),
      conditionSourceSpan
    });
    idx = bodySeq.nextIndex;
    seq = bodySeq;
  }

  if (seq.stoppedBy === "end") {
    lastEnd = lineEnd(lines[idx] as SourceLine);
    idx += 1;
  } else {
    diagnostics.push(Diagnostics.unclosedBlock("variant", spanOf(openLine)));
  }

  return {
    block: {
      type: "Variant",
      id: variantId,
      idSourceSpan,
      branches,
      span: { start: lineStart(openLine), end: lastEnd }
    },
    nextIndex: idx
  };
}

/**
 * Returns the index just past the `@end` that closes the construct opened at
 * `openIndex`, counting nested `@if` / `@variant` / `@choice` openers. Stops
 * early at a `@scene` line (scenes bound every construct) or end of input.
 * Iterative on purpose: it is used on input too deep to recurse over.
 */
function skipConstruct(lines: readonly SourceLine[], openIndex: number): number {
  let level = 0;
  for (let j = openIndex; j < lines.length; j++) {
    const directive = matchDirectiveLine((lines[j] as SourceLine).text);
    if (!directive) continue;
    if (directive.name === "scene" && j > openIndex) return j;
    if (directive.name === "if" || directive.name === "variant" || directive.name === "choice") level += 1;
    else if (directive.name === "end") {
      level -= 1;
      if (level === 0) return j + 1;
    }
  }
  return lines.length;
}

/**
 * Parses a run of lines into StoryBlocks until either a directive in
 * `terminators` is reached, a `@scene` line is reached (scenes always
 * bound any enclosing construct), or the input is exhausted.
 *
 * This single function drives every nesting level (scene bodies,
 * conditional/variant branch bodies) — nesting falls out of recursive
 * calls to parseConditional/parseVariant/parseChoice below.
 */
export function parseBlockSequence(
  lines: readonly SourceLine[],
  start: number,
  diagnostics: Diagnostic[],
  terminators: ReadonlySet<string>,
  depth = 0
): BlockSequenceResult {
  const blocks: StoryBlock[] = [];
  let i = start;
  let proseStart = -1;

  const flushProse = (endExclusive: number): void => {
    if (proseStart === -1) return;
    const chunkLines = lines.slice(proseStart, endExclusive);
    proseStart = -1;
    if (chunkLines.length === 0) return;

    const text = joinLineText(chunkLines);
    if (text.trim().length === 0) return;

    const first = chunkLines[0] as SourceLine;
    const proseBlocks = parseProseChunk(
      text,
      { startLine: first.number, startOffset: first.startOffset },
      diagnostics
    );
    blocks.push(...proseBlocks);
  };

  while (i < lines.length) {
    const line = lines[i] as SourceLine;
    const directive = matchDirectiveLine(line.text);

    if (!directive) {
      if (proseStart === -1) proseStart = i;
      i += 1;
      continue;
    }

    if (directive.name === "scene" || terminators.has(directive.name)) {
      flushProse(i);
      return { blocks, nextIndex: i, stoppedBy: directive.name };
    }

    flushProse(i);

    if (SIMPLE_PRESENTATION_SET.has(directive.name)) {
      const node = parsePresentation(
        directive.name as SimplePresentationDirective,
        directive.args,
        spanOf(line),
        line,
        directive.argsStartColumn,
        diagnostics
      );
      if (node) blocks.push(node);
      i += 1;
      continue;
    }

    switch (directive.name) {
      case "set": {
        const node = parseSet(directive, line, diagnostics);
        if (node) blocks.push(node);
        i += 1;
        break;
      }
      case "goto": {
        const targetSourceSpan: SourceSpan = {
          start: positionAt(line, directive.argsStartColumn),
          end: positionAt(line, directive.argsStartColumn + directive.args.length)
        };
        const node: GotoNode = {
          type: "Goto",
          target: directive.args.trim(),
          span: spanOf(line),
          targetSourceSpan
        };
        blocks.push(node);
        i += 1;
        break;
      }
      case "if": {
        if (depth >= MAX_BLOCK_DEPTH) {
          diagnostics.push(Diagnostics.blocksNestedTooDeeply(MAX_BLOCK_DEPTH, spanOf(line)));
          i = skipConstruct(lines, i);
          break;
        }
        const { block, nextIndex } = parseConditional(lines, i, diagnostics, depth);
        blocks.push(block);
        i = nextIndex;
        break;
      }
      case "variant": {
        if (depth >= MAX_BLOCK_DEPTH) {
          diagnostics.push(Diagnostics.blocksNestedTooDeeply(MAX_BLOCK_DEPTH, spanOf(line)));
          i = skipConstruct(lines, i);
          break;
        }
        const { block, nextIndex } = parseVariant(lines, i, diagnostics, depth);
        blocks.push(block);
        i = nextIndex;
        break;
      }
      case "choice": {
        const { block, nextIndex } = parseChoice(lines, i, diagnostics);
        blocks.push(block);
        i = nextIndex;
        break;
      }
      case "elseif":
      case "else":
      case "end":
      case "when":
      case "otherwise": {
        // A terminator directive outside the construct it belongs to (the
        // matching construct parser above always intercepts these via
        // `terminators`). No dedicated diagnostic code covers this shape
        // of error in v0.1 — skip defensively rather than crash.
        i += 1;
        break;
      }
      default: {
        diagnostics.push(Diagnostics.unknownDirective(directive.name, spanOf(line)));
        i += 1;
        break;
      }
    }
  }

  flushProse(i);
  return { blocks, nextIndex: i, stoppedBy: null };
}

/**
 * The deterministic id used for content appearing before the first explicit
 * `@scene` directive — including an entire `@scene`-less prose-only
 * document, where it becomes the only scene. If the author also declares
 * an explicit `@scene main`, that is treated like any other id collision:
 * the existing duplicate-scene validation (AT1003) reports it rather than
 * silently producing two scenes that share an id.
 */
export const SYNTHETIC_LEADING_SCENE_ID = "main";

/** Fallback anchor for a synthetic scene when there is no line to anchor it to (an empty body). */
const DOCUMENT_START_POSITION: SourcePosition = { line: 1, column: 1, offset: 0 };

/**
 * The exact line-terminator bytes immediately following `position`
 * (docs/CORE_SPEC.md Section 25.35) — read directly from the already-
 * computed `SourceLine.newlineLength` of the physical line `position`
 * falls on, never rescanned from raw source. `""` when that line has no
 * terminator at all (true end-of-file).
 */
function lineEndingAt(lines: readonly SourceLine[], position: SourcePosition): "\n" | "\r\n" | "" {
  if (lines.length === 0) return "";
  // `lines` may be a slice starting after stripped frontmatter (docs/CORE_SPEC.md
  // Section 12) — its own first entry's absolute `.number` (never assumed
  // to be 1) anchors the lookup, so this remains correct regardless of
  // whether `lines` is the full document or a post-frontmatter slice.
  const index = position.line - (lines[0] as SourceLine).number;
  const line = lines[index];
  if (!line) return "";
  return line.newlineLength === 2 ? "\r\n" : line.newlineLength === 1 ? "\n" : "";
}

/**
 * Splits the story body into scenes. Content appearing before the first
 * `@scene` directive is collected into a leading scene with id
 * `SYNTHETIC_LEADING_SCENE_ID` ("main"). A document with no leading
 * content and no explicit `@scene` at all — including a completely empty
 * source — still gets an (empty) synthetic main scene, so `StoryDocument`
 * always contains at least one scene and `entryScene` always resolves to
 * a real one.
 */
export function parseScenes(lines: readonly SourceLine[], diagnostics: Diagnostic[]): SceneNode[] {
  const scenes: SceneNode[] = [];

  const leading = parseBlockSequence(lines, 0, diagnostics, new Set());
  if (leading.blocks.length > 0) {
    const end = (leading.blocks[leading.blocks.length - 1] as StoryBlock).span.end;
    scenes.push({
      type: "Scene",
      id: SYNTHETIC_LEADING_SCENE_ID,
      blocks: leading.blocks,
      span: {
        start: lineStart(lines[0] as SourceLine),
        end
      },
      followingLineEnding: lineEndingAt(lines, end)
    });
  }

  let i = leading.nextIndex;
  while (i < lines.length) {
    const sceneLine = lines[i] as SourceLine;
    const directive = matchDirectiveLine(sceneLine.text) as ParsedDirectiveLine;
    const sceneId = directive.args.trim();

    i += 1;
    const seq = parseBlockSequence(lines, i, diagnostics, new Set());
    const span: SourceSpan = {
      start: lineStart(sceneLine),
      end: seq.blocks.length > 0 ? (seq.blocks[seq.blocks.length - 1] as StoryBlock).span.end : lineEnd(sceneLine)
    };
    scenes.push({ type: "Scene", id: sceneId, blocks: seq.blocks, span, followingLineEnding: lineEndingAt(lines, span.end) });
    i = seq.nextIndex;
  }

  if (scenes.length === 0) {
    const start = lines.length > 0 ? lineStart(lines[0] as SourceLine) : DOCUMENT_START_POSITION;
    scenes.push({
      type: "Scene",
      id: SYNTHETIC_LEADING_SCENE_ID,
      blocks: [],
      span: { start, end: start },
      followingLineEnding: lineEndingAt(lines, start)
    });
  }

  return scenes;
}
