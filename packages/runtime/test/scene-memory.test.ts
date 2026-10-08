import { describe, expect, it } from "vitest";
import type { ReaderState } from "../src/index.js";
import { getSceneVisitCount, hasVisitedScene, recordSceneVisit } from "../src/index.js";

function emptyReader(): ReaderState {
  return { visitedScenes: {}, seenVariants: {} };
}

describe("scene visit memory", () => {
  it("reports an unseen scene as not visited with zero count", () => {
    const reader = emptyReader();
    expect(hasVisitedScene(reader, "intro")).toBe(false);
    expect(getSceneVisitCount(reader, "intro")).toBe(0);
  });

  it("records a first visit as count 1", () => {
    const reader = recordSceneVisit(emptyReader(), "intro");
    expect(hasVisitedScene(reader, "intro")).toBe(true);
    expect(getSceneVisitCount(reader, "intro")).toBe(1);
  });

  it("increments deterministically on repeated visits", () => {
    let reader = emptyReader();
    reader = recordSceneVisit(reader, "intro");
    reader = recordSceneVisit(reader, "intro");
    reader = recordSceneVisit(reader, "intro");
    expect(getSceneVisitCount(reader, "intro")).toBe(3);
  });

  it("tracks each scene independently", () => {
    let reader = emptyReader();
    reader = recordSceneVisit(reader, "intro");
    reader = recordSceneVisit(reader, "intro");
    reader = recordSceneVisit(reader, "hallway");
    expect(getSceneVisitCount(reader, "intro")).toBe(2);
    expect(getSceneVisitCount(reader, "hallway")).toBe(1);
    expect(hasVisitedScene(reader, "basement")).toBe(false);
  });

  it("does not mutate the input reader state (pure update)", () => {
    const before = emptyReader();
    const after = recordSceneVisit(before, "intro");
    expect(before.visitedScenes).toEqual({});
    expect(after).not.toBe(before);
  });
});
