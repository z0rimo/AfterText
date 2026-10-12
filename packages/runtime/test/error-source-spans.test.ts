import { describe, expect, it } from "vitest";
import { compile } from "@aftertext/compiler";
import type { SourceSpan, StoryBlock } from "@aftertext/compiler";
import { advance, createRuntimeState, selectChoice } from "../src/index.js";
import { freshState } from "./helpers.js";

function errorOf(step: ReturnType<typeof advance>) {
  expect(step.result.type).toBe("error");
  if (step.result.type !== "error") throw new Error("unreachable");
  return step.result.error;
}

function sliced(source: string, span: SourceSpan | undefined): string | undefined {
  return span && source.slice(span.start.offset, span.end.offset);
}

describe("source spans on runtime execution errors", () => {
  it.each([
    ["LF", "\n"],
    ["CRLF", "\r\n"]
  ])("invalid @goto target carries GotoNode.targetSourceSpan (%s)", (_name, eol) => {
    // A best-effort document: the compiler reports AT1004, the runtime guard still holds.
    const source = ["@scene s", "@set a = 1", "@goto nowhere", "After."].join(eol);
    const { document } = compile(source);
    const goto = document.scenes[0]!.blocks.find((b) => b.type === "Goto");
    if (goto?.type !== "Goto") throw new Error("expected Goto");

    const error = errorOf(advance(document, createRuntimeState(document)));
    expect(error.kind).toBe("invalid-scene-target");
    expect(error.span).toEqual(goto.targetSourceSpan);
    expect(sliced(source, error.span)).toBe("nowhere");
    expect(error.span!.start.line).toBe(3);
  });

  it("an empty @goto target reports its zero-width target span", () => {
    const source = "@scene s\n@goto\n";
    const { document } = compile(source);
    const error = errorOf(advance(document, createRuntimeState(document)));
    expect(error.kind).toBe("invalid-scene-target");
    expect(error.span!.start).toEqual(error.span!.end);
  });

  it("an empty Choice carries the ChoiceNode span", () => {
    const source = ["@scene s", "@choice", "@end", "After."].join("\n");
    const { document, state } = freshState(source);
    const choice = document.scenes[0]!.blocks[0]!;
    const error = errorOf(advance(document, state));
    expect(error.kind).toBe("empty-choice");
    expect(error.span).toEqual(choice.span);
    expect(sliced(source, error.span)).toBe("@choice\n@end");
  });

  it("an all-filtered Choice carries the ChoiceNode span, with CRLF offsets", () => {
    const source = ["@scene s", "@choice", "- Go -> s if false", "@end"].join("\r\n");
    const { document, state } = freshState(source);
    const error = errorOf(advance(document, state));
    expect(error.kind).toBe("empty-choice");
    expect(sliced(source, error.span)).toBe("@choice\r\n- Go -> s if false\r\n@end");
  });

  it("a hand-built GotoNode without a span stays spanless instead of inventing one", () => {
    const { document, state } = freshState("@scene s\nHi.\n");
    const [first, ...rest] = document.scenes;
    const bare = { type: "Goto", target: "nowhere" } as unknown as StoryBlock;
    const broken = { ...document, scenes: [{ ...first!, blocks: [bare] }, ...rest] };
    const error = errorOf(advance(broken, state));
    expect(error.kind).toBe("invalid-scene-target");
    expect("span" in error).toBe(false);
  });

  it("remains spanless where no authored source position is known", () => {
    // Initial navigation scene from RuntimeState only.
    const { document, state } = freshState("@scene s\nHi.\n");
    const missing = { ...state, navigation: { sceneId: "ghost" } };
    expect(errorOf(advance(document, missing)).span).toBeUndefined();

    // Selecting an offered item whose target does not exist: items carry no source span.
    const { document: bad } = compile("@scene s\n@choice\n- Go -> nowhere\n@end\n");
    const choice = advance(bad, createRuntimeState(bad));
    expect(choice.result.type).toBe("choice");
    expect(errorOf(selectChoice(bad, choice, 0)).kind).toBe("invalid-scene-target");
    expect(errorOf(selectChoice(bad, choice, 0)).span).toBeUndefined();

    // API misuse.
    expect(errorOf(selectChoice(bad, choice, 9)).span).toBeUndefined();
  });

  it("expression errors keep carrying the exact expression span", () => {
    const source = "@scene s\n@set a = 1 / 0\n";
    const { document } = compile(source);
    const error = errorOf(advance(document, createRuntimeState(document)));
    expect(error.kind).toBe("division-by-zero");
    expect(error.span).toBeDefined();
    expect(sliced(source, error.span)).toBe("1 / 0");
  });
});
