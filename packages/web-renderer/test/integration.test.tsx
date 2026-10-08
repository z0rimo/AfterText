import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compile } from "@aftertext/compiler";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AfterTextPlayer } from "../src/index.js";

/**
 * Proves the full current stack — compiler -> runtime -> player -> web
 * renderer — using only public APIs and real AfterText source text, no
 * manually constructed AST (docs/CORE_SPEC.md Section 19, item 20).
 */
describe("end-to-end: compile -> AfterTextPlayer -> Start -> content -> Choice -> navigation -> completed", () => {
  const SOURCE = [
    "@scene start",
    "Opening paragraph.",
    "@choice",
    "- Open the door -> room",
    "@end",
    "",
    "@scene room",
    "You enter the room."
  ].join("\n");

  it("plays the whole story through the rendered component", async () => {
    const user = userEvent.setup();
    const result = compile(SOURCE);
    expect(result.hasErrors).toBe(false);

    render(<AfterTextPlayer document={result.document} />);

    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Opening paragraph.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Open the door" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open the door" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("You enter the room.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Story complete.")).toBeInTheDocument();
  });
});

/**
 * Proves the full stack again, this time exercising the Web Presentation
 * Core visual layer end-to-end: Background/Layer become visible in the
 * same render as their own Presentation result, persist through content
 * and a Choice, and a branch-specific Background replacement takes effect
 * immediately while leaving the other branch unaffected. Public APIs and
 * real AfterText source only (docs/CORE_SPEC.md Section 20, item 25).
 */
