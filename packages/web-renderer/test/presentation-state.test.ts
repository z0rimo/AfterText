import { describe, expect, it } from "vitest";
import type { PresentationCommand } from "@aftertext/compiler";
import type { PlayerState } from "@aftertext/player";
import {
  acceptPlayerState,
  applyPresentation,
  INITIAL_PRESENTATION_STATE,
  type PresentationState,
  type SpriteState
} from "../src/presentation-state.js";

const BACKGROUND_A: PresentationCommand = { type: "Background", image: "a.jpg" };
const BACKGROUND_B: PresentationCommand = { type: "Background", image: "b.jpg" };
const LAYER_A: PresentationCommand = { type: "Layer", image: "alice.png" };
const LAYER_B: PresentationCommand = { type: "Layer", image: "bob.png" };
const SFX: PresentationCommand = { type: "Sfx", clip: "click.wav" };
const PAUSE: PresentationCommand = { type: "Pause", durationMs: 2000 };

function cameraZoomTo(to: number): PresentationCommand {
  return { type: "Camera", action: "zoom", to, durationMs: undefined };
}

function musicTrack(track: string, volume?: number): PresentationCommand {
  return { type: "Music", track, volume };
}

function showSprite(id: string, image: string, position: "left" | "center" | "right"): PresentationCommand {
  return { type: "ShowSprite", id, image, position };
}

function hideSprite(id: string): PresentationCommand {
  return { type: "HideSprite", id };
}

const BASE_STATE: PresentationState = { background: null, layer: null, cameraZoom: 1, music: null, sprites: [] };

describe("INITIAL_PRESENTATION_STATE", () => {
  it("starts with both asset slots empty, identity camera zoom, no music, and no sprites", () => {
    expect(INITIAL_PRESENTATION_STATE).toEqual({
      background: null,
      layer: null,
      cameraZoom: 1,
      music: null,
      sprites: []
    });
  });
});

describe("applyPresentation: Background/Layer", () => {
  it("Background sets the background slot", () => {
    const result = applyPresentation(INITIAL_PRESENTATION_STATE, BACKGROUND_A);
    expect(result).toEqual({ background: "a.jpg", layer: null, cameraZoom: 1, music: null, sprites: [] });
  });

  it("Background replaces an existing background", () => {
    const first = applyPresentation(INITIAL_PRESENTATION_STATE, BACKGROUND_A);
    const second = applyPresentation(first, BACKGROUND_B);
    expect(second).toEqual({ background: "b.jpg", layer: null, cameraZoom: 1, music: null, sprites: [] });
  });

  it("Layer sets the layer slot", () => {
    const result = applyPresentation(INITIAL_PRESENTATION_STATE, LAYER_A);
    expect(result).toEqual({ background: null, layer: "alice.png", cameraZoom: 1, music: null, sprites: [] });
  });

  it("Layer replaces an existing layer, never appending", () => {
    const first = applyPresentation(INITIAL_PRESENTATION_STATE, LAYER_A);
    const second = applyPresentation(first, LAYER_B);
    expect(second).toEqual({ background: null, layer: "bob.png", cameraZoom: 1, music: null, sprites: [] });
  });

  it("Background and Layer are independent slots", () => {
    const withBackground = applyPresentation(INITIAL_PRESENTATION_STATE, BACKGROUND_A);
    const withBoth = applyPresentation(withBackground, LAYER_A);
    expect(withBoth).toEqual({ background: "a.jpg", layer: "alice.png", cameraZoom: 1, music: null, sprites: [] });
  });

  it("does not mutate the input state", () => {
    const before: PresentationState = { ...BASE_STATE, background: "a.jpg" };
    const beforeSnapshot = { ...before };
    applyPresentation(before, BACKGROUND_B);
    expect(before).toEqual(beforeSnapshot);
  });

  it.each([
    ["Sfx", SFX],
    ["Pause", PAUSE]
  ])("%s leaves PresentationState unchanged (same reference)", (_name, command) => {
    const state: PresentationState = {
      background: "a.jpg",
      layer: "alice.png",
      cameraZoom: 1.5,
      music: { track: "theme.mp3", volume: 0.5 },
      sprites: []
    };
    const result = applyPresentation(state, command);
    expect(result).toBe(state);
  });

  it("Camera preserves background/layer/music, only replacing cameraZoom", () => {
    const state: PresentationState = {
      background: "a.jpg",
      layer: "alice.png",
      cameraZoom: 1,
      music: { track: "theme.mp3", volume: undefined },
      sprites: []
    };
    const result = applyPresentation(state, cameraZoomTo(1.5));
    expect(result).toEqual({
      background: "a.jpg",
      layer: "alice.png",
      cameraZoom: 1.5,
      music: { track: "theme.mp3", volume: undefined },
      sprites: []
    });
  });
});

