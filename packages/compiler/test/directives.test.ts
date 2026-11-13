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

describe("@say", () => {
  function dialogueOf(source: string) {
    const { document } = compileOk(source);
    const block = document.scenes[0]!.blocks.find((b) => b.type === "Dialogue");
    if (!block || block.type !== "Dialogue") throw new Error("expected Dialogue");
    return block;
  }

  function textOf(block: ReturnType<typeof dialogueOf>): string {
    return block.content.map((c) => (c.type === "Text" ? c.value : c.type)).join("");
  }

  it("parses a single Dialogue, directly adjacent to its body", () => {
    const block = dialogueOf("@scene s\n@say speaker=Alice\nHello there.\n");
    expect(block.speaker).toBe("Alice");
    expect(textOf(block)).toBe("Hello there.");
  });

  it("parses with one leading blank line between header and body (identical result)", () => {
    const block = dialogueOf("@scene s\n@say speaker=Alice\n\nHello there.\n");
    expect(block.speaker).toBe("Alice");
    expect(textOf(block)).toBe("Hello there.");
  });

  it("parses with multiple leading blank lines between header and body", () => {
    const block = dialogueOf("@scene s\n@say speaker=Alice\n\n\n\nHello there.\n");
    expect(textOf(block)).toBe("Hello there.");
  });

  it("preserves Markdown content (emphasis/strong/inline code/links)", () => {
    const block = dialogueOf(
      "@scene s\n@say speaker=Alice\nHello *there*, **friend** — `code` and [a link](https://example.com).\n"
    );
    expect(block.content.map((c) => c.type)).toContain("Emphasis");
    expect(block.content.map((c) => c.type)).toContain("Strong");
    expect(block.content.map((c) => c.type)).toContain("InlineCode");
    expect(block.content.map((c) => c.type)).toContain("Link");
  });

  it("parses multiline content as one Paragraph (no blank line between the two lines)", () => {
    const block = dialogueOf("@scene s\n@say speaker=Alice\nHello there,\nhow are you?\n");
    expect(textOf(block)).toContain("Hello there,");
    expect(textOf(block)).toContain("how are you?");
  });

  it("preserves speaker case exactly", () => {
    expect(dialogueOf("@scene s\n@say speaker=alice\nHi.\n").speaker).toBe("alice");
    expect(dialogueOf("@scene s\n@say speaker=Alice\nHi.\n").speaker).toBe("Alice");
    expect(dialogueOf("@scene s\n@say speaker=ALICE\nHi.\n").speaker).toBe("ALICE");
  });

  it("accepts a punctuated speaker with no whitespace (Dr.Smith)", () => {
    expect(dialogueOf("@scene s\n@say speaker=Dr.Smith\nHi.\n").speaker).toBe("Dr.Smith");
  });

  it("accepts ??? and Narrator as ordinary, non-magic speaker values", () => {
    expect(dialogueOf("@scene s\n@say speaker=???\nHi.\n").speaker).toBe("???");
    expect(dialogueOf("@scene s\n@say speaker=Narrator\nHi.\n").speaker).toBe("Narrator");
  });

  it("last-occurrence-wins on a duplicate speaker= (not an error)", () => {
    const block = dialogueOf("@scene s\n@say speaker=Alice speaker=Bob\nHi.\n");
    expect(block.speaker).toBe("Bob");
  });

  it.each([
    ["@say", "missing speaker"],
    ["@say foo=bar", "missing speaker, with an unrelated token present"],
    ["@say speaker=", "empty speaker value"],
    ["@say speaker=   ", "nothing but a bare speaker= token"],
    ["@say speaker= foo=bar", "empty speaker takes precedence over the unsupported token"],
    ["@say speaker=Alice extra=value", "unsupported named parameter"],
    ["@say speaker=Alice extra", "unsupported bare token"],
    ["@say speaker=Alice Bob", "unsupported bare token after a valid speaker"],
    ["@say speaker=Dr. Smith", "unquoted multi-word speaker leaves an unsupported leftover token"],
    ['@say speaker="Dr. Smith"', "quoted multi-word speaker is not decoded (named-value quoting unsupported)"]
  ])("reports exactly one AT1301 for %s (%s) and emits no Dialogue block", (line) => {
    const result = compile(`@scene s\n${line}\nHi.\n`);
    const codes = codesOf(result.diagnostics);
    expect(codes.filter((c) => c === "AT1301")).toHaveLength(1);
    expect(result.hasErrors).toBe(true);
    expect(result.document.scenes[0]!.blocks.some((b) => b.type === "Dialogue")).toBe(false);
  });

  it("reports missing speaker, not unsupported token, for @say foo=bar (diagnostic precedence)", () => {
    const result = compile("@scene s\n@say foo=bar\nHi.\n");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.message).toContain("missing or empty speaker");
  });

  it("reports missing speaker, not unsupported token, for @say speaker= foo=bar (diagnostic precedence)", () => {
    const result = compile("@scene s\n@say speaker= foo=bar\nHi.\n");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.message).toContain("missing or empty speaker");
  });

  it("rejects a Heading body", () => {
    const result = compile("@scene s\n@say speaker=Alice\n\n# Hello\n");
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.document.scenes[0]!.blocks.some((b) => b.type === "Dialogue")).toBe(false);
  });

  it("rejects a body with 2+ blocks via a no-blank-line paragraph interruption (an ATX heading)", () => {
    const result = compile("@scene s\n@say speaker=Alice\nHello.\n# Interrupt\n");
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.document.scenes[0]!.blocks.some((b) => b.type === "Dialogue")).toBe(false);
  });

  it("reports missing content at EOF", () => {
    const result = compile("@scene s\n@say speaker=Alice\n");
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.document.scenes[0]!.blocks).toHaveLength(0);
  });

  it("reports missing content before a following directive, and does not swallow it", () => {
    const result = compile("@scene s\n@say speaker=Alice\n@background room.png\n");
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.document.scenes[0]!.blocks).toHaveLength(1);
    expect(result.document.scenes[0]!.blocks[0]!.type).toBe("Presentation");
  });

  it("reports missing content before @scene, and the next scene parses normally", () => {
    const result = compile("@scene s\n@say speaker=Alice\n@scene next\nHi.\n");
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.document.scenes[0]!.blocks).toHaveLength(0);
    expect(result.document.scenes[1]!.id).toBe("next");
    expect(result.document.scenes[1]!.blocks).toHaveLength(1);
  });

  it("a malformed header does not fall back to treating its claimed body as narration", () => {
    const result = compile("@scene s\n@say speaker=\nHello.\n");
    expect(result.document.scenes[0]!.blocks).toHaveLength(0);
  });

  it("is the critical boundary case: Dialogue immediately followed by narration in the same scene", () => {
    const { document } = compileOk("@scene s\n@say speaker=Alice\nHello.\n\nThe room goes dark.\n");
    const blocks = document.scenes[0]!.blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.type).toBe("Dialogue");
    if (blocks[0]!.type === "Dialogue") {
      expect(blocks[0]!.speaker).toBe("Alice");
      expect(textOf(blocks[0]!)).toBe("Hello.");
    }
    expect(blocks[1]!.type).toBe("Paragraph");
    if (blocks[1]!.type === "Paragraph") {
      const text = blocks[1]!.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
      expect(text).toBe("The room goes dark.");
    }
  });

  it("two consecutive Dialogue blocks parse independently", () => {
    const { document } = compileOk("@scene s\n@say speaker=Alice\nHi.\n@say speaker=Bob\nHey.\n");
    const blocks = document.scenes[0]!.blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => (b.type === "Dialogue" ? b.speaker : undefined))).toEqual(["Alice", "Bob"]);
  });

  it("@sya (unregistered typo) is not treated as Dialogue", () => {
    const result = compile("@scene s\n@sya speaker=Alice\nHi.\n");
    expect(codesOf(result.diagnostics)).toContain("AT1001");
  });

  it("a @say line inside a @choice body is dropped as AT1009, and the following bullet item is unaffected", () => {
    const result = compile("@scene s\n@choice\n@say speaker=Alice\n- Go -> s\n@end\n");
    expect(codesOf(result.diagnostics)).toContain("AT1009");
    const choice = result.document.scenes[0]!.blocks.find((b) => b.type === "Choice");
    if (!choice || choice.type !== "Choice") throw new Error("expected Choice");
    expect(choice.items).toHaveLength(1);
    expect(choice.items[0]!.target).toBe("s");
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
