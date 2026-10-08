import type { StoryDocument } from "@aftertext/compiler";
import { RuntimeErrors, selectChoice, type ExecutionStep } from "@aftertext/runtime";
import type { PlayerState } from "./player-state.js";

/**
 * Resolves a Choice selection (docs/CORE_SPEC.md Section 18.7). When
 * `player.current` is a Choice result, reconstructs the exact
 * `ExecutionStep` runtime `selectChoice()` requires from Player's own
 * three fields and delegates entirely to it — never re-evaluating
 * conditions, never reconstructing items from the source AST, never
 * adding a `ChoiceRecord` or a freshness check. `selectChoice` remains
 * the sole authority for validating `index`, and its existing replay/fork
 * semantics apply unchanged: an older, still-valid `PlayerState` may be
 * selected from independently and repeatedly.
 *
 * If `player.current` is not a Choice result, this is defensive
 * application-API behavior (Section 18.8), never a thrown exception and
 * never a new Player-specific error type. When an `ExecutionStep` already
 * exists (`current` is `content`/`presentation`/`navigation`/`completed`/
 * `error`), delegating to `selectChoice` itself is the source of this
 * rejection — it already refuses a suspension that isn't a choice. Only
 * for `current === null`, where no `ExecutionStep` exists yet to delegate
 * to, is the identical runtime error outcome constructed directly here,
 * via the existing `RuntimeErrors` factory.
 */
export function selectPlayerChoice(document: StoryDocument, player: PlayerState, index: number): PlayerState {
  if (player.current === null) {
    return {
      runtimeState: player.runtimeState,
      cursor: player.cursor,
      current: {
        type: "error",
        error: RuntimeErrors.invalidChoiceSelection("Not currently suspended on a choice.")
      }
    };
  }

  const suspension: ExecutionStep = {
    runtimeState: player.runtimeState,
    cursor: player.cursor,
    result: player.current
  };
  const step = selectChoice(document, suspension, index);
  return { runtimeState: step.runtimeState, cursor: step.cursor, current: step.result };
}