describe("applyPresentation: Camera zoom", () => {
  it("a valid Camera sets cameraZoom", () => {
    const result = applyPresentation(INITIAL_PRESENTATION_STATE, cameraZoomTo(1.5));
    expect(result.cameraZoom).toBe(1.5);
  });

  it("a second valid Camera replaces the previous zoom", () => {
    const first = applyPresentation(INITIAL_PRESENTATION_STATE, cameraZoomTo(1.5));
    const second = applyPresentation(first, cameraZoomTo(2));
    expect(second.cameraZoom).toBe(2);
  });

  it("to=1 restores identity zoom", () => {
    const zoomed = applyPresentation(INITIAL_PRESENTATION_STATE, cameraZoomTo(1.5));
    const restored = applyPresentation(zoomed, cameraZoomTo(1));
    expect(restored.cameraZoom).toBe(1);
  });

  it("a fractional zoom below 1 is accepted", () => {
    const result = applyPresentation(INITIAL_PRESENTATION_STATE, cameraZoomTo(0.8));
    expect(result.cameraZoom).toBe(0.8);
  });

  it("a very large finite positive value is accepted, unclamped", () => {
    const result = applyPresentation(INITIAL_PRESENTATION_STATE, cameraZoomTo(999_999));
    expect(result.cameraZoom).toBe(999_999);
  });

  it.each([
    ["zero", 0],
    ["negative", -5],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["NaN", Number.NaN]
  ])("an invalid zoom (%s) is ignored, leaving cameraZoom unchanged (same reference)", (_name, to) => {
    const state: PresentationState = { ...BASE_STATE, cameraZoom: 1.5 };
    const result = applyPresentation(state, cameraZoomTo(to));
    expect(result).toBe(state);
    expect(result.cameraZoom).toBe(1.5);
  });

  it("does not mutate the input state", () => {
    const before: PresentationState = { ...BASE_STATE };
    const beforeSnapshot = { ...before };
    applyPresentation(before, cameraZoomTo(1.5));
    expect(before).toEqual(beforeSnapshot);
  });
});

describe("applyPresentation: Music", () => {
  it("initial music is null", () => {
    expect(INITIAL_PRESENTATION_STATE.music).toBeNull();
  });

  it("a Music command stores the raw authored track", () => {
    const result = applyPresentation(INITIAL_PRESENTATION_STATE, musicTrack("theme.mp3"));
    expect(result.music?.track).toBe("theme.mp3");
  });

  it("a Music command stores the raw authored volume", () => {
    const result = applyPresentation(INITIAL_PRESENTATION_STATE, musicTrack("theme.mp3", 0.5));
    expect(result.music?.volume).toBe(0.5);
  });

  it("an omitted volume is preserved as undefined, not defaulted", () => {
    const result = applyPresentation(INITIAL_PRESENTATION_STATE, musicTrack("theme.mp3"));
    expect(result.music).toEqual({ track: "theme.mp3", volume: undefined });
  });

  it("a later Music command replaces the previous one", () => {
    const first = applyPresentation(INITIAL_PRESENTATION_STATE, musicTrack("a.mp3", 0.5));
    const second = applyPresentation(first, musicTrack("b.mp3", 0.8));
    expect(second.music).toEqual({ track: "b.mp3", volume: 0.8 });
  });

  it("an identical Music command remains a valid, independent state transition (not suppressed)", () => {
    const first = applyPresentation(INITIAL_PRESENTATION_STATE, musicTrack("theme.mp3", 0.5));
    const second = applyPresentation(first, musicTrack("theme.mp3", 0.5));
    expect(second.music).toEqual({ track: "theme.mp3", volume: 0.5 });
    expect(second).not.toBe(first);
  });

  it("Music preserves background/layer/cameraZoom", () => {
    const state: PresentationState = {
      background: "a.jpg",
      layer: "alice.png",
      cameraZoom: 1.5,
      music: null,
      sprites: []
    };
    const result = applyPresentation(state, musicTrack("theme.mp3"));
    expect(result.background).toBe("a.jpg");
    expect(result.layer).toBe("alice.png");
    expect(result.cameraZoom).toBe(1.5);
  });

  it.each([
    ["Background", BACKGROUND_A],
    ["Layer", LAYER_A],
    ["Camera", cameraZoomTo(1.5)],
    ["Pause", PAUSE],
    ["Sfx", SFX]
  ])("%s preserves the current music state (same reference)", (_name, command) => {
    const state: PresentationState = { ...BASE_STATE, music: { track: "theme.mp3", volume: 0.5 } };
    const result = applyPresentation(state, command);
    expect(result.music).toBe(state.music);
  });

  it("does not mutate the input state", () => {
    const before: PresentationState = { ...BASE_STATE, music: { track: "a.mp3", volume: undefined } };
    const beforeSnapshot = { ...before, music: { ...before.music } };
    applyPresentation(before, musicTrack("b.mp3"));
    expect(before).toEqual(beforeSnapshot);
  });
});

