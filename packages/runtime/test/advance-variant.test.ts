import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

const ALICE_STATUS = [
  "@scene s",
  "@variant alice-status",
  "@when timeline == 0",
  "She died that night.",
  "@when timeline == 1",
  "She disappeared that night.",
  "@otherwise",
  "Nothing happened.",
  "@end"
].join("\n");

function textOf(step: ReturnType<typeof advance>): string {
  if (step.result.type === "content" && step.result.block.type === "Paragraph") {
    return step.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
  }
  throw new Error(`expected content, got ${step.result.type}`);
}

describe("Variant", () => {
  it("resolves the matching @when branch inline", () => {
    const { document, state } = freshState(ALICE_STATUS);
    const step = advance(document, { ...state, story: { timeline: 0 } });
    expect(textOf(step)).toBe("She died that night.");
  });

  it("falls back to @otherwise when no @when matches", () => {
    const { document, state } = freshState(ALICE_STATUS);
    const step = advance(document, { ...state, story: { timeline: 99 } });
    expect(textOf(step)).toBe("Nothing happened.");
  });

  it("no match and no @otherwise contributes nothing — execution continues past it", () => {
    const source = ["@scene s", "@variant only-when", "@when timeline == 0", "Never.", "@end", "After."].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, { ...state, story: { timeline: 99 } });
    expect(textOf(step)).toBe("After.");
  });

  it("records both the scene visit and the Variant-seen exposure on the branch's first content", () => {
    // Resolution alone (docs/CORE_SPEC.md Section 17.9) never records
    // anything; it's the branch's own first observable result — here also
    // scene "s"'s first observable result — that does.
    const { document, state } = freshState(ALICE_STATUS);
    const step = advance(document, { ...state, story: { timeline: 0 } });
    expect(step.runtimeState.reader).toEqual({
      visitedScenes: { s: { visitCount: 1 } },
      seenVariants: { "alice-status": { firstSeenBranchId: "alice-status:0", lastSeenBranchId: "alice-status:0", seenCount: 1 } }
    });
  });

  describe("step-budget cost", () => {
    it("a resolved branch costs exactly 2 (resolution + descent)", () => {
      const { document, state } = freshState(ALICE_STATUS);
      const runtimeState = { ...state, story: { timeline: 0 } };

      const insufficient = advance(document, runtimeState, undefined, { stepBudget: 1 });
      expect(insufficient.result.type).toBe("error");
      if (insufficient.result.type === "error") expect(insufficient.result.error.kind).toBe("step-limit-exceeded");

      const sufficient = advance(document, runtimeState, undefined, { stepBudget: 2 });
      expect(sufficient.result.type).toBe("content");
    });

    it("no match costs exactly 1 (resolution only, no descent)", () => {
      const source = ["@scene s", "@variant only-when", "@when timeline == 0", "Never.", "@end", "After."].join(
        "\n"
      );
      const { document, state } = freshState(source);
      const runtimeState = { ...state, story: { timeline: 99 } };

      const insufficient = advance(document, runtimeState, undefined, { stepBudget: 0 });
      expect(insufficient.result.type).toBe("error");
      if (insufficient.result.type === "error") expect(insufficient.result.error.kind).toBe("step-limit-exceeded");

      const sufficient = advance(document, runtimeState, undefined, { stepBudget: 1 });
      expect(sufficient.result.type).toBe("content");
    });
  });
});
