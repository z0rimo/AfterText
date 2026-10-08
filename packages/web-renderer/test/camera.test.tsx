import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

/**
 * Real Camera zoom (docs/CORE_SPEC.md Section 22). Uses `fireEvent`
 * (synchronous, no artificial delay) rather than `userEvent` so these
 * fake-timer-heavy tests don't need to reconcile userEvent's own internal
 * timers with `vi.useFakeTimers()`, mirroring test/pause.test.tsx.
 */
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function start(): void {
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
}

function advanceTime(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * Locates the internal CameraSurface by its distinctive `transform-origin`
 * style (Section 22.12) — the only element in the tree that ever carries
 * it — rather than asserting on DOM position/index, which would be
 * fragile to unrelated structural changes.
 */
function cameraSurface(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[style*="transform-origin"]');
  if (el === null) throw new Error("CameraSurface element not found");
  return el;
}

function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null
      }) satisfies MediaQueryList
  );
}

describe("Camera: transform application", () => {
  it("a Camera Presentation changes CameraSurface's transform in the same render", () => {
    const { container } = render(<AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5\n")} />);
    start();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
  });

  it("narrative UI remains outside the transformed subtree", () => {
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=2\nHello.\n")} />
    );
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const surface = cameraSurface(container);
    const paragraph = screen.getByText("Hello.");
    expect(surface.contains(paragraph)).toBe(false);
  });

  it("CameraSurface remains the same DOM node across ordinary result changes (never remounted)", () => {
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\nFirst.\n\nSecond.\n")} />
    );
    start();
    const before = cameraSurface(container);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const after = cameraSurface(container);
    expect(after).toBe(before);
  });
});

describe("Camera: durationless", () => {
  it("applies immediately and uses the plain Next action", () => {
    const { container } = render(<AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5\n")} />);
    start();

    expect(screen.getByText("Camera zoom to 1.5")).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });
});

describe("Camera: explicit zero duration", () => {
  it("applies the target immediately, is classified as timed (Continue, not Next), and never auto-advances", () => {
    const { container } = render(
      <AfterTextPlayer
        document={compileDoc("@scene s\n@camera zoom to=1.5 duration=0ms\nAfter.\n")}
      />
    );
    start();

    // The zero-delay timer lifecycle resolves within the same effect flush
    // as Start, so "Continue" — never a plain "Next" — is what's visible;
    // the essential contract is that a real suspension existed (target
    // applied, timed gate used) and narrative did not auto-advance past it.
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
    expect(screen.getByText("Camera zoom to 1.5 over 0ms")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByText("After.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("After.")).toBeInTheDocument();
  });
});

describe("Camera: positive duration", () => {
  it("starts locked with no active Next/Continue", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5 duration=1s\n")} />);
    start();

    expect(screen.getByText("Camera zoom to 1.5 over 1000ms")).toBeInTheDocument();
    expect(screen.getByText("Animating…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("stays locked before the duration elapses", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5 duration=1s\n")} />);
    start();
    advanceTime(999);
    expect(screen.getByText("Animating…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("unlocks at the authored deadline", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5 duration=1s\n")} />);
    start();
    advanceTime(1000);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByText("Animating…")).not.toBeInTheDocument();
  });

  it("does not auto-advance: reaching the deadline without clicking Continue leaves the same suspension", () => {
    render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5 duration=1s\nAfter.\n")} />
    );
    start();
    advanceTime(1000);
    advanceTime(60_000);

    expect(screen.getByText("Camera zoom to 1.5 over 1000ms")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByText("After.")).not.toBeInTheDocument();
  });

  it("clicking Continue advances exactly once", () => {
    render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5 duration=1s\nAfter.\n\nSecond.\n")} />
    );
    start();
    advanceTime(1000);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("After.")).toBeInTheDocument();
    expect(screen.queryByText("Second.")).not.toBeInTheDocument();
  });
});

