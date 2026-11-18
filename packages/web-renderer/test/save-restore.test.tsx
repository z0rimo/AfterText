import { createRef, StrictMode, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { compile } from "@aftertext/compiler";
import type { StoryDocument } from "@aftertext/compiler";
import { AfterTextPlayer } from "../src/index.js";
import type { AfterTextPlayerHandle, AfterTextPlayerRestoreResult, AfterTextPlayerSnapshot } from "../src/index.js";
import { compileDoc } from "./helpers.js";

/**
 * Web Renderer Save/Restore integration (docs/CORE_SPEC.md Section
 * 33.10-33.15, 33.20). Player's own test suite already covers
 * `PlayerSnapshot`/`restorePlayer` deeply; these tests exercise the Web
 * Renderer's own `PresentationSnapshot`/`AfterTextPlayerHandle` layer and
 * the React orchestration (atomic restore, timed-gate reset, audio
 * cleanup, focus) that only exists at this level.
 */

function renderPlayer(storyDocument: StoryDocument): RefObject<AfterTextPlayerHandle | null> {
  const ref = createRef<AfterTextPlayerHandle>();
  render(<AfterTextPlayer ref={ref} document={storyDocument} />);
  return ref;
}

function roundTrip(snapshot: AfterTextPlayerSnapshot): unknown {
  return JSON.parse(JSON.stringify(snapshot));
}

function start(): void {
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
}

/**
 * Calling an imperative-handle method directly (not via `fireEvent`,
 * which wraps internally) bypasses React Testing Library's automatic
 * `act()` wrapping — the resulting `setSession` update would otherwise
 * remain unflushed when the next assertion runs.
 */
function restore(ref: RefObject<AfterTextPlayerHandle | null>, snapshot: unknown): AfterTextPlayerRestoreResult {
  let result!: AfterTextPlayerRestoreResult;
  act(() => {
    result = ref.current!.restoreSnapshot(snapshot);
  });
  return result;
}

describe("AfterTextPlayerHandle: ref support", () => {
  it("exposes getSnapshot/restoreSnapshot through a ref", () => {
    const ref = renderPlayer(compileDoc("@scene s\nHi.\n"));
    expect(typeof ref.current?.getSnapshot).toBe("function");
    expect(typeof ref.current?.restoreSnapshot).toBe("function");
  });

  it("is no longer directly callable as an ordinary function (ForwardRefExoticComponent, Section 33.11)", () => {
    expect(typeof AfterTextPlayer).not.toBe("function");
  });

  it("ordinary JSX usage without a ref renders identically", () => {
    render(<AfterTextPlayer document={compileDoc("@scene s\nHi.\n")} />);
    start();
    expect(screen.getByText("Hi.")).toBeInTheDocument();
  });
});

describe("getSnapshot/restoreSnapshot: JSON round trip", () => {
  it("a snapshot round-trips through ordinary JSON.stringify/JSON.parse and restores successfully", () => {
    const ref = renderPlayer(compileDoc("@scene s\nFirst.\n\nSecond.\n"));
    start();
    const result = restore(ref, roundTrip(ref.current!.getSnapshot()));
    expect(result).toEqual({ ok: true });
    expect(screen.getByText("First.")).toBeInTheDocument();
  });

  it("MANDATORY fresh-recompile proof: restores through the React handle onto a separately re-compiled StoryDocument instance, not a retained AST reference", () => {
    const source = "@scene s\nFirst.\n\nSecond.\n";
    const firstDocument = compileDoc(source);
    const refA = createRef<AfterTextPlayerHandle>();
    const { unmount } = render(<AfterTextPlayer ref={refA} document={firstDocument} />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("First.")).toBeInTheDocument();

    const parsed = roundTrip(refA.current!.getSnapshot());
    unmount();

    const secondDocument = compileDoc(source);
    expect(secondDocument).not.toBe(firstDocument);

    const refB = createRef<AfterTextPlayerHandle>();
    render(<AfterTextPlayer ref={refB} document={secondDocument} />);
    const result = restore(refB, parsed);
    expect(result).toEqual({ ok: true });
    expect(screen.getByText("First.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Second.")).toBeInTheDocument();
  });
});

describe("suspension-kind coverage", () => {
  function roundTripThroughFreshRender(storyDocument: StoryDocument, before: () => void, after: () => void): void {
    const refA = createRef<AfterTextPlayerHandle>();
    const { unmount } = render(<AfterTextPlayer ref={refA} document={storyDocument} />);
    before();
    const parsed = roundTrip(refA.current!.getSnapshot());
    unmount();

    const refB = createRef<AfterTextPlayerHandle>();
    render(<AfterTextPlayer ref={refB} document={storyDocument} />);
    const result = restore(refB, parsed);
    expect(result).toEqual({ ok: true });
    after();
  }

  it("not started (current === null)", () => {
    roundTripThroughFreshRender(
      compileDoc("@scene s\nHi.\n"),
      () => {},
      () => expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument()
    );
  });

  it("content", () => {
    roundTripThroughFreshRender(
      compileDoc("@scene s\nHi.\n"),
      () => start(),
      () => expect(screen.getByText("Hi.")).toBeInTheDocument()
    );
  });

  it("dialogue", () => {
    roundTripThroughFreshRender(
      compileDoc("@scene s\n@say speaker=Alice\nHi.\n"),
      () => start(),
      () => expect(screen.getByText("Hi.")).toBeInTheDocument()
    );
  });

  it("choice", () => {
    roundTripThroughFreshRender(
      compileDoc(["@scene a", "@choice", "- Go -> b", "@end", "@scene b", "Arrived."].join("\n")),
      () => start(),
      () => expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument()
    );
  });

  it("presentation", () => {
    roundTripThroughFreshRender(
      compileDoc("@scene s\n@background room.jpg\nHi.\n"),
      () => start(),
      () => expect(screen.getByText("Background: room.jpg")).toBeInTheDocument()
    );
  });

  it("navigation", () => {
    roundTripThroughFreshRender(
      compileDoc(["@scene a", "@goto b", "@scene b", "Arrived."].join("\n")),
      () => start(),
      () => expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument()
    );
  });

  it("completed", () => {
    roundTripThroughFreshRender(
      compileDoc("@scene s\nOnly.\n"),
      () => {
        start();
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
      },
      () => expect(screen.getByText("Story complete.")).toBeInTheDocument()
    );
  });

  it("error", () => {
    const { document: errorDocument } = compile("@scene s\n@goto nowhere\n");
    roundTripThroughFreshRender(
      errorDocument,
      () => start(),
      () => expect(screen.getByRole("alert")).toBeInTheDocument()
    );
  });
});

describe("Presentation-state accumulation", () => {
  it("a full accumulated PresentationState (background/layer/camera/music/sprites) returns exactly after restore", () => {
    const source = [
      "@scene s",
      "@background room.jpg",
      "@layer alice.png",
      "@camera zoom to=1.5",
      "@music theme.mp3 volume=0.5",
      "@sprite show id=a image=a.png position=left",
      "@sprite show id=b image=b.png position=right",
      "Accumulated."
    ].join("\n");
    const ref = renderPlayer(compileDoc(source));
    start();
    while (!screen.queryByText("Accumulated.")) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }

    const snapshot = ref.current!.getSnapshot();
    expect(snapshot.presentation).toEqual({
      formatVersion: 1,
      background: "room.jpg",
      layer: "alice.png",
      cameraZoom: 1.5,
      music: { track: "theme.mp3", volume: 0.5 },
      sprites: [
        { id: "a", image: "a.png", position: "left" },
        { id: "b", image: "b.png", position: "right" }
      ]
    });

    const result = restore(ref, roundTrip(snapshot));
    expect(result).toEqual({ ok: true });
    expect(ref.current!.getSnapshot().presentation).toEqual(snapshot.presentation);
  });
});

