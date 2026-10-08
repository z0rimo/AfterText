import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

/**
 * docs/CORE_SPEC.md Section 25.46 (Variant Id Source Span) — runtime
 * identity and branchId consequences of renaming a Variant id: a
 * declaration-only rename intentionally changes Runtime identity, with no
 * migration of any kind. The rename here is simulated with a plain string
 * substitution, standing in for the narrow source patch a source-editing
 * tool would produce, to prove the Runtime-level consequence in isolation.
 */
describe("Variant ID rename — Runtime identity consequences", () => {
  const BEFORE = ["@scene s", "@variant alice-status", "@when timeline == 0", "She died.", "@end"].join("\n");
  const AFTER = ["@scene s", "@variant bob-status", "@when timeline == 0", "She died.", "@end"].join("\n");

  it("fresh execution before rename: seenVariants is keyed by the original id", () => {
    const { document, state } = freshState(BEFORE);
    const step = advance(document, { ...state, story: { timeline: 0 } });
    expect(step.runtimeState.reader.seenVariants).toEqual({
      "alice-status": { firstSeenBranchId: "alice-status:0", lastSeenBranchId: "alice-status:0", seenCount: 1 }
    });
  });

  it("fresh execution after rename: seenVariants is keyed by the NEW id only — no migration of the old key", () => {
    const { document, state } = freshState(AFTER);
    const step = advance(document, { ...state, story: { timeline: 0 } });
    expect(step.runtimeState.reader.seenVariants).toEqual({
      "bob-status": { firstSeenBranchId: "bob-status:0", lastSeenBranchId: "bob-status:0", seenCount: 1 }
    });
    expect(step.runtimeState.reader.seenVariants["alice-status"]).toBeUndefined();
  });

  it("branchIds reflect the new id after recompile — bob-status:0, never alice-status:0", () => {
    const { document, state } = freshState(AFTER);
    const step = advance(document, { ...state, story: { timeline: 0 } });
    expect(step.runtimeState.reader.seenVariants["bob-status"]?.firstSeenBranchId).toBe("bob-status:0");
  });
});
