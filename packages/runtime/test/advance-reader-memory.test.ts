import { describe, expect, it } from "vitest";
import { advance, selectChoice } from "../src/index.js";
import type { ExecutionStep, RuntimeState } from "../src/index.js";
import { freshState } from "./helpers.js";

/**
 * Reader Memory integration (docs/CORE_SPEC.md Section 17.9): coverage
 * for exactly when `recordSceneVisit`/`recordVariantSeen` fire inside
 * `advance()`, and — critically — when they must NOT, including across
 * progressive errors and step-budget exhaustion that separate a
 * scene-entry/Variant-resolution from its first qualifying result.
 */

function textOf(step: ExecutionStep): string {
  if (step.result.type === "content" && step.result.block.type === "Paragraph") {
    return step.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
  }
  throw new Error(`expected content, got ${step.result.type}`);
}

function withStory(runtimeState: RuntimeState, story: Record<string, unknown>): RuntimeState {
  return { ...runtimeState, story: story as RuntimeState["story"] };
}

describe("Reader Memory — Scene visit", () => {
  it("first content in a fresh scene records visit count 1", () => {
    const { document, state } = freshState("@scene s\nHi.\n");
    const step = advance(document, state);
    expect(step.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
  });

  it("Presentation as the first observable result records visit", () => {
    const { document, state } = freshState("@scene s\n@background room.jpg\n");
    const step = advance(document, state);
    expect(step.result.type).toBe("presentation");
    expect(step.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
  });

  it("Choice as the first observable result records visit", () => {
    const { document, state } = freshState(["@scene s", "@choice", "- Go -> s", "@end"].join("\n"));
    const step = advance(document, state);
    expect(step.result.type).toBe("choice");
    expect(step.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
  });

  it("an empty scene reaching completed records visit", () => {
    const { document, state } = freshState("");
    const step = advance(document, state);
    expect(step.result).toEqual({ type: "completed" });
    expect(step.runtimeState.reader.visitedScenes).toEqual({ main: { visitCount: 1 } });
  });

  it("a scene whose first block is @goto does not record visit", () => {
    const source = ["@scene s", "@goto t", "@scene t", "Hi."].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.result.type).toBe("navigation");
    expect(step.runtimeState.reader.visitedScenes).toEqual({});
  });

  it("automatic Set/Conditional/Variant work before the first content still records once, on arrival", () => {
    const source = ["@scene s", "@set a = 1", "@if a == 1", "Hi.", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(textOf(step)).toBe("Hi.");
    expect(step.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
  });

  it("multiple observable results within the same entry episode do not increment repeatedly", () => {
    const { document, state } = freshState("@scene s\nFirst.\n\nSecond.\n");
    const first = advance(document, state);
    expect(first.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });

    const second = advance(document, first.runtimeState, first.cursor);
    expect(textOf(second)).toBe("Second.");
    expect(second.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
  });

  it("leaving and later genuinely re-entering the same scene increments its visit count again", () => {
    const source = ["@scene s", "Hello from s.", "@goto t", "@scene t", "Hello from t.", "@goto s"].join("\n");
    const { document, state } = freshState(source);

    const firstS = advance(document, state);
    expect(textOf(firstS)).toBe("Hello from s.");
    expect(firstS.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });

    const toT = advance(document, firstS.runtimeState, firstS.cursor);
    expect(toT.result).toEqual({ type: "navigation", from: "s", to: "t" });

    const firstT = advance(document, toT.runtimeState, toT.cursor);
    expect(textOf(firstT)).toBe("Hello from t.");
    expect(firstT.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 }, t: { visitCount: 1 } });

    const backToS = advance(document, firstT.runtimeState, firstT.cursor);
    expect(backToS.result).toEqual({ type: "navigation", from: "t", to: "s" });

    const secondS = advance(document, backToS.runtimeState, backToS.cursor);
    expect(textOf(secondS)).toBe("Hello from s.");
    expect(secondS.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 2 }, t: { visitCount: 1 } });
  });

  it("a runtime error before the first observable result does not record a visit", () => {
    const source = ["---", "state:", "  divisor: 0", "---", "@scene s", "@set a = 10 / divisor", "Hi."].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.result.type).toBe("error");
    expect(step.runtimeState.reader.visitedScenes).toEqual({});
  });

  it("a later retry/resume from that error's cursor can still record correctly once it succeeds", () => {
    const source = ["---", "state:", "  divisor: 0", "---", "@scene s", "@set a = 10 / divisor", "Hi."].join("\n");
    const { document, state } = freshState(source);
    const failed = advance(document, state);
    expect(failed.result.type).toBe("error");

    const retried = advance(document, withStory(failed.runtimeState, { divisor: 1 }), failed.cursor);
    expect(textOf(retried)).toBe("Hi.");
    expect(retried.runtimeState.story).toEqual({ divisor: 1, a: 10 });
    expect(retried.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
  });

  it("step-budget exhaustion before the first observable result does not record a visit", () => {
    const source = ["@scene s", "@set a = 1", "@set b = 2", "Hi."].join("\n");
    const { document, state } = freshState(source);
    const exhausted = advance(document, state, undefined, { stepBudget: 1 });
    expect(exhausted.result.type).toBe("error");
    expect(exhausted.runtimeState.reader.visitedScenes).toEqual({});
  });

  it("a resumed call after budget exhaustion can still record correctly once it succeeds", () => {
    const source = ["@scene s", "@set a = 1", "@set b = 2", "Hi."].join("\n");
    const { document, state } = freshState(source);
    const exhausted = advance(document, state, undefined, { stepBudget: 1 });
    expect(exhausted.result.type).toBe("error");

    const resumed = advance(document, exhausted.runtimeState, exhausted.cursor, { stepBudget: 10 });
    expect(textOf(resumed)).toBe("Hi.");
    expect(resumed.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
  });

  it("selectChoice's navigation does not pre-record the target scene", () => {
    const source = ["@scene s", "@choice", "- Go -> t", "@end", "", "@scene t", "There."].join("\n");
    const { document, state } = freshState(source);
    const suspension = advance(document, state); // records "s"
    const selected = selectChoice(document, suspension, 0);

    expect(selected.result).toEqual({ type: "navigation", from: "s", to: "t" });
    expect(selected.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } }); // no "t" yet

    const next = advance(document, selected.runtimeState, selected.cursor);
    expect(textOf(next)).toBe("There.");
    expect(next.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 }, t: { visitCount: 1 } });
  });
});

