import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

describe("@set — automatic execution", () => {
  it("continues automatically, without suspending, into whatever follows", () => {
    const { document, state } = freshState("@scene s\n@set a = 1\nHi.\n");
    const step = advance(document, state);
    expect(step.result).toEqual({
      type: "content",
      block: expect.objectContaining({ type: "Paragraph" })
    });
    expect(step.runtimeState.story).toEqual({ a: 1 });
  });

  it("progresses multiple Set operations within a single advance() call", () => {
    const { document, state } = freshState("@scene s\n@set a = 1\n@set b = 2\nHi.\n");
    const step = advance(document, state);
    expect(step.runtimeState.story).toEqual({ a: 1, b: 2 });
    expect(step.result.type).toBe("content");
  });

  it("creates a previously undeclared variable", () => {
    const { document, state } = freshState("@scene s\n@set brand_new = true\nHi.\n");
    const step = advance(document, state);
    expect(step.runtimeState.story).toEqual({ brand_new: true });
  });
});

describe("progressive, non-transactional execution (docs/CORE_SPEC.md Section 17.11)", () => {
  it("keeps earlier successful Sets when a later Set in the same call fails", () => {
    const { document, state } = freshState("@scene s\n@set a = 1\n@set b = 2\n@set c = 10 / 0\nHi.\n");
    const step = advance(document, state);

    expect(step.result.type).toBe("error");
    if (step.result.type === "error") {
      expect(step.result.error.kind).toBe("division-by-zero");
    }
    // a and b remain; c was never set — the failing operation leaves no
    // partial effect, but nothing already-completed is rolled back.
    expect(step.runtimeState.story).toEqual({ a: 1, b: 2 });
  });

  it("the failing operation itself contributes no value to StoryState", () => {
    const { document, state } = freshState("@scene s\n@set c = 10 / 0\nHi.\n");
    const step = advance(document, state);
    expect(step.result.type).toBe("error");
    expect(step.runtimeState.story).toEqual({});
    expect("c" in step.runtimeState.story).toBe(false);
  });

  it("does not mutate the RuntimeState passed in", () => {
    const { document, state } = freshState("@scene s\n@set a = 1\nHi.\n");
    const before = JSON.parse(JSON.stringify(state));
    advance(document, state);
    expect(state).toEqual(before);
  });

  it("does not mutate the cursor passed in — a returned cursor can be replayed from safely", () => {
    const { document, state } = freshState("@scene s\nFirst.\n\nSecond.\n");
    const first = advance(document, state);
    const cursorBefore = JSON.parse(JSON.stringify(first.cursor));

    // Calling advance() twice from the same starting cursor must be safe
    // and must produce identical results both times.
    const second = advance(document, first.runtimeState, first.cursor);
    const secondReplayed = advance(document, first.runtimeState, first.cursor);

    expect(first.cursor).toEqual(cursorBefore);
    expect(second.result).toEqual(secondReplayed.result);
  });
});
