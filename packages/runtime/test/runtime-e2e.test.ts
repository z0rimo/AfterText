import { describe, expect, it } from "vitest";
import { compile } from "@aftertext/compiler";
import { advance, createRuntimeState, selectChoice } from "../src/index.js";
import type { ExecutionStep } from "../src/index.js";

/**
 * True end-to-end integration coverage: real AfterText source text flowing
 * through compile() -> createRuntimeState() -> advance()/selectChoice(),
 * using only each package's public surface. The per-construct unit tests
 * elsewhere in this directory already cover isolated behavior in detail;
 * this file exists to catch a wiring/integration defect that no single
 * unit test could, since each of those starts from an already-compiled
 * document rather than real source text.
 */

function textOf(step: ExecutionStep): string {
  if (step.result.type === "content" && step.result.block.type === "Paragraph") {
    return step.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
  }
  throw new Error(`expected content, got ${step.result.type}`);
}

describe("end-to-end: full happy-path story execution", () => {
  const SOURCE = [
    "@scene start",
    "Opening paragraph.",
    "@set has_key = true",
    "@if has_key",
    "You have the key.",
    "@end",
    "@choice",
    "- Open the door -> room",
    "@end",
    "",
    "@scene room",
    "You enter the room."
  ].join("\n");

  it("flows compile() -> createRuntimeState() -> advance()/selectChoice() through to completed", () => {
    const result = compile(SOURCE);
    expect(result.hasErrors).toBe(false);
    const { document } = result;

    const state = createRuntimeState(document);
    expect(state.navigation).toEqual({ sceneId: "start" });

    const opening = advance(document, state);
    expect(textOf(opening)).toBe("Opening paragraph.");

    // @set + Conditional selection run automatically within this single call.
    const conditionalContent = advance(document, opening.runtimeState, opening.cursor);
    expect(textOf(conditionalContent)).toBe("You have the key.");
    expect(conditionalContent.runtimeState.story).toEqual({ has_key: true });

    const choice = advance(document, conditionalContent.runtimeState, conditionalContent.cursor);
    expect(choice.result).toEqual({
      type: "choice",
      items: [{ index: 0, text: "Open the door", target: "room" }]
    });

    const selected = selectChoice(document, choice, 0);
    expect(selected.result).toEqual({ type: "navigation", from: "start", to: "room" });
    expect(selected.runtimeState.navigation).toEqual({ sceneId: "room" });

    const roomContent = advance(document, selected.runtimeState, selected.cursor);
    expect(textOf(roomContent)).toBe("You enter the room."); // not executed during selectChoice() itself

    const completed = advance(document, roomContent.runtimeState, roomContent.cursor);
    expect(completed.result).toEqual({ type: "completed" });
  });
});

describe("end-to-end: state-driven branching and choice filtering", () => {
  const SOURCE = [
    "@scene start",
    "@set trust = 1",
    "@if trust == 1",
    "Trusted path.",
    "@end",
    "@choice",
    "- Wrong -> bad if trust == 0",
    "- Right -> good if trust == 1",
    "@end",
    "",
    "@scene bad",
    "Bad ending.",
    "",
    "@scene good",
    "Good ending."
  ].join("\n");

  it("selects the correct branch, filters and compacts choice items, and reaches the target scene", () => {
    const result = compile(SOURCE);
    expect(result.hasErrors).toBe(false);
    const { document } = result;

    const state = createRuntimeState(document);
    const trustedContent = advance(document, state);
    expect(textOf(trustedContent)).toBe("Trusted path.");

    const choice = advance(document, trustedContent.runtimeState, trustedContent.cursor);
    // "Wrong" (trust == 0) is filtered out; only "Right" remains, exposed
    // at compacted positional index 0 even though it was the second item
    // in the source.
    expect(choice.result).toEqual({
      type: "choice",
      items: [{ index: 0, text: "Right", target: "good" }]
    });

    const selected = selectChoice(document, choice, 0);
    expect(selected.result).toEqual({ type: "navigation", from: "start", to: "good" });

    const goodContent = advance(document, selected.runtimeState, selected.cursor);
    expect(textOf(goodContent)).toBe("Good ending.");

    const completed = advance(document, goodContent.runtimeState, goodContent.cursor);
    expect(completed.result).toEqual({ type: "completed" });
  });
});

describe("end-to-end: Reader Memory updates on actual exposure, not mere navigation", () => {
  const SOURCE = [
    "@scene start",
    "Opening paragraph.",
    "@choice",
    "- Open the door -> room",
    "@end",
    "",
    "@scene room",
    "You enter the room."
  ].join("\n");

  it("records ReaderState only when content is actually exposed, never merely on navigation", () => {
    const { document } = compile(SOURCE);
    const state = createRuntimeState(document);

    // The opening paragraph is "start"'s first observable result.
    const opening = advance(document, state);
    expect(opening.runtimeState.reader.visitedScenes).toEqual({ start: { visitCount: 1 } });

    // Presenting the choice is also scene "start"'s territory — already recorded.
    const choice = advance(document, opening.runtimeState, opening.cursor);
    expect(choice.result.type).toBe("choice");
    expect(choice.runtimeState.reader.visitedScenes).toEqual({ start: { visitCount: 1 } });

    // Selecting navigates, but does NOT itself record the target scene.
    const selected = selectChoice(document, choice, 0);
    expect(selected.result).toEqual({ type: "navigation", from: "start", to: "room" });
    expect(selected.runtimeState.reader.visitedScenes).toEqual({ start: { visitCount: 1 } });

    // Only the next advance(), once it actually exposes content from "room", records it.
    const roomContent = advance(document, selected.runtimeState, selected.cursor);
    expect(textOf(roomContent)).toBe("You enter the room.");
    expect(roomContent.runtimeState.reader.visitedScenes).toEqual({
      start: { visitCount: 1 },
      room: { visitCount: 1 }
    });
  });
});

describe("end-to-end: a Reader Memory query changes a later branch outcome", () => {
  const SOURCE = [
    "@scene a",
    "You are in room A.",
    "@goto b",
    "",
    "@scene b",
    '@if visited("a")',
    "You remember being in room A.",
    "@else",
    "This place feels unfamiliar.",
    "@end"
  ].join("\n");

  it("recording A's visit changes what visited(\"a\") evaluates to when B is later reached", () => {
    const result = compile(SOURCE);
    expect(result.hasErrors).toBe(false);
    const { document } = result;

    const state = createRuntimeState(document);

    const roomA = advance(document, state);
    expect(textOf(roomA)).toBe("You are in room A.");
    expect(roomA.runtimeState.reader.visitedScenes).toEqual({ a: { visitCount: 1 } });

    const navigated = advance(document, roomA.runtimeState, roomA.cursor);
    expect(navigated.result).toEqual({ type: "navigation", from: "a", to: "b" });

    const roomB = advance(document, navigated.runtimeState, navigated.cursor);
    expect(textOf(roomB)).toBe("You remember being in room A.");
  });

  it("navigating straight to B without ever experiencing A evaluates visited(\"a\") as false", () => {
    const { document } = compile(SOURCE);
    const state = createRuntimeState(document);
    const atB = { ...state, navigation: { sceneId: "b" } };

    const roomB = advance(document, atB);
    expect(textOf(roomB)).toBe("This place feels unfamiliar.");
  });
});
