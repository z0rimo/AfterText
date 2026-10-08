import type { StoryDocument } from "@aftertext/compiler";
import { advance, type AdvanceOptions } from "@aftertext/runtime";
import type { PlayerState } from "./player-state.js";

/**
 * Advances one step (docs/CORE_SPEC.md Section 18.5). A pure,
 * non-mutating pass-through to runtime `advance()`: calls it with the
 * Player's current `runtimeState`/`cursor`, and returns a new
 * `PlayerState` built from exactly what it returns. Never reinterprets,
 * skips, or auto-consumes any result — content, presentation, choice,
 * navigation, completed, and error are all returned unchanged as
 * `current` (Sections 18.6/18.7/18.10). One `advancePlayer()` call is
 * exactly one runtime `advance()` call.
 */
export function advancePlayer(
  document: StoryDocument,
  player: PlayerState,
  options?: AdvanceOptions
): PlayerState {
  const step = advance(document, player.runtimeState, player.cursor, options);
  return { runtimeState: step.runtimeState, cursor: step.cursor, current: step.result };
}
