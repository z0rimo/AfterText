/**
 * Typed presentation commands for @background, @layer, @camera, @music,
 * @sfx, and @pause. The compiler owns parsing, unit normalization (e.g.
 * `6s` / `1200ms` -> milliseconds), and validation of these directives, so
 * runtime code consumes typed values and never re-parses directive text.
 */

export interface BackgroundCommand {
  readonly type: "Background";
  readonly image: string;
}

export interface LayerCommand {
  readonly type: "Layer";
  readonly image: string;
}

/** v0.1 defines a single camera action. New actions extend this union. */
export type CameraAction = "zoom";

export interface CameraZoomCommand {
  readonly type: "Camera";
  readonly action: "zoom";
  readonly to: number;
  /** Milliseconds; absent when the directive didn't specify `duration=`. */
  readonly durationMs: number | undefined;
}

export type CameraCommand = CameraZoomCommand;

export interface MusicCommand {
  readonly type: "Music";
  readonly track: string;
  /** Absent when the directive didn't specify `volume=`. */
  readonly volume: number | undefined;
}

export interface SfxCommand {
  readonly type: "Sfx";
  readonly clip: string;
}

export interface PauseCommand {
  readonly type: "Pause";
  /** Milliseconds. */
  readonly durationMs: number;
}

export type PresentationCommand =
  | BackgroundCommand
  | LayerCommand
  | CameraCommand
  | MusicCommand
  | SfxCommand
  | PauseCommand;
