import { expect } from "vitest";
import { compile } from "@aftertext/compiler";
import type { StoryDocument } from "@aftertext/compiler";
import { createRuntimeState } from "../src/index.js";
import type { RuntimeState } from "../src/index.js";

/** Compiles `source`, asserts it compiled without errors, and returns the document. */
export function compileDoc(source: string): StoryDocument {
  const result = compile(source);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  expect(errors, `expected no diagnostics, got: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  return result.document;
}

/** Compiles `source` and returns both the document and a fresh RuntimeState for it. */
export function freshState(source: string): { readonly document: StoryDocument; readonly state: RuntimeState } {
  const document = compileDoc(source);
  return { document, state: createRuntimeState(document) };
}
