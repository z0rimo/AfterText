import type { MusicCommand, SfxCommand } from "@aftertext/compiler";
import { isSafeAudioUrl } from "./asset-safety.js";

export type AudioAssetKind = "music" | "sfx";
export type ResolveAudioAsset = (ref: string, kind: AudioAssetKind) => string | null;

/**
 * Maps an authored `volume` to a value `HTMLMediaElement.volume` will
 * accept — it only accepts `[0, 1]` and throws outside that range
 * (docs/CORE_SPEC.md Section 23.9): `undefined`/non-finite (`NaN`,
 * `Infinity`, `-Infinity`) default to `1`; an in-range value passes
 * through unchanged; an out-of-range finite value clamps to `[0, 1]`.
 * This never changes what `PresentationState.music.volume` stores — only
 * what is actually applied to the element. Pure, exported for direct unit
 * testing.
 */
export function normalizePlaybackVolume(volume: number | undefined): number {
  if (volume === undefined || !Number.isFinite(volume)) return 1;
  if (volume < 0) return 0;
  if (volume > 1) return 1;
  return volume;
}

/**
 * Lazily creates the single owned Music element the first time it's
 * needed (docs/CORE_SPEC.md Section 23.11) — never constructed until a
 * Music command actually arrives.
 */
export function getOrCreateMusicElement(ref: { current: HTMLAudioElement | null }): HTMLAudioElement {
  if (ref.current === null) {
    ref.current = new Audio();
  }
  return ref.current;
}

/**
 * `play()` is attempted best-effort: a synchronous throw and a rejected
 * Promise are both swallowed as renderer-local, non-fatal failures
 * (docs/CORE_SPEC.md Section 23.19/23.20) — this never produces an
 * unhandled Promise rejection, and never blocks or delays the caller.
 */
function attemptPlay(element: HTMLAudioElement): void {
  try {
    const result = element.play();
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        // Autoplay restriction, load failure, etc. — non-fatal.
      });
    }
  } catch {
    // A synchronous play() throw — equally non-fatal.
  }
}

/**
 * Applies one authored Music command to the single owned Music element
 * (docs/CORE_SPEC.md Section 23.7, 23.9, 23.11): resolves and validates
 * the track, retargets the element, applies the normalized volume, and
 * unconditionally restarts playback from the beginning — including when
 * the track reference is unchanged from what was already playing (Section
 * 23.8, 23.10). `element.load()` forces a deterministic reset regardless
 * of whether `src` actually changed, rather than depending on
 * browser-specific behavior for an unchanged `src` assignment. A resolver
 * returning `null`, an unsafe URL, or any synchronous browser failure
 * during this sequence is swallowed as renderer-local and non-fatal
 * (Section 23.19) — the caller's committed `PresentationState.music`
 * update proceeds independently either way.
 */
export function applyMusicIntent(
  element: HTMLAudioElement,
  command: MusicCommand,
  resolveAsset: ResolveAudioAsset
): void {
  const resolved = resolveAsset(command.track, "music");
  if (resolved === null || !isSafeAudioUrl(resolved)) return;

  try {
    element.pause();
    element.src = resolved;
    element.volume = normalizePlaybackVolume(command.volume);
    element.load();
  } catch {
    return;
  }
  attemptPlay(element);
}

/**
 * Stops the owned Music element (docs/CORE_SPEC.md Section 23.21).
 * Safe even if it never successfully played, has no `src`, already
 * ended, or its last `play()` was rejected — never throws.
 */
export function stopMusicElement(element: HTMLAudioElement | null): void {
  if (element === null) return;
  try {
    element.pause();
  } catch {
    // Stopping is always best-effort.
  }
}

/**
 * Creates and plays one independent, fire-and-forget Sfx instance for one
 * authored Sfx occurrence (docs/CORE_SPEC.md Section 23.13–23.15): a
 * fresh element per occurrence (never a shared/pooled element), tracked in
 * `activeSfx` only for lifecycle cleanup — never for deduplication or
 * interruption — and automatically untracked once it naturally ends or
 * fails. A resolver returning `null`, an unsafe URL, or any synchronous
 * browser failure is swallowed as renderer-local and non-fatal (Section
 * 23.19); no instance is tracked in that case.
 */
export function applySfxIntent(
  command: SfxCommand,
  resolveAsset: ResolveAudioAsset,
  activeSfx: Set<HTMLAudioElement>
): void {
  const resolved = resolveAsset(command.clip, "sfx");
  if (resolved === null || !isSafeAudioUrl(resolved)) return;

  let element: HTMLAudioElement;
  try {
    element = new Audio(resolved);
  } catch {
    return;
  }

  const untrack = (): void => {
    element.removeEventListener("ended", untrack);
    element.removeEventListener("error", untrack);
    activeSfx.delete(element);
  };
  element.addEventListener("ended", untrack);
  element.addEventListener("error", untrack);
  activeSfx.add(element);

  attemptPlay(element);
}

/**
 * Stops and clears every currently tracked active Sfx instance
 * (docs/CORE_SPEC.md Section 23.16, 23.22) — used on Restart, document
 * replacement, and component unmount. Never throws.
 */
export function stopAndClearSfx(activeSfx: Set<HTMLAudioElement>): void {
  for (const element of activeSfx) {
    try {
      element.pause();
    } catch {
      // Stopping is always best-effort.
    }
  }
  activeSfx.clear();
}
