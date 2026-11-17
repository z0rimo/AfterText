import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import type { ExecutionCursor } from "../src/index.js";
import { freshState } from "./helpers.js";

function sceneIdOf(cursor: ExecutionCursor): string | undefined {
  const scene = cursor[0];
  return scene?.kind === "scene" ? scene.sceneId : undefined;
}

/**
 * Core structural-cursor shape tests (docs/CORE_SPEC.md Section 33.4): a
 * live `ExecutionCursor` must never carry a `StoryBlock[]` or any other
 * AST object reference at any depth, regardless of nesting — only
 * `kind`/identity/`index`/exposure-flag data. See `cursor-position.test.ts`
 * for the companion proof that this also holds across a fresh recompile.
 */

describe("structural cursor shape — no AST references at any depth", () => {
  it("scene-only position carries sceneId/index/visitRecorded, never blocks", () => {
    const { document, state } = freshState("@scene s\nHi.\n");
    const step = advance(document, state);
    expect(step.cursor).toEqual([{ kind: "scene", sceneId: "s", index: 1, visitRecorded: true }]);
  });

  it("a Conditional frame carries only a positional branchIndex, never blocks", () => {
    const source = ["@scene s", "@if true", "Inside.", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.cursor).toEqual([
      { kind: "scene", sceneId: "s", index: 0, visitRecorded: true },
      { kind: "conditional", branchIndex: 0, index: 1 }
    ]);
  });

  it("a Variant frame carries variantId/branchId, never blocks", () => {
    const source = ["@scene s", "@variant mood", "@when true", "Inside.", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.cursor).toEqual([
      { kind: "scene", sceneId: "s", index: 0, visitRecorded: true },
      { kind: "variant", variantId: "mood", branchId: "mood:0", index: 1, seenRecorded: true }
    ]);
  });

  it("Conditional inside Variant nests both frame kinds structurally", () => {
    const source = ["@scene s", "@variant mood", "@when true", "@if true", "Inside.", "@end", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.cursor).toEqual([
      { kind: "scene", sceneId: "s", index: 0, visitRecorded: true },
      { kind: "variant", variantId: "mood", branchId: "mood:0", index: 0, seenRecorded: true },
      { kind: "conditional", branchIndex: 0, index: 1 }
    ]);
  });

  it("Variant inside Conditional nests both frame kinds structurally", () => {
    const source = ["@scene s", "@if true", "@variant mood", "@when true", "Inside.", "@end", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.cursor).toEqual([
      { kind: "scene", sceneId: "s", index: 0, visitRecorded: true },
      { kind: "conditional", branchIndex: 0, index: 0 },
      { kind: "variant", variantId: "mood", branchId: "mood:0", index: 1, seenRecorded: true }
    ]);
  });

  it("multiple nested levels never carry a blocks array at any depth", () => {
    const source = ["@scene s", "@if true", "@variant outer", "@when true", "@if true", "Deep.", "@end", "@end", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.cursor).toHaveLength(4);
    for (const frame of step.cursor) {
      expect(frame).not.toHaveProperty("blocks");
    }
  });
});

/**
 * Every `ExecutionStep` `advance()`/`navigateTo`/`selectChoice` returns
 * satisfies `cursor[0].sceneId === runtimeState.navigation.sceneId` by
 * construction (docs/CORE_SPEC.md Section 33.4): scene-frame bootstrap
 * derives `sceneId` from the exact `document.scenes.find` match against
 * `runtimeState.navigation.sceneId`, `commit()` always carries the input
 * `runtimeState.navigation` through unchanged, and `navigateTo` changes
 * `navigation.sceneId` and resets the cursor to empty in the same step —
 * so the two fields can never be independently mutated into disagreement
 * through any supported public Runtime operation. A caller that manually
 * cross-pairs a `runtimeState` and `cursor` from two unrelated
 * `ExecutionStep`s is outside this contract (the cursor has always been
 * documented as opaque data to pass back exactly as received, Section
 * 17.13) and is not something Runtime detects or repairs.
 */
describe("scene identity consistency — cursor[0].sceneId always matches runtimeState.navigation.sceneId", () => {
  it("holds across scene entry, nested descent, navigation, and re-entry", () => {
    const source = [
      "@scene s",
      "@if true",
      "@variant mood",
      "@when true",
      "Hi.",
      "@end",
      "@end",
      "@goto t",
      "",
      "@scene t",
      "There."
    ].join("\n");
    const { document, state } = freshState(source);

    const entered = advance(document, state);
    expect(sceneIdOf(entered.cursor)).toBe(entered.runtimeState.navigation.sceneId);

    const navigated = advance(document, entered.runtimeState, entered.cursor);
    expect(navigated.result.type).toBe("navigation");
    expect(navigated.cursor).toEqual([]); // no scene frame left to disagree with navigation

    const reentered = advance(document, navigated.runtimeState, navigated.cursor);
    expect(sceneIdOf(reentered.cursor)).toBe(reentered.runtimeState.navigation.sceneId);
  });

  it("holds across a progressive-error suspension and its retry", () => {
    const source = ["---", "state:", "  divisor: 0", "---", "@scene s", "@set a = 10 / divisor", "Hi."].join("\n");
    const { document, state } = freshState(source);
    const failed = advance(document, state);
    expect(failed.result.type).toBe("error");
    expect(sceneIdOf(failed.cursor)).toBe(failed.runtimeState.navigation.sceneId);

    const retried = advance(document, { ...failed.runtimeState, story: { divisor: 1 } }, failed.cursor);
    expect(sceneIdOf(retried.cursor)).toBe(retried.runtimeState.navigation.sceneId);
  });
});