describe("end-to-end: Background/Layer visuals through content, Choice, and a branch-specific Background change", () => {
  const SOURCE = [
    "@scene start",
    "@background room-a.jpg",
    "@layer alice.png",
    "Opening paragraph.",
    "@choice",
    "- Change the room -> changed",
    "- Keep the room -> unchanged",
    "@end",
    "",
    "@scene changed",
    "@background room-b.jpg",
    "The room has changed.",
    "",
    "@scene unchanged",
    "The room is the same."
  ].join("\n");

  function images(container: HTMLElement): HTMLImageElement[] {
    return Array.from(container.querySelectorAll("img"));
  }

  it("plays the whole story through the rendered component with visuals applied at transition time", async () => {
    const user = userEvent.setup();
    const result = compile(SOURCE);
    expect(result.hasErrors).toBe(false);

    const { container } = render(<AfterTextPlayer document={result.document} />);

    // Start -> Background Presentation, visible in this same render.
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Background: room-a.jpg")).toBeInTheDocument();
    expect(images(container)).toHaveLength(1);
    expect(images(container)[0]).toHaveAttribute("src", "room-a.jpg");

    // Next -> Layer Presentation, visible in this same render, Background retained.
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Layer: alice.png")).toBeInTheDocument();
    expect(images(container)).toHaveLength(2);
    expect(images(container).map((img) => img.getAttribute("src"))).toEqual(["room-a.jpg", "alice.png"]);

    // Next -> content, both visuals retained.
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Opening paragraph.")).toBeInTheDocument();
    expect(images(container).map((img) => img.getAttribute("src"))).toEqual(["room-a.jpg", "alice.png"]);

    // Next -> Choice, both visuals retained.
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Change the room" })).toBeInTheDocument();
    expect(images(container).map((img) => img.getAttribute("src"))).toEqual(["room-a.jpg", "alice.png"]);

    // Choose the branch that replaces the Background.
    await user.click(screen.getByRole("button", { name: "Change the room" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    // The new scene's Background Presentation, updated immediately, Layer retained.
    expect(screen.getByText("Background: room-b.jpg")).toBeInTheDocument();
    expect(images(container).map((img) => img.getAttribute("src"))).toEqual(["room-b.jpg", "alice.png"]);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("The room has changed.")).toBeInTheDocument();
    expect(images(container).map((img) => img.getAttribute("src"))).toEqual(["room-b.jpg", "alice.png"]);
  });
});

/**
 * Proves the full stack once more, this time exercising real Pause timing
 * end-to-end: a Pause suspension locks on arrival, stays locked while its
 * duration has not yet elapsed, unlocks only once the deadline is reached,
 * and still requires an explicit Continue click before the next content
 * appears — never auto-advancing. A second, consecutive Pause proves
 * suspension identity: it begins locked from scratch regardless of the
 * first Pause's already-unlocked gate (docs/CORE_SPEC.md Section 21,
 * item 26). Uses `fireEvent`/fake timers rather than `userEvent`, since
 * `userEvent`'s own internal delays would otherwise need reconciling with
 * `vi.useFakeTimers()`. Public APIs and real AfterText source only, no
 * manually constructed AST.
 */
describe("end-to-end: real Pause timing — locked, unlocked, Continue, consecutive Pauses", () => {
  const SOURCE = [
    "@scene start",
    "Opening paragraph.",
    "@pause 1000ms",
    "After the pause.",
    "@pause 500ms",
    "Then this."
  ].join("\n");

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function advanceTime(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it("locks on arrival, stays locked until the deadline, and only then allows Continue", () => {
    const result = compile(SOURCE);
    expect(result.hasErrors).toBe(false);

    render(<AfterTextPlayer document={result.document} />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Opening paragraph.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Pause: 1000ms")).toBeInTheDocument();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    advanceTime(999);
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(screen.queryByText("After the pause.")).not.toBeInTheDocument();

    advanceTime(1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    // Reaching the deadline alone must not have advanced narrative execution.
    expect(screen.queryByText("After the pause.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("After the pause.")).toBeInTheDocument();

    // A second, consecutive Pause begins locked from scratch — the first
    // Pause's already-unlocked gate never leaks into it.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Pause: 500ms")).toBeInTheDocument();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    advanceTime(500);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByText("Then this.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Then this.")).toBeInTheDocument();
  });
});

/**
 * Proves the full stack once more, this time exercising real Camera zoom
 * end-to-end (docs/CORE_SPEC.md Section 22, item 29): Background
 * appears, then a timed Camera zoom locks on arrival with its target
 * already applied, stays locked while its duration has not yet elapsed,
 * unlocks only once the deadline is reached, and the zoom persists into
 * the next content — still requiring an explicit Continue, never
 * auto-advancing. A trailing durationless Camera then restores identity
 * immediately via the plain Next action. Uses `fireEvent`/fake timers for
 * the same reason as the Pause scenario above. Public APIs and real
 * AfterText source only, no manually constructed AST.
 */
describe("end-to-end: real Camera zoom — locked target application, Continue, durationless identity restore", () => {
  const SOURCE = [
    "@scene start",
    "@background room.jpg",
    "Opening paragraph.",
    "@camera zoom to=1.5 duration=1s",
    "After the zoom.",
    "@camera zoom to=1",
    "Final content."
  ].join("\n");

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function advanceTime(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  function cameraSurface(container: HTMLElement): HTMLElement {
    const el = container.querySelector<HTMLElement>('[style*="transform-origin"]');
    if (el === null) throw new Error("CameraSurface element not found");
    return el;
  }

  it("locks with the target already applied, waits the authored duration, then Continue retains the zoom into later content", () => {
    const result = compile(SOURCE);
    expect(result.hasErrors).toBe(false);

    const { container } = render(<AfterTextPlayer document={result.document} />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Background: room.jpg")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Opening paragraph.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Camera zoom to 1.5 over 1000ms")).toBeInTheDocument();
    // The target zoom is already applied in the same render as the
    // suspension itself, even while the timed gate is still locked.
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    advanceTime(999);
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(screen.queryByText("After the zoom.")).not.toBeInTheDocument();

    advanceTime(1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    // Reaching the deadline alone must not have advanced narrative execution.
    expect(screen.queryByText("After the zoom.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("After the zoom.")).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");

    // A trailing durationless Camera applies identity immediately via the
    // plain Next action — no timing gate involved.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Camera zoom to 1")).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1)");
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Final content.")).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1)");
  });
});

/**
 * Proves the full stack once more, this time exercising real Music/Sfx
 * playback end-to-end (docs/CORE_SPEC.md Section 23, item 36): both
 * remain non-timed (plain Next, no Continue gate), neither ever
 * auto-advances, and an identical later Music command still restarts
 * playback. Uses the same `HTMLMediaElement` spy strategy as
 * test/music.test.tsx/test/sfx.test.tsx — no real audio is decoded or
 * played. Public APIs and real AfterText source only, no manually
 * constructed AST.
 */
describe("end-to-end: real Music + Sfx playback — non-timed, no auto-advance, same-track replay", () => {
  const SOURCE = [
    "@scene start",
    "Opening.",
    "@music theme.mp3 volume=0.8",
    "Music continues.",
    "@sfx click.wav",
    "After the click.",
    "@music theme.mp3",
    "Final."
  ].join("\n");

  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("plays Music/Sfx as plain non-timed suspensions, with same-track Music restarting", () => {
    const result = compile(SOURCE);
    expect(result.hasErrors).toBe(false);

    render(<AfterTextPlayer document={result.document} />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Opening.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Music: theme.mp3 (volume 0.8)")).toBeInTheDocument();
    // Non-timed: plain Next, no Continue gate, played immediately.
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(playSpy).toHaveBeenCalledTimes(1);
    const musicElement = playSpy.mock.contexts[0];
    // applyMusicIntent itself calls pause() once as part of retargeting the
    // element before playback (docs/CORE_SPEC.md Section 23.7) — that
    // single call is expected; what matters below is that it never grows.
    const pauseCallsAfterMusicStarts = pauseSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Music continues.")).toBeInTheDocument();
    // Reaching content never stops the still-playing Music.
    expect(pauseSpy.mock.calls.length).toBe(pauseCallsAfterMusicStarts);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Sfx: click.wav")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(playSpy).toHaveBeenCalledTimes(2);
    const sfxElement = playSpy.mock.contexts[1];
    expect(sfxElement).not.toBe(musicElement);
    const pauseCallsAfterSfxStarts = pauseSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("After the click.")).toBeInTheDocument();
    // The Sfx is independent — reaching later content doesn't stop it.
    expect(pauseSpy.mock.calls.length).toBe(pauseCallsAfterSfxStarts);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Music: theme.mp3")).toBeInTheDocument();
    // An identical later Music command is still a new observable event —
    // it restarts playback on the same owned element (Section 23.8).
    expect(playSpy).toHaveBeenCalledTimes(3);
    expect(playSpy.mock.contexts[2]).toBe(musicElement);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Final.")).toBeInTheDocument();
  });
});
