import { describe, expect, it } from "vitest";
import type { PresentationCommand, PresentationNode, StoryBlock } from "../src/index.js";
import { compile } from "../src/index.js";
import { codesOf, compileOk } from "./helpers.js";

function presentation(block: StoryBlock): PresentationNode {
  if (block.type !== "Presentation") throw new Error(`expected Presentation, got ${block.type}`);
  return block;
}

describe("simple presentation directives", () => {
  it.each<[string, PresentationCommand]>([
    ["@background room.jpg", { type: "Background", image: "room.jpg" }],
    ["@layer rain.png", { type: "Layer", image: "rain.png" }],
    [
      "@camera zoom to=1.15 duration=6s",
      { type: "Camera", action: "zoom", to: 1.15, durationMs: 6000 }
    ],
    ["@camera zoom to=1.15", { type: "Camera", action: "zoom", to: 1.15, durationMs: undefined }],
    ["@music rain.mp3 volume=0.5", { type: "Music", track: "rain.mp3", volume: 0.5 }],
    ["@music rain.mp3", { type: "Music", track: "rain.mp3", volume: undefined }],
    ["@sfx door.wav", { type: "Sfx", clip: "door.wav" }],
    ["@pause 1200ms", { type: "Pause", durationMs: 1200 }],
    ["@pause 2s", { type: "Pause", durationMs: 2000 }],
    [
      "@sprite show id=alice image=alice.png position=left",
      { type: "ShowSprite", id: "alice", image: "alice.png", position: "left" }
    ],
    [
      "@sprite show id=alice image=alice.png position=center",
      { type: "ShowSprite", id: "alice", image: "alice.png", position: "center" }
    ],
    [
      "@sprite show id=alice image=alice.png position=right",
      { type: "ShowSprite", id: "alice", image: "alice.png", position: "right" }
    ],
    ["@sprite hide id=alice", { type: "HideSprite", id: "alice" }]
  ])("normalizes %s into a typed command", (line, expected) => {
    const { document } = compileOk(`@scene s\n${line}\n`);
    const block = presentation(document.scenes[0]!.blocks[0]!);
    expect(block.command).toEqual(expected);
  });

  it.each([
    ["@background", "missing required file path"],
    ["@pause", "missing required duration"],
    ["@pause 12", "duration missing a unit"],
    ["@camera pan to=1", "unsupported camera action"],
    ["@camera zoom", "missing required to="],
    ["@camera zoom to=abc", "non-numeric to="],
    ["@music rain.mp3 volume=loud", "non-numeric volume"],
    ["@sprite", "missing action"],
    ["@sprite dance id=alice", "unsupported sprite action"],
    ["@sprite show", "missing id="],
    ["@sprite show id=alice", "missing image="],
    ["@sprite show id=alice image=a.png", "missing position="],
    ["@sprite show id=alice image=a.png position=middle", "unsupported position"],
    ["@sprite hide", "missing id="],
    ["@sprite hide id=", "trailing id= with no value is not a recognized named parameter"]
  ])("reports AT1301 for %s (%s)", (line) => {
    const result = compile(`@scene s\n${line}\n`);
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.hasErrors).toBe(true);
    // Malformed presentation directives are dropped rather than emitting a
    // node with placeholder values.
    expect(result.document.scenes[0]!.blocks).toHaveLength(0);
  });
});

