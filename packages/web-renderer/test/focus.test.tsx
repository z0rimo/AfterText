import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { compile } from "@aftertext/compiler";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

/**
 * Keyboard focus continuity (docs/CORE_SPEC.md Section 19.18). Each step
 * first gives the control real focus, as a keyboard user has, then activates
 * it, and asserts where `document.activeElement` ends up.
 */
function activate(name: string): void {
  const button = screen.getByRole("button", { name });
  button.focus();
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
}

function expectFocused(name: string): void {
  expect(document.activeElement).toBe(screen.getByRole("button", { name }));
}

describe("focus after a user-initiated narrative transition", () => {
  const SOURCE = ["@scene a", "Hello.", "@choice", "- Go -> b", "- Stay -> a", "@end", "@scene b", "Arrived."].join("\n");

  it("Start moves focus to Next", () => {
    render(<AfterTextPlayer document={compileDoc(SOURCE)} />);
    activate("Start");
    expectFocused("Next");
  });

  it("content Next moves focus to the first Choice item", () => {
    render(<AfterTextPlayer document={compileDoc(SOURCE)} />);
    activate("Start");
    activate("Next");
    expectFocused("Go");
  });

  it("selecting a Choice moves focus to navigation Continue, then to content Next", () => {
    render(<AfterTextPlayer document={compileDoc(SOURCE)} />);
    activate("Start");
    activate("Next");
    activate("Stay");
    expectFocused("Continue");
    activate("Continue");
    expectFocused("Next");
  });

  it("a presentation Next keeps focus on the new primary control", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@background x.png\nText.\n")} />);
    activate("Start");
    expectFocused("Next");
    activate("Next");
    expectFocused("Next");
  });

  it("completed moves focus to Restart, and Restart moves it to Start", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\nOnly.\n")} />);
    activate("Start");
    activate("Next");
    expectFocused("Restart");
    activate("Restart");
    expectFocused("Start");
  });

  it("an error state exposes Restart with focus", () => {
    const { document } = compile("@scene s\n@goto nowhere\n");
    render(<AfterTextPlayer document={document} />);
    activate("Start");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expectFocused("Restart");
  });
});

describe("focus is not moved by unrelated updates", () => {
  it("leaves focus alone on a resolveAsset change or a document replacement", () => {
    const doc = compileDoc("@scene s\nOnly.\n");
    const { rerender } = render(
      <>
        <input aria-label="outside" />
        <AfterTextPlayer document={doc} />
      </>
    );
    const outside = screen.getByLabelText("outside");
    outside.focus();

    rerender(
      <>
        <input aria-label="outside" />
        <AfterTextPlayer document={doc} resolveAsset={(ref) => `/a/${ref}`} />
      </>
    );
    expect(document.activeElement).toBe(outside);

    rerender(
      <>
        <input aria-label="outside" />
        <AfterTextPlayer document={compileDoc("@scene t\nOther.\n")} />
      </>
    );
    expect(document.activeElement).toBe(outside);
  });

  it("does not move focus on mount", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\nOnly.\n")} />);
    expect(document.activeElement).toBe(document.body);
  });
});

describe("timed presentation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const SOURCE = "@scene s\n@pause 1000ms\nAfter.\n";

  it("focuses Continue when the gate opens, not while it is locked", () => {
    render(<AfterTextPlayer document={compileDoc(SOURCE)} />);
    activate("Start");
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expectFocused("Continue");
  });

  it("does not steal focus the user moved elsewhere while locked", () => {
    render(
      <>
        <input aria-label="outside" />
        <AfterTextPlayer document={compileDoc(SOURCE)} />
      </>
    );
    activate("Start");
    const outside = screen.getByLabelText("outside");
    outside.focus();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(document.activeElement).toBe(outside);
  });
});
