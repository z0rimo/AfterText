// Public API surface. Only runtime-owned domain types and the small set of
// pure functions that operate on them are exported — no internal helpers,
// no mutable module-level state, and nothing from `@aftertext/compiler`
// re-exported here (consumers that need compiler types import them from
// `@aftertext/compiler` directly).

export type { StoryValue, StoryState } from "./state/story-state.js";
export type { ReaderState } from "./state/reader-state.js";
export type { NavigationState } from "./state/navigation-state.js";
export type { RuntimeState } from "./state/runtime-state.js";

export type { SceneVisitMemory } from "./reader/scene-memory.js";
export { recordSceneVisit, hasVisitedScene, getSceneVisitCount } from "./reader/scene-memory.js";

export type { VariantMemory } from "./reader/variant-memory.js";
export {
  recordVariantSeen,
  hasVariantChangedSinceRead,
  hasSeenVariant,
  getLastSeenVariantBranch
} from "./reader/variant-memory.js";

export { createRuntimeState } from "./create-runtime-state.js";

// Execution core (docs/CORE_SPEC.md Sections 17.5–17.13). Pure,
// caller-owned; no session wrapper is exported here — see Section 17.13.

export type { ExecutionCursor } from "./execution/cursor.js";
export { INITIAL_CURSOR } from "./execution/cursor.js";

export type {
  AvailableChoiceItem,
  ContentResult,
  PresentationResult,
  ChoiceResult,
  NavigationResult,
  CompletedResult,
  ErrorResult,
  ExecutionResult,
  ExecutionStep
} from "./execution/result.js";

export type { RuntimeExecutionErrorKind, RuntimeExecutionError } from "./execution/errors.js";
export { RuntimeErrors } from "./execution/errors.js";

// evaluateExpression/evaluateCondition are deliberately NOT re-exported here.
// docs/CORE_SPEC.md Section 17.8 describes "a pure evaluator" only as
// machinery internal to @set/Conditional/Variant/Choice execution — unlike
// resolveVariant (explicitly named as its own public operation in Section
// 17.7), no current documented consumer need requires calling it directly,
// and nothing in advance()/selectChoice()'s own public contract requires a
// caller to import it. It remains exported from ./execution/expression.js
// for internal use and direct unit testing.
//
// EvaluationContext IS exported: resolveVariant's public signature now
// requires one (Section 17.17), so its shape must be public even though
// the evaluator functions that also take it are not.

export type { EvaluationContext } from "./execution/expression.js";

export type { ResolvedVariant, VariantResolution } from "./execution/variant.js";
export { resolveVariant } from "./execution/variant.js";

export type { AdvanceOptions } from "./execution/advance.js";
export { advance } from "./execution/advance.js";

export { selectChoice } from "./execution/choice.js";