describe("no-double-Presentation", () => {
  it("restoring an earlier snapshot never reapplies its current command onto the live session's (diverged) state", () => {
    const source = [
      "@scene s",
      "@sprite show id=a image=a.png position=left",
      "@sprite show id=b image=b.png position=right",
      "@sprite show id=c image=c.png position=center",
      "Done."
    ].join("\n");
    const ref = renderPlayer(compileDoc(source));
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // show b

    // Snapshot here: current = ShowSprite("b", ...), sprites = [a, b].
    const snapshot = ref.current!.getSnapshot();
    expect(snapshot.presentation.sprites.map((s) => s.id)).toEqual(["a", "b"]);

    // Diverge the LIVE session further before restoring: sprites becomes
    // [a, b, c] live. If restoreSnapshot incorrectly reapplied the
    // restored "current" command (ShowSprite "b") onto this live state
    // instead of installing the restored PresentationState directly, "c"
    // would incorrectly survive into the restored result.
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // show c

    const result = restore(ref, roundTrip(snapshot));
    expect(result).toEqual({ ok: true });
    expect(ref.current!.getSnapshot().presentation.sprites).toEqual([
      { id: "a", image: "a.png", position: "left" },
      { id: "b", image: "b.png", position: "right" }
    ]);
  });
});

