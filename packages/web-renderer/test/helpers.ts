import { expect } from "vitest";
import { compile } from "@aftertext/compiler";
import type { StoryDocument } from "@aftertext/compiler";

/** Compiles `source`, asserts it compiled without errors, and returns the document. */
export function compileDoc(source: string): StoryDocument {
  const result = compile(source);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  expect(errors, `expected no diagnostics, got: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  return result.document;
}