describe("Reader Memory — Variant seen", () => {
  const MOOD_HAPPY = ["@scene s", "@variant mood", "@when trust == 1", "Happy path.", "@end"].join("\n");

  it("first content from the selected branch records the occurrence once", () => {
    const { document, state } = freshState(MOOD_HAPPY);
    const step = advance(document, withStory(state, { trust: 1 }));
    expect(textOf(step)).toBe("Happy path.");
    expect(step.runtimeState.reader.seenVariants).toEqual({
      mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 1 }
    });
  });

  it("Presentation from the branch records the occurrence once", () => {
    const source = ["@scene s", "@variant mood", "@when trust == 1", "@background room.jpg", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, withStory(state, { trust: 1 }));
    expect(step.result.type).toBe("presentation");
    expect(step.runtimeState.reader.seenVariants).toEqual({
      mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 1 }
    });
  });

  it("Choice from the branch records the occurrence once", () => {
    const source = [
      "@scene s",
      "@variant mood",
      "@when trust == 1",
      "@choice",
      "- Go -> elsewhere",
      "@end",
      "@end",
      "",
      "@scene elsewhere",
      "Elsewhere."
    ].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, withStory(state, { trust: 1 }));
    expect(step.result.type).toBe("choice");
    expect(step.runtimeState.reader.seenVariants).toEqual({
      mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 1 }
    });
  });

  it("provenance survives an untagged Conditional frame nested inside the branch", () => {
    // The Paragraph lives two frames below the Variant's own frame, with an
    // untagged Conditional frame in between — collectPendingExposure must
    // still find the Variant occurrence by scanning every depth, not just
    // the immediate parent.
    const source = ["@scene s", "@variant mood", "@when trust == 1", "@if flag == true", "Hi.", "@end", "@end"].join(
      "\n"
    );
    const { document, state } = freshState(source);
    const step = advance(document, withStory(state, { trust: 1, flag: true }));
    expect(textOf(step)).toBe("Hi.");
    expect(step.runtimeState.reader.seenVariants).toEqual({
      mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 1 }
    });
    expect(step.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
  });

  it("multiple suspensions within the same branch occurrence record only once", () => {
    const source = ["@scene s", "@variant mood", "@when trust == 1", "First.", "", "Second.", "@end"].join("\n");
    const { document, state } = freshState(source);
    const first = advance(document, withStory(state, { trust: 1 }));
    expect(textOf(first)).toBe("First.");
    expect(first.runtimeState.reader.seenVariants.mood?.seenCount).toBe(1);

    const second = advance(document, first.runtimeState, first.cursor);
    expect(textOf(second)).toBe("Second.");
    expect(second.runtimeState.reader.seenVariants.mood?.seenCount).toBe(1);
  });

  it("a branch of only automatic work that falls through to sibling content is not recorded as seen", () => {
    const source = ["@scene s", "@variant mood", "@when trust == 1", "@set flag = true", "@end", "After."].join(
      "\n"
    );
    const { document, state } = freshState(source);
    const step = advance(document, withStory(state, { trust: 1 }));
    expect(textOf(step)).toBe("After.");
    expect(step.runtimeState.reader.seenVariants).toEqual({});
    expect(step.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } }); // the scene itself still qualifies
  });

  it("a branch of only automatic work that leads straight to completed is not recorded as seen", () => {
    const source = ["@scene s", "@variant mood", "@when trust == 1", "@set flag = true", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, withStory(state, { trust: 1 }));
    expect(step.result).toEqual({ type: "completed" });
    expect(step.runtimeState.reader.seenVariants).toEqual({});
    // completed is qualifying for the scene, deliberately NOT for the Variant.
    expect(step.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
  });

  it("a @goto inside the branch does not record it as seen", () => {
    const source = ["@scene s", "@variant mood", "@when trust == 1", "@goto elsewhere", "@end", "@scene elsewhere", "There."].join(
      "\n"
    );
    const { document, state } = freshState(source);
    const step = advance(document, withStory(state, { trust: 1 }));
    expect(step.result.type).toBe("navigation");
    expect(step.runtimeState.reader.seenVariants).toEqual({});
    expect(step.runtimeState.reader.visitedScenes).toEqual({}); // scene rule: immediate-goto never qualifies either
  });

  it("a runtime error before the branch's first observable result does not record it as seen", () => {
    const source = [
      "---",
      "state:",
      "  trust: 1",
      "  divisor: 0",
      "---",
      "@scene s",
      "@variant mood",
      "@when trust == 1",
      "@set x = 10 / divisor",
      "Hi.",
      "@end"
    ].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.result.type).toBe("error");
    expect(step.runtimeState.reader.seenVariants).toEqual({});
  });

  it("resuming after that error preserves provenance and later records correctly", () => {
    const source = [
      "---",
      "state:",
      "  trust: 1",
      "  divisor: 0",
      "---",
      "@scene s",
      "@variant mood",
      "@when trust == 1",
      "@set x = 10 / divisor",
      "Hi.",
      "@end"
    ].join("\n");
    const { document, state } = freshState(source);
    const failed = advance(document, state);
    expect(failed.result.type).toBe("error");

    const retried = advance(document, withStory(failed.runtimeState, { trust: 1, divisor: 1 }), failed.cursor);
    expect(textOf(retried)).toBe("Hi.");
    expect(retried.runtimeState.reader.seenVariants).toEqual({
      mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 1 }
    });
  });

  it("step-budget exhaustion before the branch's first observable result preserves provenance", () => {
    const source = ["@scene s", "@variant mood", "@when trust == 1", "@set a = 1", "@set b = 2", "Hi.", "@end"].join(
      "\n"
    );
    const { document, state } = freshState(source);
    const runtimeState = withStory(state, { trust: 1 });

    // resolution(1) + descent(1) + @set a(1) = 3; the 4th charge (@set b) fails.
    const exhausted = advance(document, runtimeState, undefined, { stepBudget: 3 });
    expect(exhausted.result.type).toBe("error");
    expect(exhausted.runtimeState.reader.seenVariants).toEqual({});
    expect(exhausted.runtimeState.story).toEqual({ trust: 1, a: 1 });

    const resumed = advance(document, exhausted.runtimeState, exhausted.cursor, { stepBudget: 10 });
    expect(textOf(resumed)).toBe("Hi.");
    expect(resumed.runtimeState.reader.seenVariants).toEqual({
      mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 1 }
    });
  });

  it("a later, independent resolution of the same Variant increments seenCount again", () => {
    const source = ["@scene s", "@variant mood", "@when trust == 1", "Happy.", "@end", "@goto s"].join("\n");
    const { document, state } = freshState(source);
    const runtimeState = withStory(state, { trust: 1 });

    const firstEntry = advance(document, runtimeState);
    expect(textOf(firstEntry)).toBe("Happy.");
    expect(firstEntry.runtimeState.reader.seenVariants.mood?.seenCount).toBe(1);

    const looped = advance(document, firstEntry.runtimeState, firstEntry.cursor);
    expect(looped.result).toEqual({ type: "navigation", from: "s", to: "s" });

    const secondEntry = advance(document, looped.runtimeState, looped.cursor);
    expect(textOf(secondEntry)).toBe("Happy.");
    expect(secondEntry.runtimeState.reader.seenVariants).toEqual({
      mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 2 }
    });
  });

  it("a later resolution to a different branch updates lastSeenBranchId while preserving firstSeenBranchId", () => {
    const source = [
      "@scene s",
      "@variant mood",
      "@when trust == 1",
      "Happy.",
      "@when trust == 2",
      "Sad.",
      "@end",
      "@goto s"
    ].join("\n");
    const { document, state } = freshState(source);

    const firstEntry = advance(document, withStory(state, { trust: 1 }));
    expect(textOf(firstEntry)).toBe("Happy.");

    const looped = advance(document, firstEntry.runtimeState, firstEntry.cursor);
    expect(looped.result.type).toBe("navigation");

    const secondEntry = advance(document, withStory(looped.runtimeState, { trust: 2 }), looped.cursor);
    expect(textOf(secondEntry)).toBe("Sad.");
    expect(secondEntry.runtimeState.reader.seenVariants).toEqual({
      mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:1", seenCount: 2 }
    });
  });
});