describe("Player/Presentation mismatch matrix (Section 33.12 cross-validation)", () => {
  function expectRejectedWithNoStateChange(ref: RefObject<AfterTextPlayerHandle | null>, tampered: unknown): void {
    const before = ref.current!.getSnapshot();
    const result = restore(ref, tampered);
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalidPresentationSnapshot", detail: { kind: "malformedSnapshot", reason: expect.any(String) } }
    });
    expect(ref.current!.getSnapshot()).toEqual(before);
  }

  it("Background mismatch", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@background red.jpg\n"));
    start();
    const snapshot = ref.current!.getSnapshot();
    expectRejectedWithNoStateChange(ref, {
      ...snapshot,
      presentation: { ...snapshot.presentation, background: "blue.jpg" }
    });
  });

  it("Layer mismatch", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@layer a.png\n"));
    start();
    const snapshot = ref.current!.getSnapshot();
    expectRejectedWithNoStateChange(ref, { ...snapshot, presentation: { ...snapshot.presentation, layer: "b.png" } });
  });

  it("Camera mismatch", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@camera zoom to=2\n"));
    start();
    const snapshot = ref.current!.getSnapshot();
    expectRejectedWithNoStateChange(ref, { ...snapshot, presentation: { ...snapshot.presentation, cameraZoom: 1 } });
  });

  it("Music track mismatch", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@music trackA.mp3\n"));
    start();
    const snapshot = ref.current!.getSnapshot();
    expectRejectedWithNoStateChange(ref, {
      ...snapshot,
      presentation: { ...snapshot.presentation, music: { ...snapshot.presentation.music, track: "trackB.mp3" } }
    });
  });

  it("ShowSprite wrong image", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@sprite show id=a image=a.png position=left\n"));
    start();
    const snapshot = ref.current!.getSnapshot();
    expectRejectedWithNoStateChange(ref, {
      ...snapshot,
      presentation: {
        ...snapshot.presentation,
        sprites: [{ id: "a", image: "wrong.png", position: "left" }]
      }
    });
  });

  it("HideSprite id still present", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@sprite show id=a image=a.png position=left\n@sprite hide id=a\n"));
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // reach HideSprite
    const snapshot = ref.current!.getSnapshot();
    expect(snapshot.presentation.sprites).toEqual([]);
    expectRejectedWithNoStateChange(ref, {
      ...snapshot,
      presentation: { ...snapshot.presentation, sprites: [{ id: "a", image: "a.png", position: "left" as const }] }
    });
  });
});

describe("Independent-half atomic failure", () => {
  it("invalid Player half + valid Presentation half: rejected, no state change", () => {
    const ref = renderPlayer(compileDoc("@scene s\nHi.\n"));
    start();
    const before = ref.current!.getSnapshot();
    const result = restore(ref, { player: "not a valid player snapshot", presentation: before.presentation });
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalidPlayerSnapshot", detail: { kind: "malformedSnapshot", reason: expect.any(String) } }
    });
    expect(ref.current!.getSnapshot()).toEqual(before);
  });

  it("valid Player half + invalid Presentation half: rejected, no state change", () => {
    const ref = renderPlayer(compileDoc("@scene s\nHi.\n"));
    start();
    const before = ref.current!.getSnapshot();
    const result = restore(ref, { player: before.player, presentation: "not a valid presentation snapshot" });
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalidPresentationSnapshot", detail: { kind: "malformedSnapshot", reason: expect.any(String) } }
    });
    expect(ref.current!.getSnapshot()).toEqual(before);
  });

  it("a completely unusable top-level snapshot (not an object) is rejected, no state change", () => {
    const ref = renderPlayer(compileDoc("@scene s\nHi.\n"));
    start();
    const before = ref.current!.getSnapshot();
    expect(restore(ref, "not an object").ok).toBe(false);
    expect(restore(ref, null).ok).toBe(false);
    expect(restore(ref, undefined).ok).toBe(false);
    expect(restore(ref, []).ok).toBe(false);
    expect(ref.current!.getSnapshot()).toEqual(before);
  });

  it("both halves individually valid but cross-inconsistent: rejected, no state change, no audio/focus side effect", () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

    const ref = renderPlayer(compileDoc("@scene s\n@background red.jpg\n"));
    start();
    const before = ref.current!.getSnapshot();
    const playCallsBefore = playSpy.mock.calls.length;
    const pauseCallsBefore = pauseSpy.mock.calls.length;
    const activeBefore = document.activeElement;

    const result = restore(ref, {
      ...before,
      presentation: { ...before.presentation, background: "blue.jpg" }
    });

    expect(result.ok).toBe(false);
    expect(ref.current!.getSnapshot()).toEqual(before);
    expect(playSpy.mock.calls.length).toBe(playCallsBefore);
    expect(pauseSpy.mock.calls.length).toBe(pauseCallsBefore);
    expect(document.activeElement).toBe(activeBefore);

    vi.restoreAllMocks();
  });
});

