import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

describe("Paragraph / Heading — content suspension", () => {
  it("suspends on a Paragraph", () => {
    const { document, state } = freshState("@scene s\nHello.\n");
    const step = advance(document, state);
    expect(step.result.type).toBe("content");
    if (step.result.type === "content") expect(step.result.block.type).toBe("Paragraph");
  });

  it("suspends on a Heading", () => {
    const { document, state } = freshState("@scene s\n# Title\n");
    const step = advance(document, state);
    expect(step.result.type).toBe("content");
    if (step.result.type === "content") expect(step.result.block.type).toBe("Heading");
  });

  it("the next advance() resumes after the content, at the next block", () => {
    const { document, state } = freshState("@scene s\nFirst.\n\nSecond.\n");
    const first = advance(document, state);
    const second = advance(document, first.runtimeState, first.cursor);

    expect(second.result.type).toBe("content");
    if (first.result.type === "content" && second.result.type === "content") {
      const firstText = first.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
      const secondText = second.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
      expect(firstText).toBe("First.");
      expect(secondText).toBe("Second.");
    }
  });

  it("consumes no step budget — a budget of 0 still reaches the first paragraph", () => {
    const { document, state } = freshState("@scene s\nHello.\n");
    const step = advance(document, state, undefined, { stepBudget: 0 });
    expect(step.result.type).toBe("content");
  });
});

describe("Presentation — presentation suspension", () => {
  it("suspends on a Presentation, forwarding the normalized command as-is", () => {
    const { document, state } = freshState("@scene s\n@background room.jpg\n");
    const step = advance(document, state);
    expect(step.result).toEqual({
      type: "presentation",
      command: { type: "Background", image: "room.jpg" }
    });
  });

  it("the next advance() resumes after the presentation command", () => {
    const { document, state } = freshState("@scene s\n@background room.jpg\nHi.\n");
    const first = advance(document, state);
    const second = advance(document, first.runtimeState, first.cursor);
    expect(second.result.type).toBe("content");
  });

  it("consumes no step budget", () => {
    const { document, state } = freshState("@scene s\n@background room.jpg\n");
    const step = advance(document, state, undefined, { stepBudget: 0 });
    expect(step.result.type).toBe("presentation");
  });
});