describe("Reader Memory — nested Variants", () => {
  const NESTED_ONE_PARAGRAPH = [
    "@scene s",
    "@variant outer",
    "@when a == 1",
    "@variant inner",
    "@when b == 1",
    "Paragraph.",
    "@end",
    "@end"
  ].join("\n");

  it("records both the outer and inner occurrence once, from one shared Paragraph", () => {
    const { document, state } = freshState(NESTED_ONE_PARAGRAPH);
    const step = advance(document, withStory(state, { a: 1, b: 1 }));
    expect(textOf(step)).toBe("Paragraph.");
    expect(step.runtimeState.reader.seenVariants).toEqual({
      outer: { firstSeenBranchId: "outer:0", lastSeenBranchId: "outer:0", seenCount: 1 },
      inner: { firstSeenBranchId: "inner:0", lastSeenBranchId: "inner:0", seenCount: 1 }
    });
  });

  it("a second observable result inside the same nested occurrences does not record either again", () => {
    const source = [
      "@scene s",
      "@variant outer",
      "@when a == 1",
      "@variant inner",
      "@when b == 1",
      "First.",
      "",
      "Second.",
      "@end",
      "@end"
    ].join("\n");
    const { document, state } = freshState(source);
    const first = advance(document, withStory(state, { a: 1, b: 1 }));
    expect(textOf(first)).toBe("First.");
    expect(first.runtimeState.reader.seenVariants.outer?.seenCount).toBe(1);
    expect(first.runtimeState.reader.seenVariants.inner?.seenCount).toBe(1);

    const second = advance(document, first.runtimeState, first.cursor);
    expect(textOf(second)).toBe("Second.");
    expect(second.runtimeState.reader.seenVariants.outer?.seenCount).toBe(1);
    expect(second.runtimeState.reader.seenVariants.inner?.seenCount).toBe(1);
  });

  it("an error/resume between the nested resolutions and their first content preserves both provenances", () => {
    const source = [
      "---",
      "state:",
      "  a: 1",
      "  b: 1",
      "  divisor: 0",
      "---",
      "@scene s",
      "@variant outer",
      "@when a == 1",
      "@variant inner",
      "@when b == 1",
      "@set x = 10 / divisor",
      "Paragraph.",
      "@end",
      "@end"
    ].join("\n");
    const { document, state } = freshState(source);
    const failed = advance(document, state);
    expect(failed.result.type).toBe("error");
    expect(failed.runtimeState.reader.seenVariants).toEqual({});

    const retried = advance(document, withStory(failed.runtimeState, { a: 1, b: 1, divisor: 1 }), failed.cursor);
    expect(textOf(retried)).toBe("Paragraph.");
    expect(retried.runtimeState.reader.seenVariants).toEqual({
      outer: { firstSeenBranchId: "outer:0", lastSeenBranchId: "outer:0", seenCount: 1 },
      inner: { firstSeenBranchId: "inner:0", lastSeenBranchId: "inner:0", seenCount: 1 }
    });
  });
});

