// Public API surface for the headless Player Core (docs/CORE_SPEC.md
// Section 18). A thin application layer over @aftertext/runtime: it owns
// only `PlayerState` and the three pure transitions over it. All narrative
// semantics — StoryState, ReaderState, NavigationState, the execution
// cursor, expression evaluation, Reader Memory, Choice validation, Variant
// resolution, navigation, and execution errors — remain the runtime's.
//
// Only the runtime result types a consumer needs to narrow
// `PlayerState.current` (or to construct `advancePlayer`'s options) are
// re-exported, by reference to the existing runtime types — never
// redefined — and no unrelated runtime internals are re-exported.

export type { PlayerState } from "./player-state.js";
export { createPlayer } from "./create-player.js";
export { advancePlayer } from "./advance-player.js";
export { selectPlayerChoice } from "./select-player-choice.js";

export type {
  AdvanceOptions,
  AvailableChoiceItem,
  ContentResult,
  PresentationResult,
  DialogueResult,
  ChoiceResult,
  NavigationResult,
  CompletedResult,
  ErrorResult,
  ExecutionResult,
  RuntimeExecutionErrorKind,
  RuntimeExecutionError
} from "@aftertext/runtime";

// Save/Restore (docs/CORE_SPEC.md Section 33). Player owns the public
// JSON-compatible snapshot/restore boundary; `JsonValue`/`PlayerSnapshot`/
// `PlayerRestoreError`/`RestorePlayerResult` are the only new public
// types, and `snapshotPlayer`/`restorePlayer` the only new public
// functions — every production module's own private descriptor/
// validation types (`SnapshotCurrent`, the document-fingerprint
// canonical tree, `DocumentIndex`) stay internal to this package.

export type { JsonValue, PlayerSnapshot, PlayerRestoreError, RestorePlayerResult } from "./snapshot-types.js";
export { snapshotPlayer } from "./snapshot-player.js";
export { restorePlayer } from "./restore-player.js";
