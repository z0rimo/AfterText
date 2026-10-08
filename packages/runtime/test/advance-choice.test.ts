import { describe, expect, it } from "vitest";
import { advance, selectChoice } from "../src/index.js";
import { freshState } from "./helpers.js";

const WITH_KEY_STATE = [
  "---",
  "state:",
  "  has_key: false",
  "---",
  "@scene start",
  "@choice",
  "- Open the door -> room",
  "- Run away -> street",
  "- Use the key -> basement if has_key",
  "@end",
  "",
  "@scene room",
  "You entered the room.",
  "",
  "@scene street",
  "You ran into the street.",
  "",
  "@scene basement",
  "You entered the basement."
].join("\n");

describe("ChoiceNode — presentation", () => {
  it("filters out items whose condition is false", () => {
    const { document, state } = freshState(WITH_KEY_STATE);
    const step = advance(document, state);
    expect(step.result).toEqual({
      type: "choice",
      items: [
        { index: 0, text: "Open the door", target: "room" },
        { index: 1, text: "Run away", target: "street" }
      ]
    });
  });

  it("includes a conditional item once its condition is true", () => {
    const { document, state } = freshState(WITH_KEY_STATE);
    const step = advance(document, { ...state, story: { has_key: true } });
    expect(step.result).toEqual({
      type: "choice",
      items: [
        { index: 0, text: "Open the door", target: "room" },
        { index: 1, text: "Run away", target: "street" },
        { index: 2, text: "Use the key", target: "basement" }
      ]
    });
  });

  it("a condition-evaluation error aborts the step", () => {
    const source = ["@scene s", "@choice", "- Go -> s if unknown_var", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.result.type).toBe("error");
    if (step.result.type === "error") expect(step.result.error.kind).toBe("unknown-identifier");
  });

  it("zero available items (all filtered out) is a runtime error, not a silent skip", () => {
    const source = ["@scene s", "@choice", "- Go -> s if false", "@end", "After."].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.result.type).toBe("error");
    if (step.result.type === "error") expect(step.result.error.kind).toBe("empty-choice");
  });

  it("zero items in the source at all is also a runtime error", () => {
    const source = ["@scene s", "@choice", "@end"].join("\n");
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.result.type).toBe("error");
    if (step.result.type === "error") expect(step.result.error.kind).toBe("empty-choice");
  });

  it("presenting a choice mutates no StoryState or NavigationState, and creates no choice-action record", () => {
    const { document, state } = freshState(WITH_KEY_STATE);
    const step = advance(document, state);
    expect(step.runtimeState.story).toEqual(state.story);
    expect(step.runtimeState.navigation).toEqual(state.navigation);
    // Presenting the choice does not itself select/act on anything — no
    // ChoiceRecord/ReaderActionLog exists, and none of this choice's own
    // items appear anywhere in ReaderState.
    expect(step.runtimeState.reader.seenVariants).toEqual({});
  });

  it("presenting a choice MAY update ReaderState via general exposure memory, not choice-specific memory", () => {
    // This choice is scene "start"'s first observable result, so it is the
    // qualifying first result of that scene-entry episode (docs/CORE_SPEC.md
    // Section 17.9) — general reader-experience memory, not a record of the
    // choice itself.
    const { document, state } = freshState(WITH_KEY_STATE);
    const step = advance(document, state);
    expect(step.runtimeState.reader).toEqual({ visitedScenes: { start: { visitCount: 1 } }, seenVariants: {} });
  });

  it("does not automatically select anything — requires an explicit selectChoice call", () => {
    const { document, state } = freshState(WITH_KEY_STATE);
    const step = advance(document, state);
    expect(step.result.type).toBe("choice"); // not "navigation"
  });
});

