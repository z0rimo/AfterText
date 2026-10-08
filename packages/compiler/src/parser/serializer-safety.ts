/**
 * Serializer-boundary-safety predicates (docs/CORE_SPEC.md Section 25.40,
 * "Source-Generation Safety Helpers") — small, additive, compiler-owned
 * public helpers for tools that generate AfterText source (for example
 * structured source editors).
 *
 * These are NOT content validators. They answer a narrower, purely lexical
 * question: can this raw field, once interpolated into generated DSL
 * source, be reinterpreted by the compiler's own tokenizer as additional
 * structure the caller never intended — silently, with zero diagnostic?
 * Content validity (is this a real identifier / expression / duration?)
 * remains entirely the parser's job, via its existing diagnostics
 * (`AT1005`, `AT2001`, unknown-reference, etc.), unaffected by either
 * predicate here.
 *
 * Both predicates reuse the exact lexical facts (`SEPARATOR_WHITESPACE_PATTERN`,
 * `findLastUnescapedArrow`) the actual parser (`blocks.ts`) uses, from the
 * shared, dependency-free `lexical-primitives.ts` module — so this file and
 * the parser's own tokenization cannot silently drift apart. This module
 * itself has no `remark`/`mdast` dependency, so it is safe to re-export
 * from the public compiler surface.
 */

import { findLastUnescapedArrow, SEPARATOR_WHITESPACE_PATTERN } from "./lexical-primitives.js";

/**
 * Conservative gate for a Choice item's `target` field (Section 25.40).
 * Returns `false` whenever `value` contains compiler-recognized separator
 * whitespace, or an unescaped `->` — either of which the Choice parser's own
 * tail grammar (`CHOICE_TAIL_PATTERN`) and last-unescaped-arrow item
 * delimiter (`findLastUnescapedArrow`) could reinterpret as additional
 * structure (an implicit `if <condition>`, or a re-split item/target
 * boundary) rather than the single unconditional target the caller
 * intended.
 *
 * Intentionally conservative, not a complete target validator: a
 * boundary-safe value can still be content-invalid (e.g. `"123"`, which
 * fails `CHOICE_TAIL_PATTERN`'s identifier shape) — that remains the
 * parser's own job via `AT1005`, undisturbed by this predicate. No
 * syntactically valid *unconditional* Choice target ever contains separator
 * whitespace, so this gate never rejects a value that could have been one.
 */
export function isChoiceTargetBoundarySafe(value: string): boolean {
  if (SEPARATOR_WHITESPACE_PATTERN.test(value)) return false;
  if (findLastUnescapedArrow(value) !== -1) return false;
  return true;
}

/**
 * Conservative gate for a Presentation named-argument value (`Music.volume`,
 * `Camera.to`, `Camera.duration`, Section 25.40). Presentation's own
 * argument tokenizer (`tokenizePresentationArgs`) splits `argsText` into
 * tokens on this exact separator-whitespace definition, and reclassifies
 * any resulting `key=value`-shaped token as a distinct named parameter —
 * so a raw value containing separator whitespace could silently inject an
 * additional parameter (or truncate the intended one) rather than remaining
 * one atomic named-argument value.
 *
 * Intentionally conservative, not a numeric/duration validator: a
 * boundary-safe value can still be content-invalid (e.g. `"bananas"` for a
 * volume) — that remains the parser's own job via its existing diagnostics,
 * undisturbed by this predicate.
 */
export function isPresentationNamedArgumentValueBoundarySafe(value: string): boolean {
  return !SEPARATOR_WHITESPACE_PATTERN.test(value);
}
