import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

/**
 * Confirms a generated Paragraph (the fixed placeholder "New paragraph",
 * separated from a predecessor Paragraph by exactly one blank line)
 * behaves under real `advance()` exactly like ordinary authored Paragraph
 * content — no Runtime change is involved. The exact source shape below is
 * the shape a source-generating tool produces.
 */
describe("Paragraph StoryBlock Insertion — generated-content Runtime regression", () => {
  it("the canonical generated Paragraph suspends and resumes exactly like ordinary authored Paragraph content, with no suspension lost or duplicated", () => {
    const { document, state } = freshState("@scene s\nExisting paragraph.\n\nNew paragraph\n");

    const first = advance(document, state);
    expect(first.result.type).toBe("content");
    if (first.result.type !== "content") throw new Error("expected content");
    expect(first.result.block.type).toBe("Paragraph");
    const firstText = first.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
    expect(firstText).toBe("Existing paragraph.");

    const second = advance(document, first.runtimeState, first.cursor);
    expect(second.result.type).toBe("content");
    if (second.result.type !== "content") throw new Error("expected content");
    expect(second.result.block.type).toBe("Paragraph");
    const secondText = second.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
    expect(secondText).toBe("New paragraph");

    const third = advance(document, second.runtimeState, second.cursor);
    expect(third.result.type).not.toBe("content");
  });

  it("a Paragraph generated directly after a directive-backed predecessor (single-EOL separator) suspends identically to authored content", () => {
    const { document, state } = freshState('@scene s\n@background room.jpg\nNew paragraph\n');

    const first = advance(document, state);
    expect(first.result).toEqual({
      type: "presentation",
      command: { type: "Background", image: "room.jpg" }
    });

    const second = advance(document, first.runtimeState, first.cursor);
    expect(second.result.type).toBe("content");
    if (second.result.type !== "content") throw new Error("expected content");
    expect(second.result.block.type).toBe("Paragraph");
    const text = second.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
    expect(text).toBe("New paragraph");
  });
});
