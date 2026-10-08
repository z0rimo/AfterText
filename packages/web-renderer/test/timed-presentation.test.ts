import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraZoomCommand, PauseCommand, PresentationCommand } from "@aftertext/compiler";
import type { PlayerState, PresentationResult } from "@aftertext/player";
import {
  getCurrentTimedPresentation,
  getTimedDurationMs,
  isTimedCommand,
  isTimedPresentationUnlocked,
  INITIAL_TIMED_GATE,
  MAX_SAFE_TIMEOUT_MS,
  waitUntilDeadline,
  type TimedPresentationGate
} from "../src/timed-presentation.js";

function playerWithCurrent(current: PlayerState["current"]): PlayerState {
  return { runtimeState: {} as PlayerState["runtimeState"], cursor: [], current };
}

const PAUSE_A: PauseCommand = { type: "Pause", durationMs: 1000 };
const PAUSE_B: PauseCommand = { type: "Pause", durationMs: 1000 }; // equal duration, distinct object
const BACKGROUND: PresentationCommand = { type: "Background", image: "room.jpg" };
const CAMERA_DURATIONLESS: CameraZoomCommand = { type: "Camera", action: "zoom", to: 1.5, durationMs: undefined };
const CAMERA_ZERO: CameraZoomCommand = { type: "Camera", action: "zoom", to: 1.5, durationMs: 0 };
const CAMERA_ZERO_B: CameraZoomCommand = { type: "Camera", action: "zoom", to: 1.5, durationMs: 0 }; // distinct object
const CAMERA_TIMED: CameraZoomCommand = { type: "Camera", action: "zoom", to: 2, durationMs: 800 };

describe("isTimedCommand", () => {
  it("Pause is always timed", () => {
    expect(isTimedCommand(PAUSE_A)).toBe(true);
  });

  it("a durationless Camera is not timed", () => {
    expect(isTimedCommand(CAMERA_DURATIONLESS)).toBe(false);
  });

  it("a Camera with duration=0 is timed", () => {
    expect(isTimedCommand(CAMERA_ZERO)).toBe(true);
  });

  it("a Camera with a positive duration is timed", () => {
    expect(isTimedCommand(CAMERA_TIMED)).toBe(true);
  });

  it.each([["Background", BACKGROUND], ["Music", { type: "Music", track: "t.mp3", volume: undefined } as PresentationCommand], ["Sfx", { type: "Sfx", clip: "c.wav" } as PresentationCommand]])(
    "%s is never timed",
    (_name, command) => {
      expect(isTimedCommand(command)).toBe(false);
    }
  );
});

describe("getCurrentTimedPresentation", () => {
  it("returns null before any advance (current === null)", () => {
    expect(getCurrentTimedPresentation(playerWithCurrent(null))).toBeNull();
  });

  it("returns null for content", () => {
    const player = playerWithCurrent({
      type: "content",
      block: { type: "Paragraph", children: [], span: undefined as never }
    });
    expect(getCurrentTimedPresentation(player)).toBeNull();
  });

  it("returns null for a non-timed Presentation command", () => {
    const player = playerWithCurrent({ type: "presentation", command: BACKGROUND });
    expect(getCurrentTimedPresentation(player)).toBeNull();
  });

  it("returns null for a durationless Camera", () => {
    const player = playerWithCurrent({ type: "presentation", command: CAMERA_DURATIONLESS });
    expect(getCurrentTimedPresentation(player)).toBeNull();
  });

  it("returns the exact current result object for a Pause Presentation command", () => {
    const current = { type: "presentation" as const, command: PAUSE_A };
    const player = playerWithCurrent(current);
    expect(getCurrentTimedPresentation(player)).toBe(current);
  });

  it("returns the exact current result object for a Camera with duration=0", () => {
    const current = { type: "presentation" as const, command: CAMERA_ZERO };
    const player = playerWithCurrent(current);
    expect(getCurrentTimedPresentation(player)).toBe(current);
  });

  it("returns the exact current result object for a Camera with a positive duration", () => {
    const current = { type: "presentation" as const, command: CAMERA_TIMED };
    const player = playerWithCurrent(current);
    expect(getCurrentTimedPresentation(player)).toBe(current);
  });

  it("classifies an invalid-zoom timed Camera as timed regardless of visual validity (Section 22.30)", () => {
    const invalidZoomTimed: CameraZoomCommand = { type: "Camera", action: "zoom", to: 0, durationMs: 1000 };
    const current = { type: "presentation" as const, command: invalidZoomTimed };
    const player = playerWithCurrent(current);
    expect(getCurrentTimedPresentation(player)).toBe(current);
  });
});

describe("getTimedDurationMs", () => {
  it("returns a Pause command's durationMs", () => {
    const suspension: PresentationResult = { type: "presentation", command: PAUSE_A };
    expect(getTimedDurationMs(suspension)).toBe(1000);
  });

  it("returns a timed Camera command's durationMs", () => {
    const suspension: PresentationResult = { type: "presentation", command: CAMERA_TIMED };
    expect(getTimedDurationMs(suspension)).toBe(800);
  });

  it("returns a Camera with duration=0 as 0", () => {
    const suspension: PresentationResult = { type: "presentation", command: CAMERA_ZERO };
    expect(getTimedDurationMs(suspension)).toBe(0);
  });
});