describe("Camera: persistence", () => {
  it("zoom persists into following content", () => {
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5\nAfter.\n")} />
    );
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("After.")).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
  });

  it("zoom persists through Choice and Navigation", () => {
    const source = [
      "@scene s",
      "@camera zoom to=1.5",
      "@choice",
      "- Go -> t",
      "@end",
      "",
      "@scene t",
      "T."
    ].join("\n");
    const { container } = render(<AfterTextPlayer document={compileDoc(source)} />);
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");

    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("T.")).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
  });

  it("a later Background retains the current zoom", () => {
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5\n@background room.jpg\n")} />
    );
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Background: room.jpg")).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
  });

  it("a later Layer retains the current zoom", () => {
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5\n@layer alice.png\n")} />
    );
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Layer: alice.png")).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
  });

  it("a second Camera replaces the previous zoom", () => {
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5\n@camera zoom to=2\n")} />
    );
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(cameraSurface(container).style.transform).toBe("scale(2)");
  });

  it("to=1 restores identity zoom", () => {
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5\n@camera zoom to=1\n")} />
    );
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(cameraSurface(container).style.transform).toBe("scale(1)");
  });

  it("completed retains zoom", () => {
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5\nThe end.\n")} />
    );
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Story complete.")).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
  });

  it("error retains zoom", () => {
    const source = [
      "---",
      "state:",
      "  divisor: 0",
      "---",
      "@scene s",
      "@camera zoom to=1.5",
      "@set x = 10 / divisor"
    ].join("\n");
    const { container } = render(<AfterTextPlayer document={compileDoc(source)} />);
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
  });
});

describe("Camera: reset", () => {
  it("Restart resets zoom to 1", () => {
    const document = compileDoc("@scene s\n@camera zoom to=1.5\nThe end.\n");
    const { container } = render(<AfterTextPlayer document={document} />);
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));

    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1)");
  });

  it("a new document prop resets zoom to 1", () => {
    const first = compileDoc("@scene s\n@camera zoom to=1.5\nHi.\n");
    const second = compileDoc("@scene s\nHi again.\n");
    const { container, rerender } = render(<AfterTextPlayer document={first} />);
    start();
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");

    rerender(<AfterTextPlayer document={second} />);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(cameraSurface(container).style.transform).toBe("scale(1)");
  });
});

describe("Camera: Strict Mode and cancellation", () => {
  it("does not unlock early under StrictMode's development double-invoke lifecycle", () => {
    render(
      <StrictMode>
        <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5 duration=1s\n")} />
      </StrictMode>
    );
    start();
    advanceTime(999);
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    advanceTime(1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("unmounting during a locked timed Camera cancels the timer with no post-unmount state update", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5 duration=1s\n")} />
    );
    start();
    expect(screen.getByText("Animating…")).toBeInTheDocument();

    unmount();
    advanceTime(60_000);

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("a new document prop during a locked timed Camera cancels the old timer", () => {
    const first = compileDoc("@scene s\n@camera zoom to=1.5 duration=1s\n");
    const second = compileDoc("@scene s\nHi again.\n");
    const { rerender } = render(<AfterTextPlayer document={first} />);
    start();
    expect(screen.getByText("Animating…")).toBeInTheDocument();

    rerender(<AfterTextPlayer document={second} />);
    advanceTime(60_000);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });
});

describe("Camera: reduced motion", () => {
  it("suppresses the visual transition duration while preserving the full authored gate timing", () => {
    stubReducedMotion(true);
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5 duration=1s\n")} />
    );
    start();

    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
    expect(cameraSurface(container).style.transitionDuration).toBe("0ms");

    // The narrative gate is unaffected — still locked before, unlocked only
    // at, the full authored duration.
    advanceTime(999);
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    advanceTime(1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("uses the authored transition duration when motion is not reduced", () => {
    stubReducedMotion(false);
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5 duration=1s\n")} />
    );
    start();
    expect(cameraSurface(container).style.transitionDuration).toBe("1000ms");
  });
});

describe("Camera: invalid zoom", () => {
  it("an invalid zoom (to=0) never emits an invalid transform, keeping the previous valid zoom", () => {
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=1.5\n@camera zoom to=0\n")} />
    );
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(cameraSurface(container).style.transform).toBe("scale(1.5)");
  });

  it("an invalid zoom from the initial identity leaves scale(1), never scale(0)", () => {
    const { container } = render(<AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=0\n")} />);
    start();
    expect(cameraSurface(container).style.transform).toBe("scale(1)");
  });

  it("an invalid-zoom timed Camera still observes its own timing gate (Section 22.30)", () => {
    const { container } = render(
      <AfterTextPlayer document={compileDoc("@scene s\n@camera zoom to=0 duration=1s\n")} />
    );
    start();

    expect(cameraSurface(container).style.transform).toBe("scale(1)");
    expect(screen.getByText("Camera zoom to 0 over 1000ms")).toBeInTheDocument();
    expect(screen.getByText("Animating…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    advanceTime(1000);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });
});
