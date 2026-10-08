import type { StoryDocument } from "@aftertext/compiler";
import type { RuntimeState } from "./state/runtime-state.js";

/**
 * Builds the initial `RuntimeState` for a compiled `StoryDocument`.
 *
 * `navigation.sceneId` is taken directly from the compiler's normalized
 * `document.entryScene` — the runtime never guesses or re-derives an entry
 * scene. `story` is a fresh shallow copy of `document.initialState`, so
 * later mutating the returned runtime state can never alter the compiler's
 * output (every allowed state value is itself an immutable primitive, so a
 * shallow copy is already a full copy).
 */
export function createRuntimeState(document: StoryDocument): RuntimeState {
  return {
    story: { ...document.initialState },
    reader: { visitedScenes: {}, seenVariants: {} },
    navigation: { sceneId: document.entryScene }
  };
}
