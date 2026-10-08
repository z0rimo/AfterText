import { describe, expect, it } from "vitest";
import { advance, type StoryValue } from "../src/index.js";
import { freshState } from "./helpers.js";

/**
 * docs/CORE_SPEC.md Section 25.51 (Conditional Branch Source Metadata and
 * Ordering) — each Runtime case compiles the exact "before" and "after"
 * source that a narrow condition, Add, Remove, or reorder patch produces,
 * then asserts the presented branch under real `advance()`. No Runtime
 * change is involved.
 */

function presentedText(source: string, story?: Record<string, StoryValue>): string | undefined {
  const { document, state } = freshState(source);
  const withStory = story === undefined ? state : { ...state, story: { ...state.story, ...story } };
  const step = advance(document, withStory);
  if (step.result.type !== "content" || step.result.block.type !== "Paragraph") return undefined;
  return step.result.block.children.map((child) => (child.type === "Text" ? child.value : "")).join("");
}

describe("Conditional Branch Structured Editing — Runtime execution of edited sources", () => {
  it("an edited @if condition changes the selected branch", () => {
    expect(presentedText("@scene s\n@if false\nA.\n@else\nB.\n@end")).toBe("B.");
    expect(presentedText("@scene s\n@if true\nA.\n@else\nB.\n@end")).toBe("A.");
  });

  it("an edited @elseif condition changes which branch is selected", () => {
    expect(presentedText("@scene s\n@if false\nA.\n@elseif false\nB.\n@else\nC.\n@end")).toBe("C.");
    expect(presentedText("@scene s\n@if false\nA.\n@elseif true\nB.\n@else\nC.\n@end")).toBe("B.");
  });

  it("an added @elseif participates in selection", () => {
    expect(presentedText("@scene s\n@if false\nA.\n@else\nC.\n@end")).toBe("C.");
    expect(presentedText("@scene s\n@if false\nA.\n@elseif true\nB.\n@else\nC.\n@end")).toBe("B.");
  });

  it("an added @else becomes the fallback when nothing else matches", () => {
    expect(presentedText("@scene s\n@if false\nA.\n@end\nAfter.")).toBe("After.");
    expect(presentedText("@scene s\n@if false\nA.\n@else\nC.\n@end\nAfter.")).toBe("C.");
  });

  it("a removed @elseif no longer participates in selection", () => {
    expect(presentedText("@scene s\n@if false\nA.\n@elseif true\nB.\n@end\nAfter.")).toBe("B.");
    expect(presentedText("@scene s\n@if false\nA.\n@end\nAfter.")).toBe("After.");
  });

  it("a removed @else removes the fallback", () => {
    expect(presentedText("@scene s\n@if false\nA.\n@else\nC.\n@end\nAfter.")).toBe("C.");
    expect(presentedText("@scene s\n@if false\nA.\n@end\nAfter.")).toBe("After.");
  });

  it("a reordered @elseif changes first-match behavior when both conditions can match", () => {
    const before = "@scene s\n@if false\nA.\n@elseif timeline == 1\nB.\n@elseif true\nC.\n@end";
    const after = "@scene s\n@if false\nA.\n@elseif true\nC.\n@elseif timeline == 1\nB.\n@end";
    expect(presentedText(before, { timeline: 1 })).toBe("B.");
    expect(presentedText(after, { timeline: 1 })).toBe("C.");
  });
});
