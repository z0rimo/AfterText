import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

describe("completed (docs/CORE_SPEC.md Section 17.6)", () => {
  it("a completely empty document produces completed immediately", () => {
    const { document, state } = freshState("");
    const step = advance(document, state);
    expect(step.result).toEqual({ type: "completed" });
  });

  it("reaching the natural end of a scene's blocks (plain prose, no further navigation) produces completed", () => {
    const { document, state } = freshState("@scene s\nThe end.\n");
    const first = advance(document, state); // content: "The end."
    const second = advance(document, first.runtimeState, first.cursor);
    expect(second.result).toEqual({ type: "completed" });
  });

  it("completed after exhausting a matched Conditional branch's content", () => {
    const source = ["@scene s", "@if true", "Only this.", "@end"].join("\n");
    const { document, state } = freshState(source);
    const first = advance(document, state);
    const second = advance(document, first.runtimeState, first.cursor);
    expect(second.result).toEqual({ type: "completed" });
  });

  it("completed is not an error", () => {
    const { document, state } = freshState("");
    const step = advance(document, state);
    expect(step.result.type).not.toBe("error");
  });

  it("consumes no step budget", () => {
    const { document, state } = freshState("");
    const step = advance(document, state, undefined, { stepBudget: 0 });
    expect(step.result).toEqual({ type: "completed" });
  });
});
