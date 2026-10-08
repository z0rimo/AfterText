import { describe, expect, it } from "vitest";
import type { StoryDocument, VariantNode } from "@aftertext/compiler";
import { resolveVariant } from "../src/index.js";
import type { EvaluationContext, ReaderState, StoryState } from "../src/index.js";
import { compileDoc } from "./helpers.js";

function variantOf(document: StoryDocument): VariantNode {
  for (const scene of document.scenes) {
    for (const block of scene.blocks) {
      if (block.type === "Variant") return block;
    }
  }
  throw new Error("expected a Variant block somewhere in the document");
}

const EMPTY_READER: ReaderState = { visitedScenes: {}, seenVariants: {} };

/** Builds the EvaluationContext these tests need; `reader` defaults to empty. */
function ctx(document: StoryDocument, story: StoryState, reader: ReaderState = EMPTY_READER): EvaluationContext {
  return { document, story, reader };
}

const ALICE_STATUS_SOURCE = [
  "@scene s",
  "@variant alice-status",
  "@when timeline == 0",
  "She died that night.",
  "@when timeline == 1",
  "She disappeared that night.",
  "@otherwise",
  "Nothing happened that night.",
  "@end"
].join("\n");

describe("resolveVariant", () => {
  it("resolves the first matching @when branch", () => {
    const document = compileDoc(ALICE_STATUS_SOURCE);
    const result = resolveVariant(variantOf(document), ctx(document, { timeline: 0 }));
    expect(result).toEqual({
      ok: true,
      resolved: { variantId: "alice-status", branchId: "alice-status:0", blocks: expect.any(Array) }
    });
  });

  it("resolves a later @when branch when its condition matches", () => {
    const document = compileDoc(ALICE_STATUS_SOURCE);
    const result = resolveVariant(variantOf(document), ctx(document, { timeline: 1 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resolved?.branchId).toBe("alice-status:1");
  });

  it("falls back to @otherwise when no @when matches", () => {
    const document = compileDoc(ALICE_STATUS_SOURCE);
    const result = resolveVariant(variantOf(document), ctx(document, { timeline: 99 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resolved?.branchId).toBe("alice-status:otherwise");
  });

  it("resolves to undefined (not an error) when nothing matches and there is no @otherwise", () => {
    const source = ["@scene s", "@variant only-when", "@when timeline == 0", "Text.", "@end"].join("\n");
    const document = compileDoc(source);
    const result = resolveVariant(variantOf(document), ctx(document, { timeline: 99 }));
    expect(result).toEqual({ ok: true, resolved: undefined });
  });

  it("propagates a condition-evaluation error", () => {
    const source = ["@scene s", "@variant broken", "@when timeline == 0", "Text.", "@end"].join("\n");
    const document = compileDoc(source);
    const result = resolveVariant(variantOf(document), ctx(document, {})); // "timeline" unknown
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unknown-identifier");
  });

  it("never calls recordVariantSeen — its return type carries no ReaderState to mutate", () => {
    // resolveVariant's EvaluationContext now includes `reader` (needed so a
    // @when condition may query Reader Memory), but VariantResolution's own
    // return shape (`{ ok, resolved }`) structurally carries no ReaderState
    // at all — there is nothing for it to have recorded into, by construction.
    const document = compileDoc(ALICE_STATUS_SOURCE);
    const reader: ReaderState = { visitedScenes: {}, seenVariants: { "alice-status": { firstSeenBranchId: "alice-status:1", lastSeenBranchId: "alice-status:1", seenCount: 3 } } };
    const before = JSON.parse(JSON.stringify(reader));

    const result = resolveVariant(variantOf(document), ctx(document, { timeline: 0 }, reader));

    expect(result.ok).toBe(true);
    expect(reader).toEqual(before); // untouched
  });

  it("a @when condition may query Reader Memory, and resolution still participates normally in first-match-wins", () => {
    const source = ["@scene intro", "Hi.", "", "@scene s", "@variant mood", '@when visited("intro")', "Been there.", "@otherwise", "Fresh.", "@end"].join(
      "\n"
    );
    const document = compileDoc(source);

    const neverVisited = resolveVariant(variantOf(document), ctx(document, {}, EMPTY_READER));
    expect(neverVisited.ok).toBe(true);
    if (neverVisited.ok) expect(neverVisited.resolved?.branchId).toBe("mood:otherwise");

    const alreadyVisited: ReaderState = { visitedScenes: { intro: { visitCount: 1 } }, seenVariants: {} };
    const hasVisited = resolveVariant(variantOf(document), ctx(document, {}, alreadyVisited));
    expect(hasVisited.ok).toBe(true);
    if (hasVisited.ok) expect(hasVisited.resolved?.branchId).toBe("mood:0");
  });
});