describe("isTimedPresentationUnlocked", () => {
  const pauseA = { type: "presentation" as const, command: PAUSE_A };
  const pauseB = { type: "presentation" as const, command: PAUSE_B };
  const cameraA = { type: "presentation" as const, command: CAMERA_ZERO };
  const cameraB = { type: "presentation" as const, command: CAMERA_ZERO_B };

  it("is false when there is no current timed suspension", () => {
    expect(isTimedPresentationUnlocked(null, { suspension: pauseA, unlocked: true })).toBe(false);
  });

  it("is false for the initial gate", () => {
    expect(isTimedPresentationUnlocked(pauseA, INITIAL_TIMED_GATE)).toBe(false);
  });

  it("is false when the gate belongs to a different Pause suspension, even with equal command values", () => {
    const gate: TimedPresentationGate = { suspension: pauseA, unlocked: true };
    expect(isTimedPresentationUnlocked(pauseB, gate)).toBe(false);
  });

  it("is false when the gate matches the suspension but is not yet unlocked", () => {
    const gate: TimedPresentationGate = { suspension: pauseA, unlocked: false };
    expect(isTimedPresentationUnlocked(pauseA, gate)).toBe(false);
  });

  it("is true only when the gate's suspension matches and unlocked is true", () => {
    const gate: TimedPresentationGate = { suspension: pauseA, unlocked: true };
    expect(isTimedPresentationUnlocked(pauseA, gate)).toBe(true);
  });

  it("a stale Pause gate cannot unlock a new Camera suspension", () => {
    const staleGate: TimedPresentationGate = { suspension: pauseA, unlocked: true };
    expect(isTimedPresentationUnlocked(cameraA, staleGate)).toBe(false);
  });

  it("a stale Camera gate cannot unlock a new Pause suspension", () => {
    const staleGate: TimedPresentationGate = { suspension: cameraA, unlocked: true };
    expect(isTimedPresentationUnlocked(pauseA, staleGate)).toBe(false);
  });

  it("consecutive timed Camera suspensions with equal duration/target are independent", () => {
    const gate: TimedPresentationGate = { suspension: cameraA, unlocked: true };
    expect(isTimedPresentationUnlocked(cameraB, gate)).toBe(false);
  });
});

describe("waitUntilDeadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not complete before the duration elapses", () => {
    const onComplete = vi.fn();
    waitUntilDeadline(1000, onComplete);
    vi.advanceTimersByTime(999);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("completes once the duration elapses", () => {
    const onComplete = vi.fn();
    waitUntilDeadline(1000, onComplete);
    vi.advanceTimersByTime(1);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("never completes more than once even if time keeps advancing", () => {
    const onComplete = vi.fn();
    waitUntilDeadline(1000, onComplete);
    vi.advanceTimersByTime(10_000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("cancellation prevents completion", () => {
    const onComplete = vi.fn();
    const wait = waitUntilDeadline(1000, onComplete);
    wait.cancel();
    vi.advanceTimersByTime(10_000);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("a zero duration still resolves through the timer mechanism, calling onComplete exactly once", () => {
    const onComplete = vi.fn();
    waitUntilDeadline(0, onComplete);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("a duration larger than the implementation-safe maximum is chunked across multiple timeouts", () => {
    const onComplete = vi.fn();
    const duration = MAX_SAFE_TIMEOUT_MS * 2 + 500;
    waitUntilDeadline(duration, onComplete);

    vi.advanceTimersByTime(MAX_SAFE_TIMEOUT_MS);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(MAX_SAFE_TIMEOUT_MS);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("never schedules a single browser timeout above the implementation-safe maximum", () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    waitUntilDeadline(MAX_SAFE_TIMEOUT_MS * 3, () => {});

    for (const call of setTimeoutSpy.mock.calls) {
      expect(call[1] as number).toBeLessThanOrEqual(MAX_SAFE_TIMEOUT_MS);
    }
    setTimeoutSpy.mockRestore();
  });

  it("a callback delayed past the deadline still unlocks correctly (does not require exact timing)", () => {
    const onComplete = vi.fn();
    waitUntilDeadline(1000, onComplete);
    // Simulate a browser delivering the scheduled callback late (throttled
    // tab, event-loop load) rather than exactly at 1000ms.
    vi.advanceTimersByTime(5000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("an extreme (non-finite) duration never hot-loops and never completes early", () => {
    const onComplete = vi.fn();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    waitUntilDeadline(Number.POSITIVE_INFINITY, onComplete);

    vi.advanceTimersByTime(MAX_SAFE_TIMEOUT_MS * 5);
    expect(onComplete).not.toHaveBeenCalled();
    // Each chunk still waits a full MAX_SAFE_TIMEOUT_MS — not a hot loop.
    expect(setTimeoutSpy.mock.calls.every((call) => call[1] === MAX_SAFE_TIMEOUT_MS)).toBe(true);
    setTimeoutSpy.mockRestore();
  });

  it("a NaN duration is treated as zero rather than hot-looping", () => {
    const onComplete = vi.fn();
    waitUntilDeadline(Number.NaN, onComplete);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
