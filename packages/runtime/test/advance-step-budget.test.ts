import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

describe("step budget (docs/CORE_SPEC.md Section 17.12)", () => {
  it("a single @set consumes exactly one charge", () => {
    const { document, state } = freshState("@scene s\n@set a = 1\nHi.\n");

    const insufficient = advance(document, state, undefined, { stepBudget: 0 });
    expect(insufficient.result.type).toBe("error");
    if (insufficient.result.type === "error") expect(insufficient.result.error.kind).toBe("step-limit-exceeded");
    expect(insufficient.runtimeState.story).toEqual({}); // the charge check happens before the Set runs at all

    const sufficient = advance(document, state, undefined, { stepBudget: 1 });
    expect(sufficient.result.type).toBe("content");
    expect(sufficient.runtimeState.story).toEqual({ a: 1 });
  });

  it("exhaustion happens exactly before the next chargeable operation begins, preserving everything completed so far", () => {
    const { document, state } = freshState("@scene s\n@set a = 1\n@set b = 2\n@set c = 3\nHi.\n");
    const step = advance(document, state, undefined, { stepBudget: 2 });

    expect(step.result.type).toBe("error");
    if (step.result.type === "error") expect(step.result.error.kind).toBe("step-limit-exceeded");
    // a and b completed (2 charges); c never began.
    expect(step.runtimeState.story).toEqual({ a: 1, b: 2 });
  });

  it("content/presentation/choice/navigation never charge the budget merely by suspending", () => {
    const scenes = [
      "@scene content_scene",
      "Hi.",
      "",
      "@scene presentation_scene",
      "@background room.jpg",
      "",
      "@scene choice_scene",
      "@choice",
      "- Go -> content_scene",
      "@end",
      "",
      "@scene goto_scene",
      "@goto content_scene"
    ].join("\n");

    for (const sceneId of ["content_scene", "presentation_scene", "choice_scene", "goto_scene"]) {
      const { document, state } = freshState(scenes);
      const step = advance(document, { ...state, navigation: { sceneId } }, undefined, { stepBudget: 0 });
      expect(step.result.type).not.toBe("error");
    }
  });

  it("the next external advance() call receives a fresh budget and can resume a call that previously ran out", () => {
    const { document, state } = freshState("@scene s\n@set a = 1\n@set b = 2\n@set c = 3\nHi.\n");
    const exhausted = advance(document, state, undefined, { stepBudget: 2 });
    expect(exhausted.result.type).toBe("error");

    // Resume from exactly where it stopped, with a fresh (larger) budget.
    const resumed = advance(document, exhausted.runtimeState, exhausted.cursor, { stepBudget: 10 });
    expect(resumed.result.type).toBe("content");
    expect(resumed.runtimeState.story).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("the budget resets between two separate advance() calls even without an explicit override", () => {
    const { document, state } = freshState("@scene s\n@set a = 1\nHi.\n\nSecond.\n");
    const first = advance(document, state); // default budget, one @set, then content
    const second = advance(document, first.runtimeState, first.cursor); // fresh default budget
    expect(second.result.type).toBe("content");
  });

  it("exhaustion right before branch descent leaves the Conditional itself unexecuted, and resuming completes it", () => {
    const source = ["@scene s", "@if true", "Inside.", "@end"].join("\n");
    const { document, state } = freshState(source);

    // Budget 1: the selection charge succeeds, the descent charge cannot.
    const exhausted = advance(document, state, undefined, { stepBudget: 1 });
    expect(exhausted.result.type).toBe("error");
    if (exhausted.result.type === "error") expect(exhausted.result.error.kind).toBe("step-limit-exceeded");

    // Resuming from that exact point with a fresh budget re-selects the
    // same (deterministic) branch and completes the descent — nothing was
    // skipped, and nothing was double-applied.
    const resumed = advance(document, exhausted.runtimeState, exhausted.cursor, { stepBudget: 10 });
    expect(resumed.result.type).toBe("content");
  });
});
