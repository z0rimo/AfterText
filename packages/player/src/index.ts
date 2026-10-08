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
  ChoiceResult,
  NavigationResult,
  CompletedResult,
  ErrorResult,
  ExecutionResult,
  RuntimeExecutionErrorKind,
  RuntimeExecutionError
} from "@aftertext/runtime";
