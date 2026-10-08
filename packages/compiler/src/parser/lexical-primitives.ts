/**
 * Pure, dependency-free lexical facts shared between the block parser
 * (`blocks.ts`) and the public serializer-safety predicates
 * (`serializer-safety.ts`, docs/CORE_SPEC.md Section 25.40's "Serializer
 * Injection Safety Amendment"). Deliberately has zero imports — in
 * particular, no `remark`/`mdast` dependency — so it can be safely reached
 * from the public compiler surface (`src/index.ts`) without pulling in
 * anything `parseProseChunk`/`markdown.ts` needs.
 *
 * `blocks.ts` and `serializer-safety.ts` both import these two facts from
 * here rather than each defining/scanning for them independently, so the
 * parser's actual tokenization behavior and the tooling-facing boundary-
 * safety predicates cannot silently drift apart.
 */

/**
 * The exact separator-whitespace definition Presentation argument
 * tokenization (`tokenizePresentationArgs`) and Choice tail parsing
 * (`CHOICE_TAIL_PATTERN`'s `if`-separator) both use to recognize a token
 * boundary — expressed as raw regex source so it can be interpolated into a
 * larger composite pattern (`CHOICE_TAIL_PATTERN`) as well as used directly
 * via `SEPARATOR_WHITESPACE_PATTERN`. Keeping one source string, rather than
 * a hardcoded `\s` duplicated at each use site, is what makes it a true
 * single source of truth — a `RegExp` object alone cannot be spliced into
 * another pattern's literal source.
 */
export const SEPARATOR_WHITESPACE_SOURCE = String.raw`\s`;

/** The exact separator-whitespace definition Presentation argument tokenization (`tokenizePresentationArgs`) and Choice tail parsing both use to recognize a token boundary. */
export const SEPARATOR_WHITESPACE_PATTERN = new RegExp(SEPARATOR_WHITESPACE_SOURCE);

/**
 * Finds the last `->` in `text` that isn't escaped as `\->`, scanning left
 * to right so an escaped arrow inside display text (`A \-> B`) is skipped
 * and only a real, unescaped arrow can act as the Choice item delimiter.
 * Using the *last* unescaped arrow (rather than the first) means display
 * text is free to contain its own literal `->` via escaping without
 * confusing the split. Returns -1 if no unescaped arrow exists.
 */
export function findLastUnescapedArrow(text: string): number {
  let lastIndex = -1;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "-" && text[i + 1] === ">" && text[i - 1] !== "\\") {
      lastIndex = i;
    }
  }
  return lastIndex;
}
