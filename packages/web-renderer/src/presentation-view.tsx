import type { PresentationCommand } from "@aftertext/compiler";
import type { ReactNode } from "react";
import { isTimedCommand } from "./timed-presentation.js";

/**
 * A small, readable acknowledgment of `command`'s type and identifying
 * field(s) — inert by design (docs/CORE_SPEC.md Section 19.13): no
 * asset loading, audio/SFX playback, or animation. An exhaustive switch
 * (no `default`) so a future `PresentationCommand` variant is surfaced by
 * TypeScript rather than silently swallowed.
 */
function describe(command: PresentationCommand): string {
  switch (command.type) {
    case "Background":
      return `Background: ${command.image}`;
    case "Layer":
      return `Layer: ${command.image}`;
    case "Camera":
      return `Camera zoom to ${command.to}${command.durationMs !== undefined ? ` over ${command.durationMs}ms` : ""}`;
    case "Music":
      return `Music: ${command.track}${command.volume !== undefined ? ` (volume ${command.volume})` : ""}`;
    case "Sfx":
      return `Sfx: ${command.clip}`;
    case "Pause":
      return `Pause: ${command.durationMs}ms`;
  }
}

/** The in-progress label shown while a timed command is still locked (Section 22.28). */
function inProgressLabel(command: PresentationCommand): string {
  return command.type === "Camera" ? "Animating…" : "Waiting…";
}

export interface PresentationViewProps {
  readonly command: PresentationCommand;
  /** Advances past this Presentation suspension (docs/CORE_SPEC.md Section 19.13). */
  readonly onAdvance: () => void;
  /**
   * Only meaningful when `isTimedCommand(command)` is true — `Pause`
   * always (Section 21.3), or `Camera` with an explicit `durationMs`
   * (Section 22.16, 22.29); ignored for every other command (including a
   * durationless Camera), which keeps its existing immediate-Next
   * behavior regardless of this value.
   */
  readonly timedUnlocked: boolean;
}

/**
 * Centralizes both the command acknowledgement and its continuation
 * control. Every non-timed command keeps the original immediate Next
 * action (Section 21.22, 22.14). A timed command (`Pause`; `Camera` with
 * an explicit `durationMs`, including `0`) uses a real timing gate
 * (Section 21.3, 22.15–22.16): while locked, no Next/Continue action is
 * rendered at all — not merely disabled — and only an in-progress label
 * is shown; once unlocked, an explicit Continue action appears. Applying
 * the visual/acknowledgement never auto-consumes the suspension either
 * way.
 */
export function PresentationView({ command, onAdvance, timedUnlocked }: PresentationViewProps): ReactNode {
  if (isTimedCommand(command)) {
    return (
      <div>
        <p>{describe(command)}</p>
        {timedUnlocked ? (
          <button type="button" onClick={onAdvance}>
            Continue
          </button>
        ) : (
          <p>{inProgressLabel(command)}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p>{describe(command)}</p>
      <button type="button" onClick={onAdvance}>
        Next
      </button>
    </div>
  );
}
