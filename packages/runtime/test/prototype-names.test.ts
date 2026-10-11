import { describe, expect, it } from "vitest";
import { compile } from "@aftertext/compiler";
import type { StoryDocument } from "@aftertext/compiler";
import type { ReaderState } from "../src/index.js";
import {
  advance,
  createRuntimeState,
  getLastSeenVariantBranch,
  getSceneVisitCount,
  hasSeenVariant,
  hasVisitedScene,
  recordSceneVisit,
  recordVariantSeen
} from "../src/index.js";

const NAMES = ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"];
const empty = (): ReaderState => ({ visitedScenes: {}, seenVariants: {} });

describe("Reader Memory treats prototype-chain names as ordinary ids", () => {
  it.each(NAMES)("scene %s: never visited until recorded, then counted", (id) => {
    const reader = empty();
    expect(hasVisitedScene(reader, id)).toBe(false);
    expect(getSceneVisitCount(reader, id)).toBe(0);

    const once = recordSceneVisit(reader, id);
    expect(hasVisitedScene(once, id)).toBe(true);
    expect(getSceneVisitCount(once, id)).toBe(1);
    expect(getSceneVisitCount(recordSceneVisit(once, id), id)).toBe(2);
    expect(Object.keys(once.visitedScenes)).toEqual([id]);
    expect(hasVisitedScene(reader, id)).toBe(false); // input not mutated
  });

  it.each(NAMES)("variant %s: never seen until recorded, then counted without NaN", (id) => {
    const reader = empty();
    expect(hasSeenVariant(reader, id)).toBe(false);
    expect(getLastSeenVariantBranch(reader, id)).toBeNull();

    const once = recordVariantSeen(reader, id, "a");
    const twice = recordVariantSeen(once, id, "b");
    expect(hasSeenVariant(twice, id)).toBe(true);
    expect(getLastSeenVariantBranch(twice, id)).toBe("b");
    expect(Object.getOwnPropertyDescriptor(twice.seenVariants, id)?.value).toEqual({
      firstSeenBranchId: "a",
      lastSeenBranchId: "b",
      seenCount: 2
    });
  });

  it("writing __proto__ neither changes prototypes nor pollutes Object.prototype, and survives JSON", () => {
    let reader = recordSceneVisit(empty(), "__proto__");
    reader = recordVariantSeen(reader, "__proto__", "x");

    expect(Object.getPrototypeOf(reader.visitedScenes)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(reader.seenVariants)).toBe(Object.prototype);
    expect(Object.keys(Object.prototype)).toEqual([]);
    expect(({} as Record<string, unknown>)["visitCount"]).toBeUndefined();

    const restored = JSON.parse(JSON.stringify(reader)) as ReaderState;
    expect(hasVisitedScene(restored, "__proto__")).toBe(true);
    expect(hasSeenVariant(restored, "__proto__")).toBe(true);
    expect(getSceneVisitCount(recordSceneVisit(restored, "__proto__"), "__proto__")).toBe(2);
    expect(Object.getPrototypeOf(restored.visitedScenes)).toBe(Object.prototype);
  });

  it("an authored scene named toString is visited only after it is actually visited", () => {
    const document = compile("@scene toString\nHi.\n@scene start\n@if visited(\"toString\")\nSeen\n@end\nNo.\n").document;
    const state = { ...createRuntimeState(document), navigation: { sceneId: "start" } };
    const step = advance(document, state);
    expect(step.result).toMatchObject({ type: "content", block: { children: [{ value: "No." }] } });
  });
});

describe("runtime memory-query registry is own-key only", () => {
  function documentWithCallee(callee: string): StoryDocument {
    const document = compile('@scene a\n@variant v\n@when true\nX\n@end\n@if seen_variant("v")\nHi.\n@end\n').document;
    const copy = structuredClone(document) as unknown as { scenes: { blocks: { type: string; branches?: { condition: { callee: string } }[] }[] }[] };
    const conditional = copy.scenes[0]!.blocks.find((b) => b.type === "Conditional")!;
    conditional.branches![0]!.condition.callee = callee;
    return copy as unknown as StoryDocument;
  }

  it.each(["constructor", "toString", "valueOf", "__proto__"])(
    "%s returns an unknown-builtin error instead of throwing",
    (callee) => {
      const document = documentWithCallee(callee);
      let step = advance(document, createRuntimeState(document));
      while (step.result.type === "content") step = advance(document, step.runtimeState, step.cursor);
      expect(step.result).toMatchObject({ type: "error", error: { kind: "unknown-builtin" } });
    }
  );
});
