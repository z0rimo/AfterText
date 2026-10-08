import { describe, expect, it } from "vitest";
import type { ReaderState } from "../src/index.js";
import { hasVariantChangedSinceRead, recordVariantSeen } from "../src/index.js";

function emptyReader(): ReaderState {
  return { visitedScenes: {}, seenVariants: {} };
}

describe("variant memory", () => {
  it("records the first seen branch as both first and last, with count 1", () => {
    const reader = recordVariantSeen(emptyReader(), "alice-status", "alice-status:0");
    expect(reader.seenVariants["alice-status"]).toEqual({
      firstSeenBranchId: "alice-status:0",
      lastSeenBranchId: "alice-status:0",
      seenCount: 1
    });
  });

  it("preserves firstSeenBranchId while updating lastSeenBranchId on later encounters", () => {
    let reader = emptyReader();
    reader = recordVariantSeen(reader, "alice-status", "alice-status:0");
    reader = recordVariantSeen(reader, "alice-status", "alice-status:1");

    expect(reader.seenVariants["alice-status"]).toEqual({
      firstSeenBranchId: "alice-status:0",
      lastSeenBranchId: "alice-status:1",
      seenCount: 2
    });
  });

  it("increments seenCount on repeated encounters of the same branch", () => {
    let reader = emptyReader();
    reader = recordVariantSeen(reader, "alice-status", "alice-status:0");
    reader = recordVariantSeen(reader, "alice-status", "alice-status:0");
    reader = recordVariantSeen(reader, "alice-status", "alice-status:0");
    expect(reader.seenVariants["alice-status"]?.seenCount).toBe(3);
  });

  it("does not mutate the input reader state (pure update)", () => {
    const before = emptyReader();
    const after = recordVariantSeen(before, "alice-status", "alice-status:0");
    expect(before.seenVariants).toEqual({});
    expect(after).not.toBe(before);
  });

  describe("hasVariantChangedSinceRead", () => {
    it("is false for a never-seen variant", () => {
      const reader = emptyReader();
      expect(hasVariantChangedSinceRead(reader, "alice-status", "alice-status:0")).toBe(false);
    });

    it("is false when the current branch matches the last seen branch", () => {
      const reader = recordVariantSeen(emptyReader(), "alice-status", "alice-status:0");
      expect(hasVariantChangedSinceRead(reader, "alice-status", "alice-status:0")).toBe(false);
    });

    it("is true when the current branch differs from the last seen branch", () => {
      const reader = recordVariantSeen(emptyReader(), "alice-status", "alice-status:0");
      expect(hasVariantChangedSinceRead(reader, "alice-status", "alice-status:1")).toBe(true);
    });

    it("does not itself modify reader state (resolve != seen)", () => {
      const reader = recordVariantSeen(emptyReader(), "alice-status", "alice-status:0");
      const before = JSON.parse(JSON.stringify(reader));

      hasVariantChangedSinceRead(reader, "alice-status", "alice-status:1");

      expect(reader).toEqual(before);
    });
  });
});
