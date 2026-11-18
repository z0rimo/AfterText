import type { PresentationCommand } from "@aftertext/compiler";
import { isValidCameraZoom, type MusicPresentationState, type PresentationState, type SpriteState } from "./presentation-state.js";
import {
  boundedArrayLength,
  isFiniteNumber,
  isPlainRecord,
  type PresentationRestoreError,
  type PresentationSnapshot
} from "./snapshot-types.js";

const PRESENTATION_FORMAT_VERSION = 1;

type RestorePresentationResult = { readonly ok: true; readonly state: PresentationState } | { readonly ok: false; readonly error: PresentationRestoreError };

function malformed(reason: string): RestorePresentationResult {
  return { ok: false, error: { kind: "malformedSnapshot", reason } };
}

/**
 * Pure internal `PresentationState -> PresentationSnapshot` conversion
 * (docs/CORE_SPEC.md Section 33.10). Never exposes the internal
 * `PresentationState` object itself: `music`/`sprites` are always fresh
 * objects/arrays, so a caller mutating the returned snapshot can never
 * mutate live renderer state. `music.volume` is normalized to absent
 * when non-finite (Section 33.10) — the same normalization
 * `applyMusicIntent`'s playback path already applies for a different
 * reason (`audio-playback.ts`'s `normalizePlaybackVolume`), kept
 * independent here since this one must affect what the snapshot
 * *stores*, not merely what is played.
 */
export function snapshotPresentation(state: PresentationState): PresentationSnapshot {
  return {
    formatVersion: PRESENTATION_FORMAT_VERSION,
    background: state.background,
    layer: state.layer,
    cameraZoom: state.cameraZoom,
    music: snapshotMusic(state.music),
    sprites: state.sprites.map((sprite) => ({ id: sprite.id, image: sprite.image, position: sprite.position }))
  };
}

function snapshotMusic(music: MusicPresentationState | null): PresentationSnapshot["music"] {
  if (music === null) return null;
  return isFiniteNumber(music.volume) ? { track: music.track, volume: music.volume } : { track: music.track };
}

/**
 * Validates and decodes an untrusted `music` field (Section 33.11). `null`
 * is valid. A present `volume` key must carry a finite number — an
 * explicitly-present non-finite/`null`/`undefined` value is rejected, not
 * silently treated the same as an absent key, which instead means "no
 * authored volume, renderer default" (Section 33.10). Returns `undefined`
 * only for an invalid shape, never for the valid `null` case, so callers
 * can distinguish "invalid" from "valid, no Music."
 */
function decodeMusic(value: unknown): { readonly music: MusicPresentationState | null } | undefined {
  if (value === null) return { music: null };
  if (!isPlainRecord(value)) return undefined;
  if (typeof value.track !== "string") return undefined;
  if (!Object.hasOwn(value, "volume")) return { music: { track: value.track, volume: undefined } };
  const volume = value.volume;
  return isFiniteNumber(volume) ? { music: { track: value.track, volume } } : undefined;
}

/**
 * Validates and decodes an untrusted `sprites` field (Section 33.11):
 * must be an array, each entry a plain record with `id`/`image: string`
 * and `position` one of the three authored literals, with no two entries
 * sharing an `id` — live `PresentationState` can never contain a
 * duplicate sprite id by construction (`applyPresentation`'s `ShowSprite`
 * case always replaces in place), so a snapshot claiming otherwise
 * describes an impossible state and is rejected, never silently
 * deduplicated. Iterates by index up to a single, bounded length read
 * (`boundedArrayLength`) rather than `.every()`/`for...of`, for the same
 * untrusted-array reasons as `@aftertext/player` (`snapshot-types.ts`).
 */
function decodeSprites(value: unknown): readonly SpriteState[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const length = boundedArrayLength(value);
  if (length === undefined) return undefined;

  const sprites: SpriteState[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < length; i++) {
    const raw = value[i];
    if (!isPlainRecord(raw)) return undefined;
    const { id, image, position } = raw;
    if (typeof id !== "string" || typeof image !== "string") return undefined;
    if (position !== "left" && position !== "center" && position !== "right") return undefined;
    if (seenIds.has(id)) return undefined;
    seenIds.add(id);
    sprites.push({ id, image, position });
  }
  return sprites;
}

/**
 * Validates an untrusted `value` as a `PresentationSnapshot` and decodes
 * it to a fresh internal `PresentationState` (docs/CORE_SPEC.md Section
 * 33.11). Accepts `unknown`; never throws; never uses a generic schema
 * library. Never retains any caller-owned object: a caller mutating
 * `value` after this returns can never alter the resulting
 * `PresentationState` (Section 33.17's untrusted-input posture).
 */
export function restorePresentation(value: unknown): RestorePresentationResult {
  if (!isPlainRecord(value)) return malformed("snapshot is not a plain object.");
  if (value.formatVersion !== PRESENTATION_FORMAT_VERSION) {
    return { ok: false, error: { kind: "unsupportedFormatVersion" } };
  }

  const { background, layer, cameraZoom } = value;
  if (typeof background !== "string" && background !== null) return malformed("background must be a string or null.");
  if (typeof layer !== "string" && layer !== null) return malformed("layer must be a string or null.");
  if (!isFiniteNumber(cameraZoom) || !isValidCameraZoom(cameraZoom)) {
    return malformed("cameraZoom must be a finite number greater than zero.");
  }

  const decodedMusic = decodeMusic(value.music);
  if (decodedMusic === undefined) return malformed("music must be null, or a record with track: string and an optional finite volume.");

  const sprites = decodeSprites(value.sprites);
  if (sprites === undefined) return malformed("sprites must be an array of unique-id { id, image, position } records.");

  return { ok: true, state: { background, layer, cameraZoom, music: decodedMusic.music, sprites } };
}

function musicVolumeMatches(commandVolume: number | undefined, presentationVolume: number | undefined): boolean {
  return isFiniteNumber(commandVolume) ? presentationVolume === commandVolume : presentationVolume === undefined;
}

/**
 * Whether a resolved `current` Presentation command is consistent with an
 * independently-restored `PresentationState` (docs/CORE_SPEC.md Section
 * 33.12): whenever a live session's `advancePlayer` result is a
 * `presentation` suspension, the same transition has already applied
 * that exact command via `applyPresentation`, so a live session can never
 * actually disagree between the two — an untrusted pairing that does is
 * a combination no live session could ever produce, even when neither
 * half is individually malformed. Mirrors `applyPresentation`'s own
 * per-command semantics as a check rather than a mutation; `Sfx`/`Pause`
 * impose no constraint, matching their having no persistent
 * `PresentationState` effect.
 */
export function presentationStateMatchesCommand(command: PresentationCommand, presentation: PresentationState): boolean {
  switch (command.type) {
    case "Background":
      return presentation.background === command.image;
    case "Layer":
      return presentation.layer === command.image;
    case "Camera":
      return !isValidCameraZoom(command.to) || presentation.cameraZoom === command.to;
    case "Music":
      return (
        presentation.music !== null &&
        presentation.music.track === command.track &&
        musicVolumeMatches(command.volume, presentation.music.volume)
      );
    case "Sfx":
    case "Pause":
      return true;
    case "ShowSprite": {
      const sprite = presentation.sprites.find((s) => s.id === command.id);
      return sprite !== undefined && sprite.image === command.image && sprite.position === command.position;
    }
    case "HideSprite":
      return !presentation.sprites.some((s) => s.id === command.id);
  }
}
