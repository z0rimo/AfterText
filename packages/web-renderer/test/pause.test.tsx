import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

/**
 * Real Pause timing (docs/CORE_SPEC.md Section 21). Uses `fireEvent`
 * (synchronous, no artificial delay) rather than `userEvent` so these
 * fake-timer-heavy tests don't need to reconcile userEvent's own internal
 * timers with `vi.useFakeTimers()`. `vi.advanceTimersByTime` fires the
 * scheduled `setTimeout` callback synchronously but outside of React's own
 * batching, so it is wrapped in `act()` here to ensure the resulting
 * `setSession` call is flushed before assertions run.
 */
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function start(): void {
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
}

function advanceTime(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("Pause: basic timing lifecycle", () => {
  it("renders the acknowledgement and Waiting state immediately, with no Next/Continue action", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@pause 1000ms\n")} />);
    start();

    expect(screen.getByText("Pause: 1000ms")).toBeInTheDocument();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("stays locked before the duration elapses", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@pause 1000ms\n")} />);
    start();

    advanceTime(999);
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("unlocks at the duration boundary", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@pause 1000ms\n")} />);
    start();

    advanceTime(1000);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByText("Waiting…")).not.toBeInTheDocument();
  });

  it("clicking Continue advances exactly once", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@pause 1000ms\nAfter.\n\nSecond.\n")} />);
    start();
    advanceTime(1000);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("After.")).toBeInTheDocument();
    expect(screen.queryByText("Second.")).not.toBeInTheDocument();
  });
});

describe("Pause: no auto-advance", () => {
  it("reaching the duration without clicking Continue leaves the Player on the same Pause suspension", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@pause 1000ms\nAfter.\n")} />);
    start();

    advanceTime(1000);
    advanceTime(60_000); // plenty of extra elapsed time, no click

    expect(screen.getByText("Pause: 1000ms")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByText("After.")).not.toBeInTheDocument();
  });
});

describe("Pause: suspension identity", () => {
  it("a second, equal-duration Pause begins locked immediately and is unaffected by the first Pause's unlocked gate", () => {
    const source = ["@scene s", "@pause 1s", "@pause 1s", "Done."].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    start();

    advanceTime(1000);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // The second Pause must render locked immediately — no transient
    // render inherits the first Pause's unlocked Continue affordance.
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    advanceTime(1000);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Done.")).toBeInTheDocument();
  });
});

describe("Pause: zero duration", () => {
  it("still renders as a real suspension requiring an explicit Continue, never auto-advancing", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@pause 0ms\nAfter.\n")} />);
    start();

    expect(screen.getByText("Pause: 0ms")).toBeInTheDocument();
    expect(screen.queryByText("After.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("After.")).toBeInTheDocument();
  });
});

describe("Pause: Strict Mode", () => {
  it("does not unlock early under StrictMode's development double-invoke lifecycle", () => {
    render(
      <StrictMode>
        <AfterTextPlayer document={compileDoc("@scene s\n@pause 1000ms\n")} />
      </StrictMode>
    );
    start();

    advanceTime(999);
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    advanceTime(1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("one Continue click under StrictMode causes exactly one Player transition", () => {
    render(
      <StrictMode>
        <AfterTextPlayer document={compileDoc("@scene s\n@pause 1000ms\nAfter.\n\nSecond.\n")} />
      </StrictMode>
    );
    start();
    advanceTime(1000);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("After.")).toBeInTheDocument();
    expect(screen.queryByText("Second.")).not.toBeInTheDocument();
  });
});

describe("Pause: cancellation", () => {
  it("a new document prop during a locked Pause cancels the old timer; advancing time afterward does not affect the new session", () => {
    const first = compileDoc("@scene s\n@pause 1000ms\nAfter.\n");
    const second = compileDoc("@scene s\nHi again.\n");

    const { rerender } = render(<AfterTextPlayer document={first} />);
    start();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();

    rerender(<AfterTextPlayer document={second} />);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();

    // The old document's timer, if it somehow fired, must never touch the
    // new session.
    advanceTime(60_000);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Hi again.")).toBeInTheDocument();
  });

  it("unmounting during a locked Pause cancels the timer with no post-unmount state update", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<AfterTextPlayer document={compileDoc("@scene s\n@pause 1000ms\n")} />);
    start();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();

    unmount();
    advanceTime(60_000);

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("Restart (reachable only from completed/error) leaves no residual gate state — a Pause reached after restarting begins locked", () => {
    const source = ["@scene s", "@pause 500ms", "The end."].join("\n");
    const document = compileDoc(source);
    render(<AfterTextPlayer document={document} />);

    // Play through once, resolving the Pause, to completion.
    start();
    advanceTime(500);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("The end.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Story complete.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();

    // The restarted session's Pause must begin locked from scratch, not
    // inherit the previous playthrough's already-unlocked gate.
    start();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    advanceTime(500);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });
});

describe("Pause: other Presentation commands are unaffected", () => {
  it.each([
    ["@background room.jpg", "Background: room.jpg"],
    ["@layer alice.png", "Layer: alice.png"],
    ["@camera zoom to=1.5", "Camera zoom to 1.5"],
    ["@music theme.mp3", "Music: theme.mp3"],
    ["@sfx click.wav", "Sfx: click.wav"]
  ])("%s still uses the plain Next action, unaffected by Pause timing", (directive, expectedText) => {
    render(<AfterTextPlayer document={compileDoc(`@scene s\n${directive}\n`)} />);
    start();

    expect(screen.getByText(expectedText)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });
});
