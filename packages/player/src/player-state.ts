import type { ExecutionCursor, ExecutionResult, RuntimeState } from "@aftertext/runtime";

/**
 * The minimum state a headless Player Core session needs to thread between
 * calls (docs/CORE_SPEC.md Section 18.2). A thin, three-field wrapper:
 *
 * - `runtimeState` is the authoritative runtime state, stored once and
 *   never reinterpreted — `StoryState`/`ReaderState`/`NavigationState`
 *   remain exactly where the runtime already keeps them, never duplicated
 *   into separate `PlayerState` fields.
 * - `cursor` is the authoritative, opaque runtime execution cursor,
 *   threaded exactly as `advance()`/`selectChoice()` return it.
 * - `current` is the most recently exposed runtime `ExecutionResult`.
 *   `current === null` means the player was created but no narrative
 *   execution has occurred yet.
 *
 * Immutable/caller-owned, matching every other value in this stack — no
 * function in this package ever mutates a `PlayerState` it is given.
 */
export interface PlayerState {
  readonly runtimeState: RuntimeState;
  readonly cursor: ExecutionCursor;
  readonly current: ExecutionResult | null;
}