describe("applyPresentation: Sprite", () => {
  it("initial sprites is empty", () => {
    expect(INITIAL_PRESENTATION_STATE.sprites).toEqual([]);
  });

  it("showing an absent sprite appends it (back-most and only entry)", () => {
    const result = applyPresentation(INITIAL_PRESENTATION_STATE, showSprite("alice", "a.png", "left"));
    expect(result.sprites).toEqual<readonly SpriteState[]>([{ id: "alice", image: "a.png", position: "left" }]);
  });

  it("showing a second absent sprite appends it front-most, preserving back-to-front order", () => {
    const first = applyPresentation(INITIAL_PRESENTATION_STATE, showSprite("alice", "a.png", "left"));
    const second = applyPresentation(first, showSprite("bob", "b.png", "right"));
    expect(second.sprites).toEqual<readonly SpriteState[]>([
      { id: "alice", image: "a.png", position: "left" },
      { id: "bob", image: "b.png", position: "right" }
    ]);
  });

  it("showing an already-visible id replaces its complete state in place, preserving its stacking index", () => {
    const afterAlice = applyPresentation(INITIAL_PRESENTATION_STATE, showSprite("alice", "a.png", "left"));
    const afterBob = applyPresentation(afterAlice, showSprite("bob", "b.png", "right"));
    const afterAliceUpdate = applyPresentation(afterBob, showSprite("alice", "a2.png", "center"));
    expect(afterAliceUpdate.sprites).toEqual<readonly SpriteState[]>([
      { id: "alice", image: "a2.png", position: "center" },
      { id: "bob", image: "b.png", position: "right" }
    ]);
  });

  it("showing an already-visible id never reorders it to the front", () => {
    const afterAlice = applyPresentation(INITIAL_PRESENTATION_STATE, showSprite("alice", "a.png", "left"));
    const afterBob = applyPresentation(afterAlice, showSprite("bob", "b.png", "right"));
    const afterAliceUpdate = applyPresentation(afterBob, showSprite("alice", "a2.png", "center"));
    expect(afterAliceUpdate.sprites.map((s) => s.id)).not.toEqual(["bob", "alice"]);
    expect(afterAliceUpdate.sprites.map((s) => s.id)).toEqual(["alice", "bob"]);
  });

  it("an identical show (same id/image/position) is still a real state transition, never suppressed by value equality", () => {
    const first = applyPresentation(INITIAL_PRESENTATION_STATE, showSprite("alice", "a.png", "left"));
    const second = applyPresentation(first, showSprite("alice", "a.png", "left"));
    expect(second.sprites).toEqual<readonly SpriteState[]>([{ id: "alice", image: "a.png", position: "left" }]);
    expect(second).not.toBe(first);
    expect(second.sprites).not.toBe(first.sprites);
  });

  it("hiding a visible sprite removes it, preserving the relative order of the rest", () => {
    const afterAlice = applyPresentation(INITIAL_PRESENTATION_STATE, showSprite("alice", "a.png", "left"));
    const afterBob = applyPresentation(afterAlice, showSprite("bob", "b.png", "right"));
    const result = applyPresentation(afterBob, hideSprite("alice"));
    expect(result.sprites).toEqual<readonly SpriteState[]>([{ id: "bob", image: "b.png", position: "right" }]);
  });

  it("hiding an id that is not currently visible is a true no-op (same PresentationState reference)", () => {
    const state = applyPresentation(INITIAL_PRESENTATION_STATE, showSprite("bob", "b.png", "right"));
    const result = applyPresentation(state, hideSprite("alice"));
    expect(result).toBe(state);
    expect(result.sprites).toEqual<readonly SpriteState[]>([{ id: "bob", image: "b.png", position: "right" }]);
  });

  it("hide then re-show appends the sprite as a new front-most occurrence, not its old position", () => {
    const afterAlice = applyPresentation(INITIAL_PRESENTATION_STATE, showSprite("alice", "a.png", "left"));
    const afterBob = applyPresentation(afterAlice, showSprite("bob", "b.png", "right"));
    const afterHide = applyPresentation(afterBob, hideSprite("alice"));
    const afterReshow = applyPresentation(afterHide, showSprite("alice", "a2.png", "center"));
    expect(afterReshow.sprites).toEqual<readonly SpriteState[]>([
      { id: "bob", image: "b.png", position: "right" },
      { id: "alice", image: "a2.png", position: "center" }
    ]);
  });

  it("ShowSprite/HideSprite preserve background/layer/cameraZoom/music", () => {
    const state: PresentationState = {
      background: "a.jpg",
      layer: "alice.png",
      cameraZoom: 1.5,
      music: { track: "theme.mp3", volume: 0.5 },
      sprites: []
    };
    const result = applyPresentation(state, showSprite("alice", "a.png", "left"));
    expect(result.background).toBe("a.jpg");
    expect(result.layer).toBe("alice.png");
    expect(result.cameraZoom).toBe(1.5);
    expect(result.music).toBe(state.music);
  });

  it("does not mutate the input state's sprites array on show", () => {
    const before = applyPresentation(INITIAL_PRESENTATION_STATE, showSprite("alice", "a.png", "left"));
    const beforeSnapshot = [...before.sprites];
    applyPresentation(before, showSprite("bob", "b.png", "right"));
    expect(before.sprites).toEqual(beforeSnapshot);
  });
});

