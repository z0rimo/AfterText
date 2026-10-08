import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import type { GotoNode, StoryBlock } from "../src/ast/story.js";
import { compileOk } from "./helpers.js";

function gotoOf(source: string, sceneIndex = 0): GotoNode {
  const document = compileOk(source).document;
  const block = document.scenes[sceneIndex]!.blocks.find((b) => b.type === "Goto");
  if (!block || block.type !== "Goto") throw new Error("expected Goto");
  return block;
}

function sliceOf(source: string, node: GotoNode): string {
  return source.slice(node.targetSourceSpan.start.offset, node.targetSourceSpan.end.offset);
}

function gotosIn(blocks: readonly StoryBlock[]): GotoNode[] {
  return blocks.flatMap((block): GotoNode[] => {
    if (block.type === "Goto") return [block];
    if (block.type === "Conditional" || block.type === "Variant") {
      return block.branches.flatMap((branch) => gotosIn(branch.blocks));
    }
    return [];
  });
}

describe("GotoNode.targetSourceSpan", () => {
  it("covers a simple target exactly", () => {
    const source = "@scene s\n@goto t\n@scene t\n";
    const node = gotoOf(source);
    expect(node.target).toBe("t");
    expect(sliceOf(source, node)).toBe("t");
    expect(node.targetSourceSpan.start).toEqual({ line: 2, column: 7, offset: 15 });
    expect(node.targetSourceSpan.end).toEqual({ line: 2, column: 8, offset: 16 });
  });

  it("excludes multiple separator spaces before the target", () => {
    const source = "@scene s\n@goto    my scene\n@scene my scene\n";
    const node = gotoOf(source);
    expect(node.target).toBe("my scene");
    expect(sliceOf(source, node)).toBe("my scene");
  });

  it("excludes a tab separator before the target", () => {
    const source = "@scene s\n@goto\tt\n@scene t\n";
    const node = gotoOf(source);
    expect(node.target).toBe("t");
    expect(sliceOf(source, node)).toBe("t");
  });

  it("excludes trailing whitespace from the target span", () => {
    const source = "@scene s\n@goto t   \n@scene t\n";
    const node = gotoOf(source);
    expect(node.target).toBe("t");
    expect(sliceOf(source, node)).toBe("t");
    expect(node.targetSourceSpan.end.offset - node.targetSourceSpan.start.offset).toBe(1);
  });

  it("covers a target containing spaces", () => {
    const source = "@scene s\n@goto my scene\n@scene my scene\n";
    const node = gotoOf(source);
    expect(sliceOf(source, node)).toBe("my scene");
  });

  it("covers a Unicode target", () => {
    const source = "@scene s\n@goto 한글\n@scene 한글\n";
    const node = gotoOf(source);
    expect(node.target).toBe("한글");
    expect(sliceOf(source, node)).toBe("한글");
  });

  it("uses CRLF offsets without an off-by-one", () => {
    const source = "@scene s\r\n@goto t\r\n@scene t\r\n";
    const node = gotoOf(source);
    expect(sliceOf(source, node)).toBe("t");
    expect(node.targetSourceSpan.start.offset).toBe(source.indexOf("t\r\n@scene t"));
    expect(source[node.targetSourceSpan.end.offset]).toBe("\r");
  });

  it("covers a nested Goto inside a Conditional branch", () => {
    const source = "@scene s\n@if x\n@goto t\n@end\n@scene t\n";
    const [node] = gotosIn(compileOk(source).document.scenes[0]!.blocks);
    expect(node).toBeDefined();
    expect(sliceOf(source, node!)).toBe("t");
  });

  it("covers a nested Goto inside a Variant branch", () => {
    const source = "@scene s\n@variant v\n@when x\n@goto t\n@end\n@scene t\n";
    const [node] = gotosIn(compileOk(source).document.scenes[0]!.blocks);
    expect(node).toBeDefined();
    expect(sliceOf(source, node!)).toBe("t");
  });

  it("gives a malformed empty Goto a zero-width span at the argument start", () => {
    const source = "@scene s\n@goto\n";
    const result = compile(source);
    const block = result.document.scenes[0]!.blocks[0];
    if (!block || block.type !== "Goto") throw new Error("expected Goto");
    expect(block.target).toBe("");
    expect(block.targetSourceSpan.start).toEqual({ line: 2, column: 6, offset: 14 });
    expect(block.targetSourceSpan.end).toEqual({ line: 2, column: 6, offset: 14 });
  });

  it("keeps the zero-width span for an empty Goto with trailing spaces", () => {
    const source = "@scene s\n@goto    \n";
    const result = compile(source);
    const block = result.document.scenes[0]!.blocks[0];
    if (!block || block.type !== "Goto") throw new Error("expected Goto");
    expect(block.targetSourceSpan.start.offset).toBe(block.targetSourceSpan.end.offset);
  });
});