describe("snapshot structural independence at the handle level", () => {
  it("mutating a snapshot object returned by getSnapshot never mutates live renderer state", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@background room.jpg\nHi.\n"));
    start();

    const snapshot = ref.current!.getSnapshot();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (snapshot.presentation as any).background = "mutated.jpg";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (snapshot.presentation.sprites as any[]).push({ id: "intruder", image: "x.png", position: "left" });

    expect(ref.current!.getSnapshot().presentation.background).toBe("room.jpg");
    expect(ref.current!.getSnapshot().presentation.sprites).toEqual([]);
  });
});

describe("document replacement with ref support", () => {
  it("getSnapshot after a document replacement reflects the replacement document, not the old one", () => {
    const first = compileDoc("@scene s\nFirst.\n");
    const second = compileDoc("@scene s\nSecond.\n");
    const ref = createRef<AfterTextPlayerHandle>();
    const { rerender } = render(<AfterTextPlayer ref={ref} document={first} />);
    start();
    const oldSnapshot = ref.current!.getSnapshot();

    rerender(<AfterTextPlayer ref={ref} document={second} />);

    // Restoring the pre-replacement document's snapshot against the
    // now-active replacement document must fail on fingerprint mismatch —
    // proving getSnapshot/restoreSnapshot never mix document identities.
    const resultAgainstStale = restore(ref, roundTrip(oldSnapshot));
    expect(resultAgainstStale).toEqual({
      ok: false,
      error: { kind: "invalidPlayerSnapshot", detail: { kind: "documentMismatch" } }
    });

    start();
    expect(screen.getByText("Second.")).toBeInTheDocument();
    const result = restore(ref, roundTrip(ref.current!.getSnapshot()));
    expect(result).toEqual({ ok: true });
  });
});

describe("audio cleanup on restore (Section 33.14)", () => {
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

  it("a failed restore does NOT stop the currently playing Music", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@music theme.mp3\n"));
    start();
    expect(playSpy).toHaveBeenCalledTimes(1);
    // applyMusicIntent's own setup calls element.pause() once before
    // retargeting/playing (audio-playback.ts) — capture that baseline
    // rather than assuming zero calls before the restore attempt.
    const pauseCallsBeforeRestore = pauseSpy.mock.calls.length;

    const result = restore(ref, "not a valid snapshot at all");
    expect(result.ok).toBe(false);
    expect(pauseSpy.mock.calls.length).toBe(pauseCallsBeforeRestore);
  });

  it("a failed restore does NOT stop an active Sfx instance", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@sfx click.wav\n"));
    start();
    expect(playSpy).toHaveBeenCalledTimes(1);

    const result = restore(ref, null);
    expect(result.ok).toBe(false);
    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it("a successful restore stops the old Music (mirrors Restart) without fabricating new playback", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@music theme.mp3\nAfter.\n"));
    start();
    expect(playSpy).toHaveBeenCalledTimes(1);

    const snapshot = ref.current!.getSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const result = restore(ref, roundTrip(snapshot));
    expect(result).toEqual({ ok: true });
    expect(pauseSpy).toHaveBeenCalled();
    // Restore never fabricates playback itself — no additional play() call
    // beyond the one the original authored @music already triggered.
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("a successful restore stops and clears an active Sfx instance", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@sfx click.wav\nAfter.\n"));
    start();
    const sfxElement = playSpy.mock.contexts[0] as HTMLAudioElement;

    const snapshot = ref.current!.getSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const result = restore(ref, roundTrip(snapshot));
    expect(result).toEqual({ ok: true });
    expect(pauseSpy.mock.contexts).toContain(sfxElement);
  });
});

