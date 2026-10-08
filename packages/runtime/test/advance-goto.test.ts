import { describe, expect, it } from "vitest";
import { compile } from "@aftertext/compiler";
import { advance, createRuntimeState } from "../src/index.js";
import { freshState } from "./helpers.js";

const TWO_SCENES = ["@scene intro", "@goto hallway", "@scene hallway", "You are in the hallway."].join("\n");

describe("GotoNode", () => {
  it("returns a RuntimeState whose navigation already has the target sceneId", () => {
    const { document, state } = freshState(TWO_SCENES);
    const step = advance(document, state);
    expect(step.runtimeState.navigation).toEqual({ sceneId: "hallway" });
  });

  it("returns a navigation suspension immediately, carrying from/to", () => {
    const { document, state } = freshState(TWO_SCENES);
    const step = advance(document, state);
    expect(step.result).toEqual({ type: "navigation", from: "intro", to: "hallway" });
  });

  it("does not execute the target scene's blocks in the same call", () => {
    const { document, state } = freshState(TWO_SCENES);
    const step = advance(document, state);
    expect(step.result.type).toBe("navigation"); // not "content" — hallway's paragraph wasn't reached yet
  });

  it("the next advance() begins at the top of the target scene", () => {
    const { document, state } = freshState(TWO_SCENES);
    const navigated = advance(document, state);
    const next = advance(document, navigated.runtimeState, navigated.cursor);
    expect(next.result.type).toBe("content");
    if (next.result.type === "content" && next.result.block.type === "Paragraph") {
      const text = next.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
      expect(text).toBe("You are in the hallway.");
    }
  });

  it("never touches ReaderState.visitedScenes (navigated != experienced)", () => {
    const { document, state } = freshState(TWO_SCENES);
    const step = advance(document, state);
    expect(step.runtimeState.reader).toEqual({ visitedScenes: {}, seenVariants: {} });
  });

  it("an invalid target is an invariant-violation runtime error, preserving prior progress", () => {
    // The compiler itself would flag this (AT1004) — the execution layer's
    // own defensive check is exercised here directly, on a best-effort
    // document that a caller ran despite that pre-existing diagnostic.
    const document = compile("@scene s\n@set a = 1\n@goto nowhere\n").document;
    const state = createRuntimeState(document);
    const step = advance(document, state);
    expect(step.result.type).toBe("error");
    if (step.result.type === "error") expect(step.result.error.kind).toBe("invalid-scene-target");
    expect(step.runtimeState.story).toEqual({ a: 1 });
  });

  it("consumes no step budget — a budget of 0 still reaches the navigation suspension", () => {
    const { document, state } = freshState(TWO_SCENES);
    const step = advance(document, state, undefined, { stepBudget: 0 });
    expect(step.result.type).toBe("navigation");
  });
});
