import type { PresentationCommand } from "@aftertext/compiler";
import type { PlayerState } from "@aftertext/player";

/**
 * The accepted persistent semantic Music state (docs/CORE_SPEC.md
 * Section 23.5): the raw authored `track` reference and raw authored
 * `volume`, exactly as the compiler produced them — never a resolved
 * browser URL, never an `HTMLAudioElement`, `Promise`, timer, listener, or
 * playback-status flag. Those live entirely outside `PresentationState`,
 * in renderer-local ephemeral ownership (`audio-playback.ts`,
 * `after-text-player.tsx`).
 */
export interface MusicPresentationState {
  readonly track: string;
  readonly volume: number | undefined;
}

/**
 * Renderer-only persistent visual/audio-semantic state (docs/CORE_SPEC.md
 * Section 20.5, 22.6, 23.5). Stores the raw author-provided `image`/`track`
 * references verbatim — never a resolved browser URL (Section 20.8) — so a
 * host can swap `resolveAsset` without replaying narrative execution.
 * `cameraZoom` is the accepted persistent absolute zoom scale (Section
 * 22.3/22.6); `music` is the accepted persistent semantic Music state
 * (Section 23.5) or `null` when no Music has been accepted yet. None of
 * these fields ever hold an animation handle, timer ID, browser media
 * object, or other ephemeral bookkeeping (Section 22.9, 23.30) — those
 * live in the separate, ephemeral `TimedPresentationGate`
 * (`timed-presentation.ts`) or audio ownership (`audio-playback.ts`).
 * Lives entirely inside `@aftertext/web-renderer`; never added to
 * `RuntimeState`/`StoryState`/`ReaderState`/`NavigationState`/`PlayerState`/
 * `ExecutionCursor`.
 */
export interface PresentationState {
  readonly background: string | null;
  readonly layer: string | null;
  readonly cameraZoom: number;
  readonly music: MusicPresentationState | null;
}

export const INITIAL_PRESENTATION_STATE: PresentationState = {
  background: null,
  layer: null,
  cameraZoom: 1,
  music: null
};

/**
 * A valid renderer zoom is any finite number greater than zero (Section
 * 22.4). `0`, negative values, `Infinity`/`-Infinity`, and (defensively)
 * `NaN` are all invalid.
 */
function isValidCameraZoom(to: number): boolean {
  return Number.isFinite(to) && to > 0;
}

/**
 * Pure Background/Layer/Camera/Music transition (docs/CORE_SPEC.md
 * Section 20.3/20.8, 22.6, 23.3, 23.7–23.8). `Background`/`Layer` replace
 * their respective single slot; a `Camera` command replaces `cameraZoom`
 * only when its `to` is valid (Section 22.5) — an invalid `to` leaves
 * `cameraZoom` unchanged (same reference), never emitting an invalid
 * value, and never throwing; a `Music` command unconditionally replaces
 * `music` with its raw `track`/`volume`, even when an identical track is
 * already current — every authored Music command is a new observable
 * event, never suppressed/deduplicated by value equality (Section 23.8).
 * `Sfx`/`Pause` leave `PresentationState` unchanged (returns the same
 * reference) — Sfx has no persistent semantic state by design (Section
 * 23.13). Exhaustive over `PresentationCommand` — no permissive `default`.
 */
export function applyPresentation(state: PresentationState, command: PresentationCommand): PresentationState {
  switch (command.type) {
    case "Background":
      return { ...state, background: command.image };
    case "Layer":
      return { ...state, layer: command.image };
    case "Camera":
      return isValidCameraZoom(command.to) ? { ...state, cameraZoom: command.to } : state;
    case "Music":
      return { ...state, music: { track: command.track, volume: command.volume } };
    case "Sfx":
    case "Pause":
      return state;
  }
}

/**
 * The common Player-result acceptance rule (docs/CORE_SPEC.md Section
 * 20.10): applies `applyPresentation` only when `player.current` is a
 * `presentation` result, otherwise returns `previousPresentation`
 * unchanged. Used identically after every renderer-triggered Player
 * transition (`advancePlayer` and `selectPlayerChoice` alike), so
 * Presentation application is tied to the Player result actually
 * produced, not to an assumption about which function can produce it.
 */
export function acceptPlayerState(previousPresentation: PresentationState, player: PlayerState): PresentationState {
  if (player.current?.type === "presentation") {
    return applyPresentation(previousPresentation, player.current.command);
  }
  return previousPresentation;
}