describe("@sprite inherited Presentation tokenizer behavior", () => {
  it("last occurrence wins on a duplicate id= (existing global Presentation behavior)", () => {
    const { document } = compileOk("@scene s\n@sprite show id=alice id=bob image=a.png position=left\n");
    const block = presentation(document.scenes[0]!.blocks[0]!);
    expect(block.command).toEqual({ type: "ShowSprite", id: "bob", image: "a.png", position: "left" });
  });

  it("silently ignores an unknown named parameter (existing global Presentation behavior)", () => {
    const { document } = compileOk("@scene s\n@sprite show id=alice image=a.png position=left foo=bar\n");
    const block = presentation(document.scenes[0]!.blocks[0]!);
    expect(block.command).toEqual({ type: "ShowSprite", id: "alice", image: "a.png", position: "left" });
  });

  it.each(["true", "false", "null", "__proto__", "Alice"])(
    "treats id=%s as an ordinary, un-evaluated string",
    (id) => {
      const { document } = compileOk(`@scene s\n@sprite show id=${id} image=a.png position=left\n`);
      const block = presentation(document.scenes[0]!.blocks[0]!);
      expect(block.command).toEqual({ type: "ShowSprite", id, image: "a.png", position: "left" });
    }
  );

  it("is case-sensitive: id=Alice and id=alice are distinct string identities", () => {
    const { document: lower } = compileOk("@scene s\n@sprite show id=alice image=a.png position=left\n");
    const { document: upper } = compileOk("@scene s\n@sprite show id=Alice image=a.png position=left\n");
    const lowerBlock = presentation(lower.scenes[0]!.blocks[0]!);
    const upperBlock = presentation(upper.scenes[0]!.blocks[0]!);
    expect(lowerBlock.command).toMatchObject({ id: "alice" });
    expect(upperBlock.command).toMatchObject({ id: "Alice" });
  });

  // Documents a pre-existing, non-Sprite-specific tokenizer limitation
  // (docs/CORE_SPEC.md Section 31.11): quoting is recognized only when a
  // whole token's first character is `"` (an unprefixed positional token),
  // never for a `key="..."` named-parameter token. `id="alice bob"` is
  // therefore not decoded as one quoted string — `"alice` and `bob"`
  // tokenize as two separate tokens, and since neither matches
  // `key=value`, the second becomes a stray extra positional token. That
  // joins into the same `value` used for the action token (`show`/`hide`),
  // so the directive fails as an "unsupported sprite action" — exactly the
  // same mechanism `@camera zoom to=` already hits today (confirmed: both
  // report "unsupported <x> action" for an analogous malformed trailing
  // token). This pins the actual current behavior; it is not something
  // this PR fixes or should fix.
  it("fails as an unsupported action, not a decoded quoted id= (pre-existing tokenizer limitation, not fixed here)", () => {
    const result = compile('@scene s\n@sprite show id="alice bob" image=a.png position=left\n');
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.document.scenes[0]!.blocks).toHaveLength(0);
  });
});

describe("@set", () => {
  it("parses a state assignment with a binary expression", () => {
    const { document } = compileOk("@scene s\n@set timeline = timeline + 1\n");
    const block = document.scenes[0]!.blocks[0]!;
    if (block.type !== "Set") throw new Error("expected Set");
    expect(block.name).toBe("timeline");
    expect(block.expression).toEqual({
      type: "Binary",
      operator: "+",
      left: expect.objectContaining({ type: "Identifier", name: "timeline" }),
      right: expect.objectContaining({ type: "Literal", value: 1 }),
      span: expect.anything()
    });
  });
});

describe("@goto", () => {
  it("parses a bare target scene id", () => {
    const { document } = compileOk("@scene s\n@goto next\n\n@scene next\nend\n");
    const block = document.scenes[0]!.blocks[0]!;
    if (block.type !== "Goto") throw new Error("expected Goto");
    expect(block.target).toBe("next");
  });
});

describe("unknown directives", () => {
  it("reports AT1001 for an unregistered @directive at column 1", () => {
    const result = compile("@nonsense foo\n");
    expect(result.diagnostics.map((d) => d.code)).toContain("AT1001");
  });

  it("does not treat an indented @-line as a directive", () => {
    const result = compile("  @scene indented\n");
    // Not a directive: parsed as prose, and "indented" never becomes a real scene id.
    expect(result.diagnostics.map((d) => d.code)).not.toContain("AT1001");
    expect(result.document.scenes.map((s) => s.id)).not.toContain("indented");
  });
});
