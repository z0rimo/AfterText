import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

/**
 * Real Sfx playback (docs/CORE_SPEC.md Section 23). Same spy strategy
 * as test/music.test.tsx: `HTMLMediaElement.play/pause/load` are spied,
 * `mock.contexts` recovers the exact (fresh, per-occurrence) instance each
 * call belongs to. Never asserts audible playback.
 */
let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function start(): void {
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
}

describe("Sfx: one-shot playback", () => {
  it("one authored command creates exactly one playback attempt", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\n")} />);
    start();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves through the default identity resolver and sets src", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\n")} />);
    start();
    const element = playSpy.mock.contexts[0] as HTMLAudioElement;
    expect(element.src).toContain("click.wav");
  });

  it("consecutive identical Sfx commands each create an independent instance/attempt", () => {
    const source = ["@scene s", "@sfx click.wav", "@sfx click.wav"].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(playSpy.mock.contexts[0]).not.toBe(playSpy.mock.contexts[1]);
  });
});

describe("Sfx: overlap and independence", () => {
  it("a new Sfx does not stop a previous, still-playing Sfx", () => {
    const source = ["@scene s", "@sfx first.wav", "@sfx second.wav"].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    start();
    const first = playSpy.mock.contexts[0];

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(pauseSpy.mock.contexts).not.toContain(first);
  });

  it("narrative advancement past the Sfx suspension does not stop it", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\nAfter.\n")} />);
    start();
    const element = playSpy.mock.contexts[0];

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("After.")).toBeInTheDocument();
    expect(pauseSpy.mock.contexts).not.toContain(element);
  });

  it("a Music replacement does not stop an active Sfx", () => {
    const source = ["@scene s", "@sfx click.wav", "@music theme.mp3"].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    start();
    const sfxElement = playSpy.mock.contexts[0];

    fireEvent.click(screen.getByRole("button", { name: "Next" })); // Music

    expect(pauseSpy.mock.contexts).not.toContain(sfxElement);
  });
});

describe("Sfx: lifecycle tracking", () => {
  it("a naturally-ended Sfx is untracked — Restart never pauses it again", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\nThe end.\n")} />);
    start();
    const element = playSpy.mock.contexts[0] as HTMLAudioElement;
    element.dispatchEvent(new Event("ended"));

    fireEvent.click(screen.getByRole("button", { name: "Next" })); // content
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // completed
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));

    expect(pauseSpy.mock.contexts).not.toContain(element);
  });

  it("an Sfx that errors is untracked — Restart never pauses it again", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\nThe end.\n")} />);
    start();
    const element = playSpy.mock.contexts[0] as HTMLAudioElement;
    element.dispatchEvent(new Event("error"));

    fireEvent.click(screen.getByRole("button", { name: "Next" })); // content
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // completed
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));

    expect(pauseSpy.mock.contexts).not.toContain(element);
  });
});

describe("Sfx: failure handling", () => {
  it("a resolver returning null skips playback, non-fatally", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\n")} resolveAsset={() => null} />);
    expect(() => start()).not.toThrow();
    expect(playSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Sfx: click.wav")).toBeInTheDocument();
  });

  it("an unsafe resolved URL skips playback, non-fatally", () => {
    render(
      <AfterTextPlayer
        document={compileDoc("@scene s\n@sfx click.wav\n")}
        resolveAsset={() => "javascript:alert(1)"}
      />
    );
    expect(() => start()).not.toThrow();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("a rejected play() Promise does not crash the renderer", async () => {
    playSpy.mockRejectedValue(new Error("NotAllowedError"));
    render(<AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\n")} />);
    expect(() => start()).not.toThrow();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe("Sfx: no auto-advance, plain Next", () => {
  it("does not auto-advance past the Sfx suspension", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\nAfter.\n")} />);
    start();
    expect(screen.queryByText("After.")).not.toBeInTheDocument();
  });

  it("Next is immediately available with no gate", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\n")} />);
    start();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });
});

describe("Sfx: terminal states do not prematurely stop it", () => {
  it("completed does not stop an active Sfx", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\nThe end.\n")} />);
    start();
    const element = playSpy.mock.contexts[0];

    fireEvent.click(screen.getByRole("button", { name: "Next" })); // content
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // completed

    expect(screen.getByText("Story complete.")).toBeInTheDocument();
    expect(pauseSpy.mock.contexts).not.toContain(element);
  });

  it("a runtime error does not stop an active Sfx", () => {
    const source = [
      "---",
      "state:",
      "  divisor: 0",
      "---",
      "@scene s",
      "@sfx click.wav",
      "@set x = 10 / divisor"
    ].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    start();
    const element = playSpy.mock.contexts[0];

    fireEvent.click(screen.getByRole("button", { name: "Next" })); // error

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(pauseSpy.mock.contexts).not.toContain(element);
  });
});

describe("Sfx: reset/cleanup", () => {
  it("Restart stops all active Sfx", () => {
    const source = ["@scene s", "@sfx first.wav", "@sfx second.wav", "The end."].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // second sfx
    const first = playSpy.mock.contexts[0];
    const second = playSpy.mock.contexts[1];

    fireEvent.click(screen.getByRole("button", { name: "Next" })); // content
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // completed
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));

    expect(pauseSpy.mock.contexts).toContain(first);
    expect(pauseSpy.mock.contexts).toContain(second);
  });

  it("a new document prop stops all active Sfx from the previous document", () => {
    const first = compileDoc("@scene s\n@sfx click.wav\nHi.\n");
    const second = compileDoc("@scene s\nHi again.\n");
    const { rerender } = render(<AfterTextPlayer document={first} />);
    start();
    const sfxElement = playSpy.mock.contexts[0];

    rerender(<AfterTextPlayer document={second} />);

    expect(pauseSpy.mock.contexts).toContain(sfxElement);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });

  it("unmount stops all active Sfx", () => {
    const { unmount } = render(<AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\n")} />);
    start();
    const sfxElement = playSpy.mock.contexts[0];

    unmount();

    expect(pauseSpy.mock.contexts).toContain(sfxElement);
  });
});

describe("Sfx: Strict Mode", () => {
  it("does not duplicate instance creation/playback for a single click", () => {
    render(
      <StrictMode>
        <AfterTextPlayer document={compileDoc("@scene s\n@sfx click.wav\n")} />
      </StrictMode>
    );
    start();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
