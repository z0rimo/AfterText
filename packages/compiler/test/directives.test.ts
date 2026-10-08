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
    ["@pause 2s", { type: "Pause", durationMs: 2000 }]
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
    ["@music rain.mp3 volume=loud", "non-numeric volume"]
  ])("reports AT1301 for %s (%s)", (line) => {
    const result = compile(`@scene s\n${line}\n`);
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.hasErrors).toBe(true);
    // Malformed presentation directives are dropped rather than emitting a
    // node with placeholder values.
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
