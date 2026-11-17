import type { StoryDocument } from "@aftertext/compiler";
import { toCursorPosition } from "@aftertext/runtime";
import { computeDocumentFingerprint } from "./document-fingerprint.js";
import { encodeCurrent } from "./snapshot-current.js";
import type { PlayerState } from "./player-state.js";
import type { JsonValue, PlayerSnapshot } from "./snapshot-types.js";

const FORMAT_VERSION = 1;

/** The shared opaque sentinel for a current kind with no structural position (docs/CORE_SPEC.md Section 33.7). */
const NO_POSITION: JsonValue = { kind: "none" };

/**
 * Takes a snapshot of `player` (docs/CORE_SPEC.md Section 33.6). Pure, no
 * mutation. `runtimeState` may share object identity with the live
 * `PlayerState` it was taken from — this is intentional and consistent
 * with this codebase's existing immutable-by-convention policy (Section
 * 33.6); nothing here deep-clones it.
 *
 * `position` is derived via Runtime's own `toCursorPosition` for every
 * kind that has a structural position (content/dialogue/presentation/
 * choice/error); `notStarted`/`navigation`/`completed` have none and use
 * the shared opaque `NO_POSITION` sentinel instead.
 */
export function snapshotPlayer(document: StoryDocument, player: PlayerState): PlayerSnapshot {
  const resultType = player.current?.type;
  const position =
    resultType === undefined || resultType === "navigation" || resultType === "completed"
      ? NO_POSITION
      : toCursorPosition(player.runtimeState, player.cursor);

  return {
    formatVersion: FORMAT_VERSION,
    documentFingerprint: computeDocumentFingerprint(document),
    runtimeState: player.runtimeState,
    position,
    current: encodeCurrent(player.current)
  };
}
