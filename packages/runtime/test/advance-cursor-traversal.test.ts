import { describe, expect, it } from "vitest";
import { advance, selectChoice } from "../src/index.js";
import { freshState } from "./helpers.js";

/**
 * Regression coverage for nested structural cursor traversal — off-by-one
 * or double-advance bugs would only surface once content is spread across
 * multiple `advance()` calls at more than one nesting depth, which the
 * per-construct test files don't each individually exercise.
 */

function textOf(step: ReturnType<typeof advance>): string {
  if (step.result.type === "content" && step.result.block.type === "Paragraph") {
    return step.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
  }
  throw new Error(`expected content, got ${step.result.type}`);
}

describe("cursor traversal — Conditional containing content", () => {
  it("resumes exactly once after the matched branch's content is exhausted", () => {
    const source = ["@scene s", "@if true", "Inside.", "@end", "After."].join("\n");
    const { document, state } = freshState(source);

    const inside = advance(document, state);
    expect(textOf(inside)).toBe("Inside.");

    const after = advance(document, inside.runtimeState, inside.cursor);
    expect(textOf(after)).toBe("After.");

    // Must not resume "After." a second time, or skip straight to completed.
    const completed = advance(document, after.runtimeState, after.cursor);
    expect(completed.result).toEqual({ type: "completed" });
  });
});

describe("cursor traversal — Variant containing multiple suspensions", () => {
  it("continues through every block inside the resolved branch before returning to the parent", () => {
    const source = ["@scene s", "@variant v", "@when true", "First.", "", "Second.", "@end"].join("\n");
    const { document, state } = freshState(source);

    const first = advance(document, state);
    expect(textOf(first)).toBe("First.");

    const second = advance(document, first.runtimeState, first.cursor);
    expect(textOf(second)).toBe("Second.");

    const completed = advance(document, second.runtimeState, second.cursor);
    expect(completed.result).toEqual({ type: "completed" });
  });
});

describe("cursor traversal — nested Conditional inside Conditional", () => {
  it("pops each child frame and advances its immediate parent exactly once, two levels deep", () => {
    const source = [
      "@scene s",
      "@if true",
      "@if true",
      "Inner.",
      "@end",
      "Outer.",
      "@end",
      "After."
    ].join("\n");
    const { document, state } = freshState(source);

    const inner = advance(document, state);
    expect(textOf(inner)).toBe("Inner.");

    const outer = advance(document, inner.runtimeState, inner.cursor);
    expect(textOf(outer)).toBe("Outer.");

    const after = advance(document, outer.runtimeState, outer.cursor);
    expect(textOf(after)).toBe("After.");

    const completed = advance(document, after.runtimeState, after.cursor);
    expect(completed.result).toEqual({ type: "completed" });
  });
});

describe("cursor traversal — Goto inside a nested block", () => {
  it("discards the nested structural cursor entirely and suspends immediately", () => {
    const source = ["@scene s", "@if true", "@goto elsewhere", "@end", "@scene elsewhere", "There."].join("\n");
    const { document, state } = freshState(source);

    const navigated = advance(document, state);
    expect(navigated.result).toEqual({ type: "navigation", from: "s", to: "elsewhere" });
    expect(navigated.cursor).toEqual([]); // not left pointing inside the old nested @if frame

    const next = advance(document, navigated.runtimeState, navigated.cursor);
    expect(textOf(next)).toBe("There.");
  });
});

describe("cursor traversal — Choice inside a nested block", () => {
  it("selection navigates directly from the supplied suspension without resuming the old parent frame", () => {
    const source = [
      "@scene s",
      "@if true",
      "@choice",
      "- Go -> elsewhere",
      "@end",
      "@end",
      "@scene elsewhere",
      "There."
    ].join("\n");
    const { document, state } = freshState(source);

    const suspension = advance(document, state);
    expect(suspension.result.type).toBe("choice");

    const selected = selectChoice(document, suspension, 0);
    expect(selected.result).toEqual({ type: "navigation", from: "s", to: "elsewhere" });
    expect(selected.cursor).toEqual([]); // not left pointing inside the old nested @if frame

    const next = advance(document, selected.runtimeState, selected.cursor);
    expect(textOf(next)).toBe("There.");
  });
});
