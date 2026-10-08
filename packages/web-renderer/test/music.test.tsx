import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { StoryDocument } from "@aftertext/compiler";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

/**
 * Returns a copy of `document` with its first Music command's volume
 * replaced by `volume`. Compiler Numeric Hardening (docs/CORE_SPEC.md
 * Section 24) rejects a non-finite authored volume at compile time
 * (AT1302), so a non-finite volume can no longer be produced by compiling
 * source text. The renderer's own defensive volume normalization (Section
 * 23.9) remains required regardless, since a StoryDocument it receives is
 * not guaranteed to originate from this exact (or any) compiler version —
 * this helper simulates such a document directly, bypassing the compiler.
 */
function withMusicVolume(document: StoryDocument, volume: number): StoryDocument {
  return {
    ...document,
    scenes: document.scenes.map((scene) => ({
      ...scene,
      blocks: scene.blocks.map((block) =>
        block.type === "Presentation" && block.command.type === "Music"
          ? { ...block, command: { ...block.command, volume } }
          : block
      )
    }))
  };
}

/**
 * Real Music playback (docs/CORE_SPEC.md Section 23). `HTMLMediaElement
 * .play/.pause/.load` are spied (not fully replaced) so the real element
 * machinery — `.src`/`.volume` validation, `.currentTime`, event dispatch
 * — still behaves like a real (if silent) browser element; these tests
 * never assert that anything is actually audible (Section 23.35). `mock
 * .contexts` recovers the exact element each spied call was invoked on,
 * since Music elements are never inserted into the DOM (playing a
 * detached media element is standard, supported browser behavior).
 */
let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;
let loadSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  loadSpy = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function start(): void {
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
}

describe("Music: first playback", () => {
  it("attempts playback exactly once", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\n")} />);
    start();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("is triggered synchronously within the click, with no additional flush required", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\n")} />);
    // No act()/await/fake-timer advance between start() and the assertion —
    // if playback were effect-deferred (Section 23.17), this would still
    // be 0 at this point.
    start();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves through the default identity resolver and sets src", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\n")} />);
    start();
    const element = playSpy.mock.contexts[0] as HTMLAudioElement;
    expect(element.src).toContain("theme.mp3");
  });
});

describe("Music: replacement and same-track restart", () => {
  it("replacement retargets the single owned element and restarts", () => {
    const source = ["@scene s", "@music a.mp3", "@music b.mp3"].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(playSpy).toHaveBeenCalledTimes(2);
    // Both calls are on the SAME owned element (Section 23.11) — one
    // persistent Music slot, not one instance per command.
    expect(playSpy.mock.contexts[0]).toBe(playSpy.mock.contexts[1]);
    const element = playSpy.mock.contexts[1] as HTMLAudioElement;
    expect(element.src).toContain("b.mp3");
  });

  it("an identical later Music command still restarts playback (load() called each time)", () => {
    const source = ["@scene s", "@music theme.mp3", "@music theme.mp3"].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(loadSpy).toHaveBeenCalledTimes(2);
  });
});

describe("Music: volume normalization", () => {
  function volumeOf(directive: string): number {
    render(<AfterTextPlayer document={compileDoc(`@scene s\n${directive}\n`)} />);
    start();
    const element = playSpy.mock.contexts[0] as HTMLAudioElement;
    return element.volume;
  }

  it("undefined volume -> 1", () => {
    expect(volumeOf("@music theme.mp3")).toBe(1);
  });

  it("volume 0 -> 0", () => {
    expect(volumeOf("@music theme.mp3 volume=0")).toBe(0);
  });

  it("an in-range fractional volume is preserved", () => {
    expect(volumeOf("@music theme.mp3 volume=0.42")).toBeCloseTo(0.42);
  });

  it("negative volume clamps to 0", () => {
    expect(volumeOf("@music theme.mp3 volume=-5")).toBe(0);
  });

  it("volume > 1 clamps to 1", () => {
    expect(volumeOf("@music theme.mp3 volume=5")).toBe(1);
  });

  it("a non-finite (Infinity) Music volume falls back to 1 (defense-in-depth for a StoryDocument this compiler did not produce)", () => {
    // No longer reachable by compiling extreme authored source — Compiler
    // Numeric Hardening (docs/CORE_SPEC.md Section 24) now rejects a
    // non-finite authored volume at compile time (AT1302). The renderer's
    // defensive normalization is still required for a StoryDocument that
    // did not come from this compiler, so this injects Infinity directly.
    const document = withMusicVolume(compileDoc("@scene s\n@music theme.mp3 volume=0.5\n"), Infinity);
    render(<AfterTextPlayer document={document} />);
    start();
    const element = playSpy.mock.contexts[0] as HTMLAudioElement;
    expect(element.volume).toBe(1);
  });
});

