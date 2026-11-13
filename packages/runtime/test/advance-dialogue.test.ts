import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import type { DialogueResult } from "../src/index.js";
import { freshState } from "./helpers.js";

function dialogueOf(result: unknown): DialogueResult {
  if (!result || (result as { type?: string }).type !== "dialogue") {
    throw new Error(`expected dialogue, got ${JSON.stringify(result)}`);
  }
  return result as DialogueResult;
}

function textOf(result: DialogueResult): string {
  return result.content.map((c) => (c.type === "Text" ? c.value : "")).join("");
}

describe("Dialogue — dialogue suspension", () => {
  it("suspends on a Dialogue, with speaker and content preserved", () => {
    const { document, state } = freshState("@scene s\n@say speaker=Alice\nHello there.\n");
    const step = advance(document, state);
    expect(step.result.type).toBe("dialogue");
    const result = dialogueOf(step.result);
    expect(result.speaker).toBe("Alice");
    expect(textOf(result)).toBe("Hello there.");
  });

  it("preserves speaker case verbatim", () => {
    const { document, state } = freshState("@scene s\n@say speaker=ALiCe\nHi.\n");
    const result = dialogueOf(advance(document, state).result);
    expect(result.speaker).toBe("ALiCe");
  });

  it("preserves InlineNode content structure, not just flattened text", () => {
    const { document, state } = freshState("@scene s\n@say speaker=Alice\nHello *there*.\n");
    const result = dialogueOf(advance(document, state).result);
    expect(result.content.map((c) => c.type)).toEqual(["Text", "Emphasis", "Text"]);
  });

  it("the next advance() resumes after the dialogue, at the next block", () => {
    const { document, state } = freshState("@scene s\n@say speaker=Alice\nFirst.\n\nSecond paragraph.\n");
    const first = advance(document, state);
    const second = advance(document, first.runtimeState, first.cursor);
    expect(first.result.type).toBe("dialogue");
    expect(second.result.type).toBe("content");
  });

  it("consumes no step budget — a budget of 0 still reaches the dialogue", () => {
    const { document, state } = freshState("@scene s\n@say speaker=Alice\nHello.\n");
    const step = advance(document, state, undefined, { stepBudget: 0 });
    expect(step.result.type).toBe("dialogue");
  });

  it("two consecutive Dialogue blocks are each their own suspension", () => {
    const { document, state } = freshState("@scene s\n@say speaker=Alice\nHi.\n@say speaker=Bob\nHey.\n");
    const first = advance(document, state);
    const second = advance(document, first.runtimeState, first.cursor);
    expect(dialogueOf(first.result).speaker).toBe("Alice");
    expect(dialogueOf(second.result).speaker).toBe("Bob");
  });

  it("Dialogue between narrative Paragraphs resumes to ordinary content on both sides", () => {
    const { document, state } = freshState("@scene s\nBefore.\n\n@say speaker=Alice\nHi.\n\nAfter.\n");
    const first = advance(document, state);
    const second = advance(document, first.runtimeState, first.cursor);
    const third = advance(document, second.runtimeState, second.cursor);
    expect(first.result.type).toBe("content");
    expect(second.result.type).toBe("dialogue");
    expect(third.result.type).toBe("content");
  });

  it("Dialogue after a Presentation command resumes normally", () => {
    const { document, state } = freshState("@scene s\n@background room.jpg\n@say speaker=Alice\nHi.\n");
    const first = advance(document, state);
    const second = advance(document, first.runtimeState, first.cursor);
    expect(first.result.type).toBe("presentation");
    expect(second.result.type).toBe("dialogue");
  });

  it("Dialogue before a Choice resumes to the choice afterward", () => {
    const source = ["@scene s", "@say speaker=Alice", "Hi.", "@choice", "- Go -> s", "@end"].join("\n");
    const { document, state } = freshState(source);
    const first = advance(document, state);
    const second = advance(document, first.runtimeState, first.cursor);
    expect(first.result.type).toBe("dialogue");
    expect(second.result.type).toBe("choice");
  });

  it("Dialogue participates in scene navigation like any other content", () => {
    const source = ["@scene s", "@say speaker=Alice", "Hi.", "@goto t", "", "@scene t", "Arrived."].join("\n");
    const { document, state } = freshState(source);
    const first = advance(document, state);
    const second = advance(document, first.runtimeState, first.cursor);
    const third = advance(document, second.runtimeState, second.cursor);
    expect(first.result.type).toBe("dialogue");
    expect(second.result.type).toBe("navigation");
    expect(third.result.type).toBe("content");
  });
});