describe("selectChoice", () => {
  it("rejects a suspension that is not a choice", () => {
    const { document, state } = freshState("@scene s\nHi.\n");
    const contentStep = advance(document, state);
    const result = selectChoice(document, contentStep, 0);
    expect(result.result.type).toBe("error");
    if (result.result.type === "error") expect(result.result.error.kind).toBe("invalid-choice-selection");
    // Echoes the input unchanged — progressive, nothing partially committed.
    expect(result.runtimeState).toEqual(contentStep.runtimeState);
    expect(result.cursor).toEqual(contentStep.cursor);
  });

  it("rejects an out-of-range index", () => {
    const { document, state } = freshState(WITH_KEY_STATE);
    const suspension = advance(document, state); // 2 available items: indices 0, 1
    const result = selectChoice(document, suspension, 5);
    expect(result.result.type).toBe("error");
    if (result.result.type === "error") expect(result.result.error.kind).toBe("invalid-choice-selection");
  });

  it("rejects a negative index", () => {
    const { document, state } = freshState(WITH_KEY_STATE);
    const suspension = advance(document, state);
    const result = selectChoice(document, suspension, -1);
    expect(result.result.type).toBe("error");
  });

  it("does not re-evaluate conditions — validates only against the suspension's own item set", () => {
    const { document, state } = freshState(WITH_KEY_STATE);
    const suspension = advance(document, { ...state, story: { has_key: false } }); // 2 items offered

    // Tamper with the embedded runtimeState's story: if selection re-derived
    // the item set from this story it would now see 3 items, but it must not.
    const tampered = { ...suspension, runtimeState: { ...suspension.runtimeState, story: { has_key: true } } };
    const selected = selectChoice(document, tampered, 0);
    expect(selected.result).toEqual({ type: "navigation", from: "start", to: "room" });
  });

  it("a valid selection uses exactly the same navigation semantics as GotoNode", () => {
    const { document, state } = freshState(WITH_KEY_STATE);
    const suspension = advance(document, state);
    const selected = selectChoice(document, suspension, 1); // "Run away" -> street

    expect(selected.result).toEqual({ type: "navigation", from: "start", to: "street" });
    expect(selected.runtimeState.navigation).toEqual({ sceneId: "street" });

    const next = advance(document, selected.runtimeState, selected.cursor);
    expect(next.result.type).toBe("content");
    if (next.result.type === "content" && next.result.block.type === "Paragraph") {
      const text = next.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
      expect(text).toBe("You ran into the street.");
    }
  });

  it("selectChoice's navigation does not itself record the target scene as visited", () => {
    const { document, state } = freshState(WITH_KEY_STATE);
    const suspension = advance(document, state); // presenting the choice already recorded "start"
    const selected = selectChoice(document, suspension, 0);
    // "start" carries over from presenting the choice (the prior advance()
    // call); "room" (the target) must NOT appear — selectChoice/navigateTo
    // never record the target scene, only a later advance() from inside it
    // can (docs/CORE_SPEC.md Section 17.9).
    expect(selected.runtimeState.reader).toEqual({ visitedScenes: { start: { visitCount: 1 } }, seenVariants: {} });

    const next = advance(document, selected.runtimeState, selected.cursor);
    expect(next.runtimeState.reader.visitedScenes).toEqual({
      start: { visitCount: 1 },
      room: { visitCount: 1 }
    });
  });

  it("replaying an older but internally valid suspension is valid fork/replay, not a runtime-core error", () => {
    const { document, state } = freshState(WITH_KEY_STATE);
    const suspension = advance(document, state);

    const firstSelection = selectChoice(document, suspension, 0); // room
    const secondSelectionFromSameSuspension = selectChoice(document, suspension, 1); // street

    expect(firstSelection.result).toEqual({ type: "navigation", from: "start", to: "room" });
    expect(secondSelectionFromSameSuspension.result).toEqual({ type: "navigation", from: "start", to: "street" });
  });

  it("does not mutate its supplied suspension", () => {
    const { document, state } = freshState(WITH_KEY_STATE);
    const suspension = advance(document, state);
    const before = JSON.parse(JSON.stringify(suspension));

    selectChoice(document, suspension, 0);

    expect(suspension).toEqual(before);
  });
});
