import { describe, expect, it } from "vitest";
import type { DialogueNode, StoryBlock } from "../src/ast/story.js";
import { compileOk } from "./helpers.js";

function dialogueOf(source: string): DialogueNode {
  const document = compileOk(source).document;
  const block = document.scenes[0]!.blocks.find((b) => b.type === "Dialogue");
  if (!block || block.type !== "Dialogue") throw new Error("expected Dialogue");
  return block;
}

function speakerSlice(source: string, node: DialogueNode): string {
  return source.slice(node.speakerSourceSpan.start.offset, node.speakerSourceSpan.end.offset);
}

function contentSlice(source: string, node: DialogueNode): string {
  return source.slice(node.contentSourceSpan.start.offset, node.contentSourceSpan.end.offset);
}

function wholeSlice(source: string, node: DialogueNode): string {
  return source.slice(node.span.start.offset, node.span.end.offset);
}

function dialoguesIn(blocks: readonly StoryBlock[]): DialogueNode[] {
  return blocks.flatMap((block): DialogueNode[] => {
    if (block.type === "Dialogue") return [block];
    if (block.type === "Conditional" || block.type === "Variant") {
      return block.branches.flatMap((branch) => dialoguesIn(branch.blocks));
    }
    return [];
  });
}

describe("DialogueNode speakerSourceSpan / contentSourceSpan / span", () => {
  it("covers the speaker value exactly, excluding speaker= and surrounding whitespace", () => {
    const source = "@scene s\n@say speaker=Alice\nHello.\n";
    const node = dialogueOf(source);
    expect(speakerSlice(source, node)).toBe("Alice");
    expect(node.speakerSourceSpan.start).toEqual({ line: 2, column: 14, offset: 22 });
    expect(node.speakerSourceSpan.end).toEqual({ line: 2, column: 19, offset: 27 });
  });

  it("covers the content body exactly, directly adjacent to the header", () => {
    const source = "@scene s\n@say speaker=Alice\nHello.\n";
    const node = dialogueOf(source);
    expect(contentSlice(source, node)).toBe("Hello.");
    expect(wholeSlice(source, node)).toBe("@say speaker=Alice\nHello.");
  });

  it("span is contiguous and includes a leading blank line between header and body, while contentSourceSpan excludes it", () => {
    const source = "@scene s\n@say speaker=Alice\n\nHello.\n";
    const node = dialogueOf(source);
    expect(contentSlice(source, node)).toBe("Hello.");
    expect(wholeSlice(source, node)).toBe("@say speaker=Alice\n\nHello.");
  });

  it("span never includes the terminating blank line that ends the body", () => {
    const source = "@scene s\n@say speaker=Alice\nHello.\n\nThe room goes dark.\n";
    const node = dialogueOf(source);
    expect(wholeSlice(source, node)).toBe("@say speaker=Alice\nHello.");
    expect(wholeSlice(source, node)).not.toContain("room");
  });

  it("contentSourceSpan preserves inline Markdown source spans unmodified", () => {
    const source = "@scene s\n@say speaker=Alice\nHello *there*.\n";
    const node = dialogueOf(source);
    expect(contentSlice(source, node)).toBe("Hello *there*.");
    const emphasis = node.content.find((c) => c.type === "Emphasis");
    if (!emphasis || emphasis.type !== "Emphasis") throw new Error("expected Emphasis");
    expect(source.slice(emphasis.span.start.offset, emphasis.span.end.offset)).toBe("*there*");
  });

  it("duplicate speaker= uses the LAST occurrence's value and span, not the first", () => {
    const source = "@scene s\n@say speaker=Alice speaker=Bob\nHi.\n";
    const node = dialogueOf(source);
    expect(node.speaker).toBe("Bob");
    expect(speakerSlice(source, node)).toBe("Bob");
    // The first occurrence's text never appears in the resolved span.
    const firstOccurrenceOffset = source.indexOf("Alice");
    expect(node.speakerSourceSpan.start.offset).toBeGreaterThan(firstOccurrenceOffset);
  });

  it.each([
    ["@scene s\n@say speaker=Dr.Smith\nHi.\n", "Dr.Smith"],
    ["@scene s\n@say speaker=???\nHi.\n", "???"],
    ["@scene s\n@say speaker=alice\nHi.\n", "alice"]
  ])("covers punctuated/lowercase speaker values exactly in %j", (source, speaker) => {
    const node = dialogueOf(source);
    expect(speakerSlice(source, node)).toBe(speaker);
  });

  it("holds identically under CRLF source", () => {
    const source = ["@scene s", "@say speaker=Alice", "Hello."].join("\r\n") + "\r\n";
    const node = dialogueOf(source);
    expect(speakerSlice(source, node)).toBe("Alice");
    expect(contentSlice(source, node)).toBe("Hello.");
    expect(wholeSlice(source, node)).toBe("@say speaker=Alice\r\nHello.");
  });

  it("holds identically under CRLF source with a leading blank line", () => {
    const source = ["@scene s", "@say speaker=Alice", "", "Hello."].join("\r\n") + "\r\n";
    const node = dialogueOf(source);
    expect(contentSlice(source, node)).toBe("Hello.");
    expect(wholeSlice(source, node)).toBe("@say speaker=Alice\r\n\r\nHello.");
  });

  it("locates a Dialogue nested inside a Conditional branch", () => {
    const source = "@scene s\n@if true\n@say speaker=Alice\nHi.\n@end\n";
    const document = compileOk(source).document;
    const nodes = dialoguesIn(document.scenes[0]!.blocks);
    expect(nodes).toHaveLength(1);
    expect(speakerSlice(source, nodes[0]!)).toBe("Alice");
  });
});
