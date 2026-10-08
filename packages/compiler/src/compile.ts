import type { StoryDocument } from "./ast/story.js";
import type { Diagnostic } from "./diagnostics/types.js";
import { parseDocument } from "./parser/document.js";
import { validate } from "./validation/validate.js";

export interface CompileResult {
  /** The compiled Story AST. Always present — this compiler recovers from
   *  ordinary source errors rather than failing to produce a document. */
  readonly document: StoryDocument;
  readonly diagnostics: readonly Diagnostic[];
  /**
   * `true` when `diagnostics` contains at least one `severity: "error"`
   * entry. Warnings (e.g. AT3001) do not count — `document` is still a
   * reasonable best-effort result even when this is `true`.
   */
  readonly hasErrors: boolean;
}

/**
 * Compiles AfterText source into a validated Story AST plus diagnostics.
 *
 * Pipeline: directive scanning → Markdown parsing of prose regions →
 * Story AST construction → validation → CompileResult. Ordinary source
 * errors (unknown directives, unclosed blocks, malformed expressions,
 * dangling references) are reported as diagnostics; this function does
 * not throw for them.
 */
export function compile(source: string): CompileResult {
  const { document, diagnostics } = parseDocument(source);
  const validationDiagnostics = validate(document);
  const allDiagnostics = [...diagnostics, ...validationDiagnostics];
  const hasErrors = allDiagnostics.some((d) => d.severity === "error");
  return { document, diagnostics: allDiagnostics, hasErrors };
}
