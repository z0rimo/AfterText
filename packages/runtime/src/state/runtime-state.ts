import type { StoryState } from "./story-state.js";
import type { ReaderState } from "./reader-state.js";
import type { NavigationState } from "./navigation-state.js";

/**
 * The complete runtime state for one reading session: story world,
 * reader memory, and current position, kept as three separate domains
 * rather than one collapsed object. Every field is plain, JSON-serializable
 * data — no `Map`, `Set`, `Date`, class instances, or functions — so it can
 * eventually be saved and loaded without a custom serializer.
 */
export interface RuntimeState {
  readonly story: StoryState;
  readonly reader: ReaderState;
  readonly navigation: NavigationState;
}
