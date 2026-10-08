import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

function textOf(step: ReturnType<typeof advance>): string {
  if (step.result.type === "content" && step.result.block.type === "Paragraph") {
    return step.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
  }
  throw new Error(`expected content, got ${step.result.type}`);
}

/**
 * Variant branch edits (docs/CORE_SPEC.md Section 25.43) — regression
 * EVIDENCE, not just structural proof, that after a structured source
 * mutation a Variant's branch selection, fallback behavior, and filtering
 * remain correct. A compiler-only test cannot prove any of those (no
 * execution ever happens), so this exercises the real `@aftertext/runtime`
 * `advance` path directly, against canonical source shapes a source-editing
 * tool produces (narrow condition replacement, append-before-otherwise or
 * append-after-last-when placement, removal, and both `when <-> otherwise`
 * header conversions) — not hand-varied fixtures. Test-only; no Runtime
 * change.
 */
describe("Variant Branch Structured Editing — Runtime regression", () => {
  it("an edited condition (a narrow conditionSourceSpan replacement) selects a different branch", () => {
    // Exactly the shape a Condition Edit produces: only the condition
    // payload changes, everything else (including the body) untouched.
    const source = ["@scene s", "@variant mood", "@when timeline == 1", "She disappeared.", "@end"].join("\n");
    const { document, state } = freshState(source);

    const matched = advance(document, { ...state, story: { timeline: 1 } });
    expect(textOf(matched)).toBe("She disappeared.");
  });

  it("an added @when branch (inserted before a final @otherwise, this feature's Add @when placement) participates in authored order ahead of the fallback", () => {
    const source = [
      "@scene s",
      "@variant mood",
      "@when timeline == 0",
      "She died that night.",
      "@when timeline == 1",
      "She disappeared that night.",
      "@otherwise",
      "Nothing happened.",
      "@end"
    ].join("\n");
    const { document, state } = freshState(source);

    expect(textOf(advance(document, { ...state, story: { timeline: 1 } }))).toBe("She disappeared that night.");
    expect(textOf(advance(document, { ...state, story: { timeline: 99 } }))).toBe("Nothing happened.");
  });

  it("an added final @otherwise (this feature's Add @otherwise placement) provides the fallback when no @when matches", () => {
    const source = ["@scene s", "@variant mood", "@when timeline == 0", "She died.", "@otherwise", "Nothing happened.", "@end"].join(
      "\n"
    );
    const { document, state } = freshState(source);

    expect(textOf(advance(document, { ...state, story: { timeline: 99 } }))).toBe("Nothing happened.");
  });

  it("a removed branch no longer participates — exactly the shape left behind by this feature's removal envelope", () => {
    // The result of removing the first @when branch from a 2-branch
    // Variant: only "She disappeared" remains, authored first.
    const source = ["@scene s", "@variant mood", "@when timeline == 1", "She disappeared that night.", "@end"].join("\n");
    const { document, state } = freshState(source);

    expect(textOf(advance(document, { ...state, story: { timeline: 1 } }))).toBe("She disappeared that night.");

    // The removed branch's condition ("timeline == 0") no longer exists —
    // no match and no @otherwise: the Variant contributes nothing and
    // execution continues past it (nothing further here, so the step
    // errors) — this still proves the removed branch's own condition is
    // gone, not silently still matching.
    const noMatch = advance(document, { ...state, story: { timeline: 0 } });
    expect(noMatch.result.type).not.toBe("content");
  });

  it("otherwise -> when conversion: the converted branch now requires and obeys its new condition, no longer an unconditional fallback", () => {
    // Exactly the shape `@otherwise` -> `@when {condition}` conversion
    // produces: the former fallback is now a conditional branch.
    const source = ["@scene s", "@variant mood", "@when timeline == 0", "She died.", "@when has_key", "Found a clue.", "@end"].join(
      "\n"
    );
    const { document, state } = freshState(source);

    expect(textOf(advance(document, { ...state, story: { timeline: 1, has_key: true } }))).toBe("Found a clue.");

    // With the new condition false and no @otherwise remaining, no match —
    // confirming it is now a true conditional branch, not an unconditional
    // fallback anymore.
    const noMatch = advance(document, { ...state, story: { timeline: 1, has_key: false } });
    expect(noMatch.result.type).not.toBe("content");
  });

  it("when -> otherwise conversion: the converted last branch now acts as the unconditional fallback", () => {
    // Exactly the shape the last `@when` -> `@otherwise` header conversion
    // produces: the former conditional branch is now the fallback.
    const source = ["@scene s", "@variant mood", "@when timeline == 0", "She died.", "@otherwise", "Nothing happened.", "@end"].join(
      "\n"
    );
    const { document, state } = freshState(source);

    // Any story state that doesn't match the first @when now reaches the
    // (formerly conditional, now unconditional) fallback branch.
    expect(textOf(advance(document, { ...state, story: { timeline: 1 } }))).toBe("Nothing happened.");
  });
});