describe("Reader Memory — replay/fork safety", () => {
  it("replaying the same (runtimeState, cursor) pair twice is deterministic and does not double-record", () => {
    const { document, state } = freshState("@scene s\nFirst.\n\nSecond.\n");
    const first = advance(document, state);
    const before = JSON.parse(JSON.stringify(first));

    const replayA = advance(document, first.runtimeState, first.cursor);
    const replayB = advance(document, first.runtimeState, first.cursor);

    expect(replayA).toEqual(replayB);
    expect(replayA.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
    // The original suspension is untouched by either replay.
    expect(first).toEqual(before);
  });

  it("forking a selectChoice suspension twice does not mutate it or double-record", () => {
    const source = ["@scene s", "@choice", "- Room -> room", "- Street -> street", "@end", "", "@scene room", "R.", "", "@scene street", "S."].join(
      "\n"
    );
    const { document, state } = freshState(source);
    const suspension = advance(document, state);
    const before = JSON.parse(JSON.stringify(suspension));

    const toRoom = selectChoice(document, suspension, 0);
    const toStreet = selectChoice(document, suspension, 1);

    expect(toRoom.result).toEqual({ type: "navigation", from: "s", to: "room" });
    expect(toStreet.result).toEqual({ type: "navigation", from: "s", to: "street" });
    // Both forks start from the same already-recorded "s" visit; neither
    // pre-records its own target.
    expect(toRoom.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
    expect(toStreet.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
    expect(suspension).toEqual(before);

    // No global mutable "already recorded" state: each fork independently
    // records its own target scene, and neither leaks into the other.
    const roomEntered = advance(document, toRoom.runtimeState, toRoom.cursor);
    expect(textOf(roomEntered)).toBe("R.");
    expect(roomEntered.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 }, room: { visitCount: 1 } });

    const streetEntered = advance(document, toStreet.runtimeState, toStreet.cursor);
    expect(textOf(streetEntered)).toBe("S.");
    expect(streetEntered.runtimeState.reader.visitedScenes).toEqual({
      s: { visitCount: 1 },
      street: { visitCount: 1 }
    });
  });
});
