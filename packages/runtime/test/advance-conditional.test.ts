import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

describe("Conditional", () => {
  it("executes the true branch inline, automatically", () => {
    const source = ["@scene s", "@if true", "Branch text.", "@end", "After."].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.result.type).toBe("content");
    if (step.result.type === "content" && step.result.block.type === "Paragraph") {
      const text = step.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
      expect(text).toBe("Branch text.");
    }
  });

  it("skips a false branch and takes the next one", () => {
    const source = ["@scene s", "@if false", "First.", "@elseif true", "Second.", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    if (step.result.type === "content" && step.result.block.type === "Paragraph") {
      const text = step.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
      expect(text).toBe("Second.");
    } else {
      throw new Error("expected content");
    }
  });

  it("no match and no @else contributes nothing — execution continues past it", () => {
    const source = ["@scene s", "@if false", "Never.", "@end", "After."].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.result.type).toBe("content");
    if (step.result.type === "content" && step.result.block.type === "Paragraph") {
      const text = step.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
      expect(text).toBe("After.");
    }
  });

  it("a non-boolean condition is a runtime error", () => {
    const source = ["@scene s", "@if timeline", "Text.", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, { ...state, story: { timeline: 1 } });
    expect(step.result.type).toBe("error");
    if (step.result.type === "error") expect(step.result.error.kind).toBe("type-mismatch");
  });

  describe("step-budget cost", () => {
    it("a matched branch costs exactly 2 (selection + descent)", () => {
      const source = ["@scene s", "@if true", "Inside.", "@end"].join("\n");
      const { document, state } = freshState(source);

      const insufficient = advance(document, state, undefined, { stepBudget: 1 });
      expect(insufficient.result.type).toBe("error");
      if (insufficient.result.type === "error") expect(insufficient.result.error.kind).toBe("step-limit-exceeded");

      const sufficient = advance(document, state, undefined, { stepBudget: 2 });
      expect(sufficient.result.type).toBe("content");
    });

    it("no match costs exactly 1 (selection only, no descent)", () => {
      const source = ["@scene s", "@if false", "Never.", "@end", "After."].join("\n");
      const { document, state } = freshState(source);

      const insufficient = advance(document, state, undefined, { stepBudget: 0 });
      expect(insufficient.result.type).toBe("error");
      if (insufficient.result.type === "error") expect(insufficient.result.error.kind).toBe("step-limit-exceeded");

      const sufficient = advance(document, state, undefined, { stepBudget: 1 });
      expect(sufficient.result.type).toBe("content");
    });
  });
});