describe("focus behavior on restore (Section 33.15)", () => {
  it("a successful restore moves focus to the new primary control", () => {
    const ref = renderPlayer(compileDoc("@scene s\nFirst.\n\nSecond.\n"));
    start();
    const snapshot = ref.current!.getSnapshot();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    restore(ref, roundTrip(snapshot));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next" }));
  });

  it("a failed restore does not steal focus the user has moved elsewhere", () => {
    const ref = createRef<AfterTextPlayerHandle>();
    render(
      <>
        <input aria-label="outside" />
        <AfterTextPlayer ref={ref} document={compileDoc("@scene s\nHi.\n")} />
      </>
    );
    start();
    const outside = screen.getByLabelText("outside");
    outside.focus();
    expect(document.activeElement).toBe(outside);

    const result = restore(ref, "garbage");
    expect(result.ok).toBe(false);
    expect(document.activeElement).toBe(outside);
  });
});

describe("timed Presentation restore (Section 33.13, 35-37)", () => {
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

  it("Pause: restoring onto the same logical Pause suspension begins locked again, with a full fresh duration", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@pause 1000ms\nAfter.\n"));
    start();
    const snapshot = ref.current!.getSnapshot();

    advanceTime(1000);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();

    const result = restore(ref, roundTrip(snapshot));
    expect(result).toEqual({ ok: true });
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    advanceTime(999);
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    advanceTime(1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("After.")).toBeInTheDocument();
  });

  it("timed Camera: restoring onto the same logical suspension begins locked again, with a full fresh duration", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@camera zoom to=1.5 duration=1000ms\nAfter.\n"));
    start();
    const snapshot = ref.current!.getSnapshot();

    advanceTime(1000);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();

    const result = restore(ref, roundTrip(snapshot));
    expect(result).toEqual({ ok: true });
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    advanceTime(1000);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("restoring over a currently LOCKED timer: the old timer never unlocks the restored session early", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@pause 1000ms\nAfter.\n"));
    start();
    const snapshot = ref.current!.getSnapshot();

    // Still locked (500ms of the original 1000ms timer elapsed) when we restore.
    advanceTime(500);
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    const result = restore(ref, roundTrip(snapshot));
    expect(result).toEqual({ ok: true });

    // Advancing only the OLD timer's remaining 500ms must NOT unlock the
    // restored session — its own fresh timer needs a full 1000ms.
    advanceTime(500);
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();

    advanceTime(500);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("restoring over a currently UNLOCKED timer: the restored gate starts locked, with no leaked unlocked state", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@pause 1000ms\nAfter.\n"));
    start();
    const snapshot = ref.current!.getSnapshot();

    advanceTime(1000);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();

    const result = restore(ref, roundTrip(snapshot));
    expect(result).toEqual({ ok: true });
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();

    advanceTime(1000);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("timed focus behavior: restoring onto a locked Pause keeps focus pending until the fresh timer unlocks", () => {
    const ref = renderPlayer(compileDoc("@scene s\n@pause 1000ms\nAfter.\n"));
    start();
    const snapshot = ref.current!.getSnapshot();
    advanceTime(1000);

    restore(ref, roundTrip(snapshot));
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);

    advanceTime(1000);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue" }));
  });

  it("does not unlock early under StrictMode's development double-invoke lifecycle", () => {
    const ref = createRef<AfterTextPlayerHandle>();
    render(
      <StrictMode>
        <AfterTextPlayer ref={ref} document={compileDoc("@scene s\n@pause 1000ms\nAfter.\n")} />
      </StrictMode>
    );
    start();
    const snapshot = ref.current!.getSnapshot();
    advanceTime(1000);

    const result = restore(ref, roundTrip(snapshot));
    expect(result).toEqual({ ok: true });
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    advanceTime(999);
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    advanceTime(1);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });
});
