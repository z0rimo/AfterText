import { describe, expect, it } from "vitest";
import type { StoryBlock, StoryDocument } from "@aftertext/compiler";
import { advance } from "../src/index.js";
import type { ExecutionCursor } from "../src/index.js";
import { freshState } from "./helpers.js";

/** Replaces the first scene's blocks without touching the rest of the document. */
function withBlocks(document: StoryDocument, blocks: readonly unknown[]): StoryDocument {
  const [first, ...rest] = document.scenes;
  return { ...document, scenes: [{ ...first!, blocks: blocks as readonly StoryBlock[] }, ...rest] };
}

function expectInvalidBlock(step: ReturnType<typeof advance>): string {
  expect(step.result.type).toBe("error");
  if (step.result.type !== "error") throw new Error("unreachable");
  expect(step.result.error.kind).toBe("invalid-execution-block");
  return step.result.error.message;
}

describe("blocks the interpreter cannot execute (docs/CORE_SPEC.md Sections 17.11-17.12)", () => {
  it("an unknown block type returns a runtime error instead of looping", () => {
    const { document, state } = freshState("@scene s\nHi.\n");
    const message = expectInvalidBlock(advance(withBlocks(document, [{ type: "FutureBlock" }]), state));
    expect(message).toContain('"FutureBlock"');
  });

  it("a block without a string type returns a runtime error", () => {
    const { document, state } = freshState("@scene s\nHi.\n");
    expectInvalidBlock(advance(withBlocks(document, [{}]), state));
    expectInvalidBlock(advance(withBlocks(document, [{ type: 7 }]), state));
  });

  it("a missing block (undefined / null entry) returns a runtime error", () => {
    const { document, state } = freshState("@scene s\nHi.\n");
    expectInvalidBlock(advance(withBlocks(document, [undefined]), state));
    expectInvalidBlock(advance(withBlocks(document, [null]), state));
  });

  it("is progressive: work completed before the invalid block is kept, and the cursor stays on it", () => {
    const { document, state } = freshState("@scene s\n@set a = 1\nHi.\n");
    const broken = withBlocks(document, [document.scenes[0]!.blocks[0], { type: "FutureBlock" }]);
    const step = advance(broken, state);

    expectInvalidBlock(step);
    expect(step.runtimeState.story).toEqual({ a: 1 });
    expect(step.cursor).toEqual([expect.objectContaining({ index: 1 })]);

    // Resuming from the returned cursor reproduces the same error deterministically.
    expect(advance(broken, step.runtimeState, step.cursor)).toEqual(step);
  });

  it("records no reader memory for the failed call", () => {
    const { document, state } = freshState("@scene s\nHi.\n");
    const step = advance(withBlocks(document, [{ type: "FutureBlock" }]), state);
    expect(step.runtimeState.reader).toEqual(state.reader);
  });

  it("does not mutate its inputs", () => {
    const { document, state } = freshState("@scene s\nHi.\n");
    const broken = withBlocks(document, [{ type: "FutureBlock" }]);
    const cursor: ExecutionCursor = [{ blocks: broken.scenes[0]!.blocks, index: 0 }];
    const before = JSON.stringify({ broken, state, cursor });

    advance(broken, state, cursor);
    expect(JSON.stringify({ broken, state, cursor })).toBe(before);
  });

  it("a cursor index that no longer points at a block returns a runtime error", () => {
    const { document, state } = freshState("@scene s\nHi.\n");
    const blocks = document.scenes[0]!.blocks;
    for (const index of [-1, 0.5, Number.NaN, "length", "missing"]) {
      const cursor = [{ blocks, index: index as number }];
      expectInvalidBlock(advance(document, state, cursor));
    }
  });

  it("valid documents still run normally from a valid cursor", () => {
    const { document, state } = freshState("@scene s\nHi.\n");
    const step = advance(document, state);
    expect(step.result.type).toBe("content");
  });
});
