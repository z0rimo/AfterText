import type { SceneVisitMemory } from "../reader/scene-memory.js";
import type { VariantMemory } from "../reader/variant-memory.js";

/**
 * Facts about what the reader has experienced — distinct from `StoryState`
 * (the current truth of the story world). See `docs/CORE_SPEC.md`:
 * `StoryState != ReaderState` is a locked architectural requirement.
 *
 * `VariantMemory` is nested here rather than being an independent
 * top-level runtime state, by design.
 */
export interface ReaderState {
  readonly visitedScenes: Readonly<Record<string, SceneVisitMemory>>;
  readonly seenVariants: Readonly<Record<string, VariantMemory>>;
}
