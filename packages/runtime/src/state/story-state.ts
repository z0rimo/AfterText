import type { StateValue } from "@aftertext/compiler";

/**
 * A story-world value. Re-exported from the compiler's canonical
 * `StateValue` rather than redeclared here, so runtime and compiler never
 * drift into two incompatible notions of "allowed state value."
 */
export type StoryValue = StateValue;

/**
 * Current truth of the story world: flat, JSON-serializable key/value
 * state seeded from `StoryDocument.initialState` and (eventually) mutated
 * by `@set` execution. Deliberately a plain object, not a class or `Map`.
 */
export type StoryState = Readonly<Record<string, StoryValue>>;