describe("Music: failure handling", () => {
  it("a resolver returning null skips playback, non-fatally", () => {
    render(
      <AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\n")} resolveAsset={() => null} />
    );
    expect(() => start()).not.toThrow();
    expect(playSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Music: theme.mp3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("an unsafe resolved URL skips playback, non-fatally", () => {
    render(
      <AfterTextPlayer
        document={compileDoc("@scene s\n@music theme.mp3\n")}
        resolveAsset={() => "javascript:alert(1)"}
      />
    );
    expect(() => start()).not.toThrow();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("a rejected play() Promise does not crash the renderer or block Next", async () => {
    playSpy.mockRejectedValue(new Error("NotAllowedError"));
    render(<AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\nAfter.\n")} />);
    start();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("After.")).toBeInTheDocument();
    // Allow the rejection's microtask to settle so it's confirmed caught.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("a native media error event does not crash the renderer", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\n")} />);
    start();
    const element = playSpy.mock.contexts[0] as HTMLAudioElement;
    expect(() => element.dispatchEvent(new Event("error"))).not.toThrow();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });
});

describe("Music: no auto-advance, plain Next", () => {
  it("does not auto-advance past the Music suspension", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\nAfter.\n")} />);
    start();
    expect(screen.queryByText("After.")).not.toBeInTheDocument();
  });

  it("Next is immediately available with no gate", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\n")} />);
    start();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });
});

describe("Music: terminal states preserve playback", () => {
  it("completed does not stop Music", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\nThe end.\n")} />);
    start();
    const pauseCallsAfterStart = pauseSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Next" })); // content
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // completed

    expect(screen.getByText("Story complete.")).toBeInTheDocument();
    expect(pauseSpy.mock.calls.length).toBe(pauseCallsAfterStart);
  });

  it("a runtime error does not stop Music", () => {
    const source = [
      "---",
      "state:",
      "  divisor: 0",
      "---",
      "@scene s",
      "@music theme.mp3",
      "@set x = 10 / divisor"
    ].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    start();
    const pauseCallsAfterStart = pauseSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Next" })); // error

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(pauseSpy.mock.calls.length).toBe(pauseCallsAfterStart);
  });
});

describe("Music: reset/cleanup", () => {
  it("Restart stops Music", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\nThe end.\n")} />);
    start();
    const pauseCallsAfterStart = pauseSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Next" })); // content
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // completed
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));

    expect(pauseSpy.mock.calls.length).toBeGreaterThan(pauseCallsAfterStart);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });

  it("Restart does not itself start new playback", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\nThe end.\n")} />);
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const playCallsBeforeRestart = playSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));

    expect(playSpy.mock.calls.length).toBe(playCallsBeforeRestart);
  });

  it("a new document prop stops the previous document's Music", () => {
    const first = compileDoc("@scene s\n@music theme.mp3\nHi.\n");
    const second = compileDoc("@scene s\nHi again.\n");
    const { rerender } = render(<AfterTextPlayer document={first} />);
    start();
    const pauseCallsAfterStart = pauseSpy.mock.calls.length;

    rerender(<AfterTextPlayer document={second} />);

    expect(pauseSpy.mock.calls.length).toBeGreaterThan(pauseCallsAfterStart);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });

  it("unmount stops Music", () => {
    const { unmount } = render(<AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\n")} />);
    start();
    const pauseCallsAfterStart = pauseSpy.mock.calls.length;

    unmount();

    expect(pauseSpy.mock.calls.length).toBeGreaterThan(pauseCallsAfterStart);
  });
});

describe("Music: Strict Mode", () => {
  it("does not duplicate playback for a single click", () => {
    render(
      <StrictMode>
        <AfterTextPlayer document={compileDoc("@scene s\n@music theme.mp3\n")} />
      </StrictMode>
    );
    start();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Music: resolver identity", () => {
  it("changing resolveAsset alone does not replay Music", () => {
    const document = compileDoc("@scene s\n@music theme.mp3\nHi.\n");
    const upper = (ref: string): string => ref.toUpperCase();
    const { rerender } = render(<AfterTextPlayer document={document} />);
    start();
    const playCallsAfterStart = playSpy.mock.calls.length;

    rerender(<AfterTextPlayer document={document} resolveAsset={upper} />);

    expect(playSpy.mock.calls.length).toBe(playCallsAfterStart);
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  });
});
