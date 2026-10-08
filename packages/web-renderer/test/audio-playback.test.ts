import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicCommand, SfxCommand } from "@aftertext/compiler";
import {
  applyMusicIntent,
  applySfxIntent,
  getOrCreateMusicElement,
  normalizePlaybackVolume,
  stopAndClearSfx,
  stopMusicElement,
  type ResolveAudioAsset
} from "../src/audio-playback.js";

describe("normalizePlaybackVolume", () => {
  it.each([
    [undefined, 1],
    [1, 1],
    [0, 0],
    [0.5, 0.5],
    [-5, 0],
    [1.5, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [Number.NEGATIVE_INFINITY, 1]
  ])("normalizePlaybackVolume(%s) -> %s", (input, expected) => {
    expect(normalizePlaybackVolume(input)).toBe(expected);
  });

  it("never returns a value outside [0, 1]", () => {
    for (const input of [-1000, -0.001, 1.001, 1000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = normalizePlaybackVolume(input);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });
});

describe("getOrCreateMusicElement", () => {
  it("lazily creates an element on first call", () => {
    const ref = { current: null as HTMLAudioElement | null };
    const element = getOrCreateMusicElement(ref);
    expect(element).toBeInstanceOf(HTMLAudioElement);
    expect(ref.current).toBe(element);
  });

  it("returns the same element on subsequent calls", () => {
    const ref = { current: null as HTMLAudioElement | null };
    const first = getOrCreateMusicElement(ref);
    const second = getOrCreateMusicElement(ref);
    expect(second).toBe(first);
  });
});

describe("applyMusicIntent", () => {
  let element: HTMLAudioElement;
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;
  let loadSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    element = new Audio();
    playSpy = vi.spyOn(element, "play").mockResolvedValue(undefined);
    pauseSpy = vi.spyOn(element, "pause").mockImplementation(() => {});
    loadSpy = vi.spyOn(element, "load").mockImplementation(() => {});
  });

  function music(track: string, volume?: number): MusicCommand {
    return { type: "Music", track, volume };
  }

  it("resolves the track, sets src/volume, loads, and plays", () => {
    const resolveAsset: ResolveAudioAsset = (ref) => `/resolved/${ref}`;
    applyMusicIntent(element, music("theme.mp3", 0.5), resolveAsset);

    expect(element.src).toContain("/resolved/theme.mp3");
    expect(element.volume).toBe(0.5);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("normalizes an out-of-range volume before assigning it", () => {
    const resolveAsset: ResolveAudioAsset = (ref) => `/resolved/${ref}`;
    applyMusicIntent(element, music("theme.mp3", 5), resolveAsset);
    expect(element.volume).toBe(1);
  });

  it("passes the correct ref and kind to the resolver", () => {
    const seen: Array<{ ref: string; kind: string }> = [];
    const resolveAsset: ResolveAudioAsset = (ref, kind) => {
      seen.push({ ref, kind });
      return `/resolved/${ref}`;
    };
    applyMusicIntent(element, music("theme.mp3"), resolveAsset);
    expect(seen).toEqual([{ ref: "theme.mp3", kind: "music" }]);
  });

  it("a null resolver result skips playback entirely, non-fatally", () => {
    const resolveAsset: ResolveAudioAsset = () => null;
    expect(() => applyMusicIntent(element, music("theme.mp3"), resolveAsset)).not.toThrow();
    expect(playSpy).not.toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("an unsafe resolved URL skips playback entirely, non-fatally", () => {
    const resolveAsset: ResolveAudioAsset = () => "javascript:alert(1)";
    expect(() => applyMusicIntent(element, music("theme.mp3"), resolveAsset)).not.toThrow();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("a synchronous play() throw is swallowed, non-fatal", () => {
    playSpy.mockImplementation(() => {
      throw new Error("boom");
    });
    const resolveAsset: ResolveAudioAsset = (ref) => `/resolved/${ref}`;
    expect(() => applyMusicIntent(element, music("theme.mp3"), resolveAsset)).not.toThrow();
  });

  it("a play() that returns no Promise (older engines, test doubles) is tolerated", () => {
    playSpy.mockReturnValue(undefined as never);
    const resolveAsset: ResolveAudioAsset = (ref) => `/resolved/${ref}`;
    expect(() => applyMusicIntent(element, music("theme.mp3"), resolveAsset)).not.toThrow();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("a rejected play() Promise never produces an unhandled rejection", async () => {
    playSpy.mockRejectedValue(new Error("NotAllowedError"));
    const resolveAsset: ResolveAudioAsset = (ref) => `/resolved/${ref}`;
    expect(() => applyMusicIntent(element, music("theme.mp3"), resolveAsset)).not.toThrow();
    // Let the microtask queue flush so the rejection is actually observed
    // (and confirmed caught) before the test ends.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("a same-track command still restarts playback (load() is always called)", () => {
    const resolveAsset: ResolveAudioAsset = (ref) => `/resolved/${ref}`;
    applyMusicIntent(element, music("theme.mp3"), resolveAsset);
    applyMusicIntent(element, music("theme.mp3"), resolveAsset);
    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(playSpy).toHaveBeenCalledTimes(2);
  });
});

describe("stopMusicElement", () => {
  it("calls pause on a real element", () => {
    const element = new Audio();
    const pauseSpy = vi.spyOn(element, "pause").mockImplementation(() => {});
    stopMusicElement(element);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for null", () => {
    expect(() => stopMusicElement(null)).not.toThrow();
  });

  it("swallows a throw from pause()", () => {
    const element = new Audio();
    vi.spyOn(element, "pause").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => stopMusicElement(element)).not.toThrow();
  });
});

describe("applySfxIntent", () => {
  function sfx(clip: string): SfxCommand {
    return { type: "Sfx", clip };
  }

  it("creates an independent instance and tracks it while playing", () => {
    const activeSfx = new Set<HTMLAudioElement>();
    const resolveAsset: ResolveAudioAsset = (ref) => `/resolved/${ref}`;
    applySfxIntent(sfx("click.wav"), resolveAsset, activeSfx);
    expect(activeSfx.size).toBe(1);
  });

  it("passes the correct ref and kind to the resolver", () => {
    const seen: Array<{ ref: string; kind: string }> = [];
    const resolveAsset: ResolveAudioAsset = (ref, kind) => {
      seen.push({ ref, kind });
      return `/resolved/${ref}`;
    };
    applySfxIntent(sfx("click.wav"), resolveAsset, new Set());
    expect(seen).toEqual([{ ref: "click.wav", kind: "sfx" }]);
  });

  it("two consecutive identical Sfx commands create two independent instances", () => {
    const activeSfx = new Set<HTMLAudioElement>();
    const resolveAsset: ResolveAudioAsset = (ref) => `/resolved/${ref}`;
    applySfxIntent(sfx("click.wav"), resolveAsset, activeSfx);
    applySfxIntent(sfx("click.wav"), resolveAsset, activeSfx);
    expect(activeSfx.size).toBe(2);
  });

  it("a null resolver result creates no instance", () => {
    const activeSfx = new Set<HTMLAudioElement>();
    const resolveAsset: ResolveAudioAsset = () => null;
    applySfxIntent(sfx("click.wav"), resolveAsset, activeSfx);
    expect(activeSfx.size).toBe(0);
  });

  it("an unsafe resolved URL creates no instance", () => {
    const activeSfx = new Set<HTMLAudioElement>();
    const resolveAsset: ResolveAudioAsset = () => "javascript:alert(1)";
    applySfxIntent(sfx("click.wav"), resolveAsset, activeSfx);
    expect(activeSfx.size).toBe(0);
  });

  it("removes the instance from tracking when it naturally ends", () => {
    const activeSfx = new Set<HTMLAudioElement>();
    const resolveAsset: ResolveAudioAsset = (ref) => `/resolved/${ref}`;
    applySfxIntent(sfx("click.wav"), resolveAsset, activeSfx);
    const [element] = [...activeSfx];
    element?.dispatchEvent(new Event("ended"));
    expect(activeSfx.size).toBe(0);
  });

  it("removes the instance from tracking on a native error", () => {
    const activeSfx = new Set<HTMLAudioElement>();
    const resolveAsset: ResolveAudioAsset = (ref) => `/resolved/${ref}`;
    applySfxIntent(sfx("click.wav"), resolveAsset, activeSfx);
    const [element] = [...activeSfx];
    element?.dispatchEvent(new Event("error"));
    expect(activeSfx.size).toBe(0);
  });
});

describe("stopAndClearSfx", () => {
  it("pauses and clears every tracked instance", () => {
    const a = new Audio();
    const b = new Audio();
    const pauseA = vi.spyOn(a, "pause").mockImplementation(() => {});
    const pauseB = vi.spyOn(b, "pause").mockImplementation(() => {});
    const activeSfx = new Set([a, b]);

    stopAndClearSfx(activeSfx);

    expect(pauseA).toHaveBeenCalledTimes(1);
    expect(pauseB).toHaveBeenCalledTimes(1);
    expect(activeSfx.size).toBe(0);
  });

  it("is safe on an empty set", () => {
    expect(() => stopAndClearSfx(new Set())).not.toThrow();
  });

  it("swallows a throw from an individual pause() and still clears the set", () => {
    const a = new Audio();
    vi.spyOn(a, "pause").mockImplementation(() => {
      throw new Error("boom");
    });
    const activeSfx = new Set([a]);
    expect(() => stopAndClearSfx(activeSfx)).not.toThrow();
    expect(activeSfx.size).toBe(0);
  });
});
