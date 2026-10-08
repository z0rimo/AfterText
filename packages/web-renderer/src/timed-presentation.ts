import type { PresentationCommand } from "@aftertext/compiler";
import type { PlayerState, PresentationResult } from "@aftertext/player";

/**
 * True when `command` participates in the timed lock/unlock Presentation
 * gate (docs/CORE_SPEC.md Section 21.3, 22.16, 22.29): `Pause` always
 * (its `durationMs` is never optional), and `Camera` only when it carries
 * an explicit `durationMs` — a durationless Camera is never timed, and
 * `durationMs === 0` is explicitly timed, distinct from omitted (Section
 * 22.14–22.15). This is the single source of truth for the classification;
 * it is deliberately limited to exactly these two current cases, not an
 * extensible predicate registry.
 */
export function isTimedCommand(command: PresentationCommand): boolean {
  return command.type === "Pause" || (command.type === "Camera" && command.durationMs !== undefined);
}

/**
 * Renderer-local association between one exact timed Presentation
 * suspension (a `Pause`, or a `Camera` with an explicit `durationMs`) and
 * whether its wait has elapsed (Section 21.8, generalized in 22.18).
 * `unlocked` is meaningful only for `suspension` itself — a gate left
 * over from any other suspension (including an earlier one with an
 * identical command type/duration/target) must never be read as unlocked
 * for a new one. Renderer-internal only: never added to `PlayerState`/
 * `RuntimeState`/`PresentationState`/the compiler AST (Section 21.7).
 */
export interface TimedPresentationGate {
  readonly suspension: PresentationResult | null;
  readonly unlocked: boolean;
}

export const INITIAL_TIMED_GATE: TimedPresentationGate = { suspension: null, unlocked: false };

/**
 * The current timed Presentation suspension, if any (Section 21.2/21.9,
 * 22.29). The actual `PresentationResult` object reference is used as
 * identity — Player Core constructs a fresh result object on every
 * `advancePlayer`/`selectPlayerChoice` call, so two structurally identical
 * timed commands (even equal `durationMs`/`to`) are never the same
 * suspension.
 */
export function getCurrentTimedPresentation(player: PlayerState): PresentationResult | null {
  const current = player.current;
  return current?.type === "presentation" && isTimedCommand(current.command) ? current : null;
}

/**
 * The authored duration (milliseconds) for a suspension already confirmed
 * timed by `getCurrentTimedPresentation`/`isTimedCommand`. The final
 * `return 0` is defensively unreachable given that filtering — it exists
 * only so this function can never throw.
 */
export function getTimedDurationMs(suspension: PresentationResult): number {
  const { command } = suspension;
  if (command.type === "Pause") return command.durationMs;
  if (command.type === "Camera" && command.durationMs !== undefined) return command.durationMs;
  return 0;
}

/**
 * Whether Continue is available right now (Section 21.5/21.10, generalized
 * in 22.18) — derived from BOTH the current suspension identity and that
 * exact suspension's own gate state, so a gate belonging to any previous
 * suspension (Pause or Camera, in either direction) is automatically
 * treated as locked for a new one. Never derived from `gate.unlocked`
 * alone, and never from command type/duration/zoom-target equality.
 */
export function isTimedPresentationUnlocked(
  current: PresentationResult | null,
  gate: TimedPresentationGate
): boolean {
  return current !== null && gate.suspension === current && gate.unlocked;
}

/**
 * The largest delay `setTimeout` reliably honors: delays are commonly
 * stored as a 32-bit signed integer internally, and a larger value
 * overflows/clamps to an effectively-immediate timer in some engines. Kept
 * one below that boundary as a conservative, implementation-safe maximum
 * (Section 21.18) — roughly 24.8 days.
 */
export const MAX_SAFE_TIMEOUT_MS = 0x7fffffff - 1;

export interface DeadlineWait {
  cancel(): void;
}

/**
 * Waits until `durationMs` has elapsed from now, then calls `onComplete`
 * exactly once (Section 21.18). Shared unchanged between Pause and timed
 * Camera (Section 22.20) — no timer logic is duplicated. The compiler
 * enforces no maximum `durationMs`/`to` (Section 21.2, 22.2) and — confirmed
 * empirically for both — an extreme numeric literal can even yield
 * `Infinity`. This never assumes a single `setTimeout` call is safe for the
 * full delay: it re-checks the actual remaining time against a wall-clock
 * deadline at each browser-safe chunk boundary, so background-tab
 * throttling or event-loop load can only delay completion, never trigger
 * it early. An `Infinity` duration degrades to "never automatically
 * completes" without ever hot-looping, since each chunk still waits a full
 * `MAX_SAFE_TIMEOUT_MS` before re-checking; a defensively-guarded `NaN`
 * (unreachable from the compiler today) is treated as zero rather than
 * risking a zero-delay hot loop. If scheduling a chunk ever throws, this
 * fails open by completing immediately (Section 21.20) rather than
 * permanently deadlocking the story.
 *
 * A small internal timing helper — not a scheduler framework.
 */
export function waitUntilDeadline(
  durationMs: number,
  onComplete: () => void,
  now: () => number = Date.now
): DeadlineWait {
  const safeDurationMs = Number.isNaN(durationMs) ? 0 : Math.max(0, durationMs);
  const deadline = now() + safeDurationMs;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let canceled = false;

  function tick(): void {
    if (canceled) return;
    const remaining = deadline - now();
    if (remaining <= 0) {
      onComplete();
      return;
    }
    try {
      timeoutId = setTimeout(tick, Math.min(remaining, MAX_SAFE_TIMEOUT_MS));
    } catch {
      onComplete();
    }
  }

  tick();

  return {
    cancel(): void {
      canceled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  };
}
