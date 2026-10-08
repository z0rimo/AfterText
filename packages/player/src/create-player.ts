import type { StoryDocument } from "@aftertext/compiler";
import { createRuntimeState, INITIAL_CURSOR } from "@aftertext/runtime";
import type { PlayerState } from "./player-state.js";

/**
 * Creates the initial `PlayerState` for `document` (docs/CORE_SPEC.md
 * Section 18.4). Seeds `runtimeState` via the runtime's own
 * `createRuntimeState`, starts `cursor` at the runtime's initial cursor,
 * and sets `current` to `null`. Performs no narrative execution —
 * `advance()` is never called here; the first execution step remains an
 * explicit `advancePlayer()` call.
 */
export function createPlayer(document: StoryDocument): PlayerState {
  return {
    runtimeState: createRuntimeState(document),
    cursor: INITIAL_CURSOR,
    current: null
  };
}
