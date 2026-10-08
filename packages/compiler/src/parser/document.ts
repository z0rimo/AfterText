import type { StoryDocument } from "../ast/story.js";
import type { Diagnostic } from "../diagnostics/types.js";
import { extractFrontmatter } from "./frontmatter.js";
import { parseScenes, SYNTHETIC_LEADING_SCENE_ID } from "./blocks.js";

export interface ParseResult {
  readonly document: StoryDocument;
  readonly diagnostics: Diagnostic[];
}

/**
 * Resolves the normalized entry scene: the author's explicit `entry` if
 * given, otherwise the document's first scene, otherwise the synthetic
 * leading scene id. Whether an explicit `entry` actually names a real
 * scene is checked later, during validation (AT1004) — this function
 * always returns a concrete id so runtime code has something to start
 * from even for a document with dangling or absent scenes.
 */
function resolveEntryScene(
  entry: string | undefined,
  scenes: ReadonlyArray<{ readonly id: string }>
): string {
  if (entry !== undefined && entry.length > 0) return entry;
  return scenes[0]?.id ?? SYNTHETIC_LEADING_SCENE_ID;
}

/**
 * Parses raw AfterText source into a StoryDocument. This stage never
 * throws for ordinary malformed input — recoverable problems are recorded
 * as diagnostics and parsing continues on a best-effort basis.
 */
export function parseDocument(source: string): ParseResult {
  const { metadata, initialState, bodyLines, diagnostics } = extractFrontmatter(source);
  const scenes = parseScenes(bodyLines, diagnostics);
  const entryScene = resolveEntryScene(metadata.entry, scenes);

  const document: StoryDocument = { type: "StoryDocument", metadata, initialState, entryScene, scenes };
  return { document, diagnostics };
}