describe("acceptPlayerState", () => {
  function playerWithResult(result: PlayerState["current"]): PlayerState {
    return { runtimeState: {} as PlayerState["runtimeState"], cursor: [], current: result };
  }

  it("applies the command when the Player result is a presentation", () => {
    const player = playerWithResult({ type: "presentation", command: BACKGROUND_A });
    const result = acceptPlayerState(INITIAL_PRESENTATION_STATE, player);
    expect(result).toEqual({ background: "a.jpg", layer: null, cameraZoom: 1, music: null, sprites: [] });
  });

  it("applies a valid Camera zoom through the same acceptance path", () => {
    const player = playerWithResult({ type: "presentation", command: cameraZoomTo(1.5) });
    const result = acceptPlayerState(INITIAL_PRESENTATION_STATE, player);
    expect(result.cameraZoom).toBe(1.5);
  });

  it("applies a Music command through the same acceptance path", () => {
    const player = playerWithResult({ type: "presentation", command: musicTrack("theme.mp3", 0.5) });
    const result = acceptPlayerState(INITIAL_PRESENTATION_STATE, player);
    expect(result.music).toEqual({ track: "theme.mp3", volume: 0.5 });
  });

  it("leaves state unchanged for content", () => {
    const state: PresentationState = { ...BASE_STATE, background: "a.jpg" };
    const player = playerWithResult({
      type: "content",
      block: { type: "Paragraph", children: [], span: undefined as never }
    });
    expect(acceptPlayerState(state, player)).toBe(state);
  });

  it("leaves state unchanged for null (not yet started)", () => {
    const state = INITIAL_PRESENTATION_STATE;
    expect(acceptPlayerState(state, playerWithResult(null))).toBe(state);
  });
});
