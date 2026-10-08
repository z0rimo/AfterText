/**
 * Resource limits that keep the recursive parts of the compiler (and the
 * runtime that walks its output) inside the call stack. Exceeding one is an
 * ordinary source error reported as a diagnostic, never an exception.
 */

/**
 * Maximum height of an expression tree and of parser recursion. Each nested
 * parenthesis consumes two levels of the recursion budget, so about half this
 * many parentheses fit; binary chains, unary chains and calls reach the limit.
 */
export const MAX_EXPRESSION_DEPTH = 256;

/** Maximum nesting of `@if` / `@variant` constructs inside one another. */
export const MAX_BLOCK_DEPTH = 64;

/** Maximum nesting of inline Markdown nodes (emphasis, strong, links). */
export const MAX_INLINE_DEPTH = 100;
