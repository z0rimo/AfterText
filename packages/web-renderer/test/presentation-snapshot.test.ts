import { describe, expect, it } from "vitest";
import type { PresentationCommand } from "@aftertext/compiler";
import type { PresentationState, SpriteState } from "../src/presentation-state.js";
import { presentationStateMatchesCommand, restorePresentation, snapshotPresentation } from "../src/presentation-snapshot.js";

const BASE_STATE: PresentationState = { background: null, layer: null, cameraZoom: 1, music: null, sprites: [] };

function sprite(id: string, image: string, position: "left" | "center" | "right"): SpriteState {
  return { id, image, position };
}

/** A minimal, exactly-conforming `PresentationSnapshot`-shaped plain object, used as the valid base case every malformed-input test mutates one field of. */
const VALID_SNAPSHOT = {
  formatVersion: 1,
  background: "room.jpg",
  layer: "alice.png",
  cameraZoom: 1.5,
  music: { track: "theme.mp3", volume: 0.5 },
  sprites: [{ id: "a", image: "alice.png", position: "left" as const }]
};

describe("snapshotPresentation: basic conversion", () => {
  it("converts every field from the live PresentationState", () => {
    const state: PresentationState = {
      background: "room.jpg",
      layer: "alice.png",
      cameraZoom: 1.5,
      music: { track: "theme.mp3", volume: 0.5 },
      sprites: [sprite("a", "alice.png", "left"), sprite("b", "bob.png", "right")]
    };
    expect(snapshotPresentation(state)).toEqual({
      formatVersion: 1,
      background: "room.jpg",
      layer: "alice.png",
      cameraZoom: 1.5,
      music: { track: "theme.mp3", volume: 0.5 },
      sprites: [
        { id: "a", image: "alice.png", position: "left" },
        { id: "b", image: "bob.png", position: "right" }
      ]
    });
  });

  it("converts the initial state (no music, no sprites) correctly", () => {
    expect(snapshotPresentation(BASE_STATE)).toEqual({
      formatVersion: 1,
      background: null,
      layer: null,
      cameraZoom: 1,
      music: null,
      sprites: []
    });
  });

  it("omits volume entirely when no authored volume is present (undefined)", () => {
    const state: PresentationState = { ...BASE_STATE, music: { track: "theme.mp3", volume: undefined } };
    const result = snapshotPresentation(state);
    expect(result.music).toEqual({ track: "theme.mp3" });
    expect(Object.hasOwn(result.music!, "volume")).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity])(
    "normalizes a non-finite live music.volume (%s) to an absent property, not a stored raw or null value",
    (volume) => {
      const state: PresentationState = { ...BASE_STATE, music: { track: "theme.mp3", volume } };
      const result = snapshotPresentation(state);
      expect(result.music).toEqual({ track: "theme.mp3" });
      expect(Object.hasOwn(result.music!, "volume")).toBe(false);

      // Mandatory §33.20 conformance: the normalized snapshot round-trips
      // through ordinary JSON and is accepted by restorePresentation.
      const roundTripped = JSON.parse(JSON.stringify(result));
      const restored = restorePresentation(roundTripped);
      expect(restored.ok).toBe(true);
    }
  );

  it("does not expose the live PresentationState object itself: mutating the returned snapshot never mutates live state", () => {
    const state: PresentationState = {
      background: "room.jpg",
      layer: null,
      cameraZoom: 1,
      music: { track: "theme.mp3", volume: 0.8 },
      sprites: [sprite("a", "alice.png", "left")]
    };
    const snapshot = snapshotPresentation(state);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (snapshot.music as any).volume = 999;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (snapshot.sprites as any[]).push({ id: "intruder", image: "x.png", position: "right" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (snapshot.sprites[0] as any).image = "mutated.png";

    expect(state.music).toEqual({ track: "theme.mp3", volume: 0.8 });
    expect(state.sprites).toEqual([sprite("a", "alice.png", "left")]);
  });
});

describe("restorePresentation: format version", () => {
  it("accepts formatVersion 1", () => {
    expect(restorePresentation(VALID_SNAPSHOT).ok).toBe(true);
  });

  it.each([0, 2, "1", null, undefined])("rejects an unsupported/missing formatVersion (%s) as unsupportedFormatVersion", (formatVersion) => {
    const result = restorePresentation({ ...VALID_SNAPSHOT, formatVersion });
    expect(result).toEqual({ ok: false, error: { kind: "unsupportedFormatVersion" } });
  });
});

describe("restorePresentation: malformed-input matrix", () => {
  it.each([
    ["non-object", "not an object"],
    ["non-object (array)", ["not", "an", "object"]],
    ["non-object (null)", null]
  ])("rejects %s as malformedSnapshot", (_label, value) => {
    const result = restorePresentation(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("malformedSnapshot");
  });

  it.each([undefined, 1, true, []])("rejects a bad background (%s) as malformedSnapshot", (background) => {
    const result = restorePresentation({ ...VALID_SNAPSHOT, background });
    expect(result).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });

  it("accepts background: null", () => {
    expect(restorePresentation({ ...VALID_SNAPSHOT, background: null }).ok).toBe(true);
  });

  it.each([undefined, 1, true, []])("rejects a bad layer (%s) as malformedSnapshot", (layer) => {
    const result = restorePresentation({ ...VALID_SNAPSHOT, layer });
    expect(result).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });

  it.each([0, -1, -0.5, NaN, Infinity, -Infinity, "1.5", undefined, null])(
    "rejects an invalid cameraZoom (%s) as malformedSnapshot",
    (cameraZoom) => {
      const result = restorePresentation({ ...VALID_SNAPSHOT, cameraZoom });
      expect(result).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
    }
  );

  it("accepts a valid positive finite cameraZoom", () => {
    expect(restorePresentation({ ...VALID_SNAPSHOT, cameraZoom: 0.01 }).ok).toBe(true);
  });

  it("accepts music: null", () => {
    expect(restorePresentation({ ...VALID_SNAPSHOT, music: null }).ok).toBe(true);
  });

  it.each(["not an object", 1, [], { volume: 0.5 }, { track: 1 }])(
    "rejects a bad music object (%s) as malformedSnapshot",
    (music) => {
      const result = restorePresentation({ ...VALID_SNAPSHOT, music });
      expect(result).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
    }
  );

  it("accepts music with no volume property (absent means renderer default)", () => {
    const result = restorePresentation({ ...VALID_SNAPSHOT, music: { track: "theme.mp3" } });
    expect(result).toEqual({ ok: true, state: { ...BASE_STATE, cameraZoom: 1.5, background: "room.jpg", layer: "alice.png", music: { track: "theme.mp3", volume: undefined }, sprites: expect.any(Array) } });
  });

  it.each([null, undefined, NaN, Infinity, -Infinity, "0.5"])(
    "rejects music.volume explicitly present as %s (not finite) as malformedSnapshot, never treated as absent",
    (volume) => {
      const result = restorePresentation({ ...VALID_SNAPSHOT, music: { track: "theme.mp3", volume } });
      expect(result).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
    }
  );

  it("rejects sprites: non-array", () => {
    const result = restorePresentation({ ...VALID_SNAPSHOT, sprites: "not an array" });
    expect(result).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });

  it.each([
    [{ image: "x.png", position: "left" }, "missing id"],
    [{ id: "a", position: "left" }, "missing image"],
    [{ id: "a", image: "x.png" }, "missing position"],
    [{ id: "a", image: "x.png", position: "up" }, "bad position literal"],
    [{ id: 1, image: "x.png", position: "left" }, "non-string id"],
    [{ id: "a", image: 1, position: "left" }, "non-string image"]
  ])("rejects a malformed sprite entry (%s: %s)", (entry, _label) => {
    const result = restorePresentation({ ...VALID_SNAPSHOT, sprites: [entry] });
    expect(result).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });

  it("rejects duplicate sprite ids rather than silently deduplicating", () => {
    const result = restorePresentation({
      ...VALID_SNAPSHOT,
      sprites: [
        { id: "a", image: "x.png", position: "left" },
        { id: "a", image: "y.png", position: "right" }
      ]
    });
    expect(result).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });

  it("accepts an empty sprites array", () => {
    expect(restorePresentation({ ...VALID_SNAPSHOT, sprites: [] }).ok).toBe(true);
  });

  it("preserves sprite stacking order exactly, not sorted/reordered", () => {
    const result = restorePresentation({
      ...VALID_SNAPSHOT,
      sprites: [
        { id: "back", image: "b.png", position: "left" },
        { id: "front", image: "f.png", position: "right" }
      ]
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.sprites.map((s) => s.id)).toEqual(["back", "front"]);
    }
  });
});

describe("restorePresentation: structural independence", () => {
  it("a caller mutating the input object after restoring does not alter the resulting PresentationState", () => {
    const input = {
      ...VALID_SNAPSHOT,
      music: { track: "theme.mp3", volume: 0.5 },
      sprites: [{ id: "a", image: "x.png", position: "left" as "left" | "center" | "right" }]
    };
    const result = restorePresentation(input);
    expect(result.ok).toBe(true);

    input.music.volume = 999;
    input.sprites[0]!.image = "mutated.png";
    input.sprites.push({ id: "intruder", image: "y.png", position: "right" });

    if (result.ok) {
      expect(result.state.music).toEqual({ track: "theme.mp3", volume: 0.5 });
      expect(result.state.sprites).toEqual([{ id: "a", image: "x.png", position: "left" }]);
    }
  });
});

describe("presentationStateMatchesCommand: cross-validation", () => {
  it.each([
    ["Background matches", { type: "Background", image: "red.jpg" } as PresentationCommand, { ...BASE_STATE, background: "red.jpg" }, true],
    ["Background mismatch", { type: "Background", image: "red.jpg" } as PresentationCommand, { ...BASE_STATE, background: "blue.jpg" }, false],
    ["Layer matches", { type: "Layer", image: "a.png" } as PresentationCommand, { ...BASE_STATE, layer: "a.png" }, true],
    ["Layer mismatch", { type: "Layer", image: "a.png" } as PresentationCommand, { ...BASE_STATE, layer: "b.png" }, false],
    [
      "valid Camera matches",
      { type: "Camera", action: "zoom", to: 2, durationMs: undefined } as PresentationCommand,
      { ...BASE_STATE, cameraZoom: 2 },
      true
    ],
    [
      "valid Camera mismatch",
      { type: "Camera", action: "zoom", to: 2, durationMs: undefined } as PresentationCommand,
      { ...BASE_STATE, cameraZoom: 1 },
      false
    ],
    [
      "invalid Camera (to=0) imposes no constraint",
      { type: "Camera", action: "zoom", to: 0, durationMs: undefined } as PresentationCommand,
      { ...BASE_STATE, cameraZoom: 999 },
      true
    ],
    ["Sfx imposes no constraint", { type: "Sfx", clip: "x.wav" } as PresentationCommand, BASE_STATE, true],
    ["Pause imposes no constraint", { type: "Pause", durationMs: 100 } as PresentationCommand, BASE_STATE, true]
  ])("%s", (_label, command, presentation, expected) => {
    expect(presentationStateMatchesCommand(command, presentation)).toBe(expected);
  });

  describe("Music", () => {
    it("matches when track and a finite volume both equal the command's", () => {
      const command: PresentationCommand = { type: "Music", track: "theme.mp3", volume: 0.5 };
      expect(presentationStateMatchesCommand(command, { ...BASE_STATE, music: { track: "theme.mp3", volume: 0.5 } })).toBe(true);
    });

    it("mismatches on a different track", () => {
      const command: PresentationCommand = { type: "Music", track: "theme.mp3", volume: 0.5 };
      expect(presentationStateMatchesCommand(command, { ...BASE_STATE, music: { track: "other.mp3", volume: 0.5 } })).toBe(false);
    });

    it("mismatches when the snapshot has no music at all", () => {
      const command: PresentationCommand = { type: "Music", track: "theme.mp3", volume: 0.5 };
      expect(presentationStateMatchesCommand(command, BASE_STATE)).toBe(false);
    });

    it.each([NaN, Infinity, -Infinity])(
      "a non-finite command volume (%s) requires the snapshot volume to be absent, not literally equal",
      (volume) => {
        const command: PresentationCommand = { type: "Music", track: "theme.mp3", volume };
        expect(presentationStateMatchesCommand(command, { ...BASE_STATE, music: { track: "theme.mp3", volume: undefined } })).toBe(true);
      }
    );

    it("a non-finite command volume mismatches a snapshot with a finite stored volume", () => {
      const command: PresentationCommand = { type: "Music", track: "theme.mp3", volume: NaN };
      expect(presentationStateMatchesCommand(command, { ...BASE_STATE, music: { track: "theme.mp3", volume: 0.5 } })).toBe(false);
    });
  });

  describe("ShowSprite", () => {
    it("matches when the sprite id's entry has exactly that image/position", () => {
      const command: PresentationCommand = { type: "ShowSprite", id: "a", image: "x.png", position: "left" };
      const presentation = { ...BASE_STATE, sprites: [sprite("a", "x.png", "left")] };
      expect(presentationStateMatchesCommand(command, presentation)).toBe(true);
    });

    it("mismatches on wrong image", () => {
      const command: PresentationCommand = { type: "ShowSprite", id: "a", image: "x.png", position: "left" };
      const presentation = { ...BASE_STATE, sprites: [sprite("a", "wrong.png", "left")] };
      expect(presentationStateMatchesCommand(command, presentation)).toBe(false);
    });

    it("mismatches on wrong position", () => {
      const command: PresentationCommand = { type: "ShowSprite", id: "a", image: "x.png", position: "left" };
      const presentation = { ...BASE_STATE, sprites: [sprite("a", "x.png", "right")] };
      expect(presentationStateMatchesCommand(command, presentation)).toBe(false);
    });

    it("mismatches when the id is absent entirely", () => {
      const command: PresentationCommand = { type: "ShowSprite", id: "a", image: "x.png", position: "left" };
      expect(presentationStateMatchesCommand(command, BASE_STATE)).toBe(false);
    });
  });

  describe("HideSprite", () => {
    it("matches when the id is absent from sprites", () => {
      const command: PresentationCommand = { type: "HideSprite", id: "a" };
      expect(presentationStateMatchesCommand(command, BASE_STATE)).toBe(true);
    });

    it("mismatches when the id is still present", () => {
      const command: PresentationCommand = { type: "HideSprite", id: "a" };
      const presentation = { ...BASE_STATE, sprites: [sprite("a", "x.png", "left")] };
      expect(presentationStateMatchesCommand(command, presentation)).toBe(false);
    });
  });
});