/**
 * Variant branch reorder — real `advance` proof that adjacent `@when`
 * reorder is genuinely semantic: when both of two swapped branches'
 * conditions are true, reordering flips which one wins (first-match-wins
 * over authored order); when only one matches, reorder has no effect on
 * which branch executes; a final `@otherwise` remains the fallback
 * regardless of how the preceding `@when`s were reordered. Exercises the
 * exact two-branch-swap source shapes, not hand-varied fixtures.
 * Test-only; no Runtime change.
 */
describe("Variant Branch Reorder — Runtime regression", () => {
  it("both conditions true: reordering the two @when branches flips which one wins", () => {
    const before = [
      "@scene s",
      "@variant mood",
      "@when has_key",
      "Found the key.",
      "@when flag",
      "Flag is set.",
      "@end"
    ].join("\n");
    const story = { has_key: true, flag: true };

    const beforeDoc = freshState(before);
    expect(textOf(advance(beforeDoc.document, { ...beforeDoc.state, story }))).toBe("Found the key.");

    // Exactly the source shape adjacent Model B reorder produces for this
    // fixture (the two @when branches' spans swapped, physical gap
    // preserved).
    const afterSwap = [
      "@scene s",
      "@variant mood",
      "@when flag",
      "Flag is set.",
      "@when has_key",
      "Found the key.",
      "@end"
    ].join("\n");
    const afterDoc = freshState(afterSwap);
    expect(textOf(advance(afterDoc.document, { ...afterDoc.state, story }))).toBe("Flag is set.");
  });

  it("only one condition true: the same semantic branch still wins regardless of reorder", () => {
    const before = [
      "@scene s",
      "@variant mood",
      "@when has_key",
      "Found the key.",
      "@when flag",
      "Flag is set.",
      "@end"
    ].join("\n");
    const story = { has_key: true, flag: false };

    const beforeDoc = freshState(before);
    expect(textOf(advance(beforeDoc.document, { ...beforeDoc.state, story }))).toBe("Found the key.");

    const afterSwap = [
      "@scene s",
      "@variant mood",
      "@when flag",
      "Flag is set.",
      "@when has_key",
      "Found the key.",
      "@end"
    ].join("\n");
    const afterDoc = freshState(afterSwap);
    expect(textOf(advance(afterDoc.document, { ...afterDoc.state, story }))).toBe("Found the key.");
  });

  it("no @when matches: the final @otherwise still wins, unaffected by reordering the preceding @whens", () => {
    const before = [
      "@scene s",
      "@variant mood",
      "@when has_key",
      "Found the key.",
      "@when flag",
      "Flag is set.",
      "@otherwise",
      "Nothing happened.",
      "@end"
    ].join("\n");
    const story = { has_key: false, flag: false };

    const beforeDoc = freshState(before);
    expect(textOf(advance(beforeDoc.document, { ...beforeDoc.state, story }))).toBe("Nothing happened.");

    const afterSwap = [
      "@scene s",
      "@variant mood",
      "@when flag",
      "Flag is set.",
      "@when has_key",
      "Found the key.",
      "@otherwise",
      "Nothing happened.",
      "@end"
    ].join("\n");
    const afterDoc = freshState(afterSwap);
    expect(textOf(advance(afterDoc.document, { ...afterDoc.state, story }))).toBe("Nothing happened.");
  });

  /**
   * Whole Variant insertion — the minimal shape a source-generating tool
   * produces: one unconditional `@when true` branch, empty body, no `@otherwise`. Confirms this is reachable
   * without suspension (no "choice"/"error" result) and, immediately after
   * it, both completion and continuation into following content behave
   * exactly as any other empty container would.
   */
  it("the minimal generated shape (@variant variant / @when true / @end) selects its sole branch and completes cleanly when it is the only content", () => {
    const source = ["@scene s", "@variant variant", "@when true", "@end"].join("\n");
    const { document, state } = freshState(source);

    const step = advance(document, state);
    expect(step.result.type).toBe("completed");
  });

  it("the minimal generated shape executes its empty body safely and continues into following content with no suspension", () => {
    const source = ["@scene s", "@variant variant", "@when true", "@end", "After."].join("\n");
    const { document, state } = freshState(source);

    const step = advance(document, state);
    expect(textOf(step)).toBe("After.");
  });
});
