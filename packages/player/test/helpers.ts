import { expect } from "vitest";
import { compile } from "@aftertext/compiler";
import type { StoryDocument } from "@aftertext/compiler";
import { createPlayer } from "../src/index.js";
import type { PlayerState } from "../src/index.js";

/** Compiles `source`, asserts it compiled without errors, and returns the document. */
export function compileDoc(source: string): StoryDocument {
  const result = compile(source);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  expect(errors, `expected no diagnostics, got: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  return result.document;
}

/** Compiles `source` and returns both the document and a freshly created PlayerState for it. */
export function freshPlayer(source: string): { readonly document: StoryDocument; readonly player: PlayerState } {
  const document = compileDoc(source);
  return { document, player: createPlayer(document) };
}
