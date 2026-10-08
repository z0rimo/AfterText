import type { SourceSpan } from "../ast/span.js";

export type DiagnosticSeverity = "error" | "warning";

/**
 * Stable diagnostic codes. Numbers are grouped by concern:
 *   1000s — structural (directives, blocks, scenes)
 *   1100s — variants
 *   1200s — frontmatter (`state:` values, overall YAML validity)
 *   1300s — presentation directives (@background/@layer/@camera/@music/@sfx/@pause)
 *   2000s — expressions
 *   3000s — Markdown (warnings for constructs outside the supported subset)
 */
export type DiagnosticCode =
  | "AT1001" // unknown directive
  | "AT1002" // unclosed block
  | "AT1003" // duplicate scene
  | "AT1004" // unknown scene reference
  | "AT1005" // malformed choice item (bullet line that fails to parse as one)
  | "AT1006" // conditional branch appears after "@else" (must be last)
  | "AT1101" // duplicate variant id
  | "AT1102" // variant with no @when branch
  | "AT1103" // unknown Variant reference (e.g. a Reader Memory query argument)
  | "AT1104" // variant branch appears after "@otherwise" (must be last)
  | "AT1201" // unsupported initial state entry (value or key)
  | "AT1202" // invalid frontmatter (YAML syntax error)
  | "AT1301" // malformed presentation directive
  | "AT1302" // presentation numeric value is not representable as a finite number
  | "AT2001" // malformed expression
  | "AT2002" // unknown builtin call name
  | "AT2003" // wrong argument count for a known builtin
  | "AT2004" // Reader Memory builtin argument is not a string literal
  | "AT2005" // expression numeric literal is not representable as a finite number
  | "AT3001"; // unsupported Markdown construct (warning)

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly span: SourceSpan;
}
