import { describe, expect, it } from "vitest";
import { advance, selectChoice } from "../src/index.js";
import { freshState } from "./helpers.js";

/**
 * ChoiceItem edits (docs/CORE_SPEC.md Section 25.41) — regression EVIDENCE,
 * not just structural proof, that after a structured source mutation a
 * Choice remains runtime reachable, condition filtering is unchanged, and
 * `selectChoice` still navigates to the expected target. A compiler-only
 * test cannot prove any of those three things (no execution ever happens),
 * so this exercises the real `@aftertext/runtime` `advance`/`selectChoice`
 * path directly, against canonical source shapes a source-generating tool
 * produces — not hand-varied fixtures. Test-only; no Runtime change.
 */
describe("ChoiceItem Structured Editing — Runtime regression", () => {
  it("an ordinary regenerated ChoiceItem (Text/Target Edit's canonical `- {text} -> {target}` output) remains runtime reachable", () => {
    // Exactly the canonical form a source-generating tool produces for an
    // unconditional item: "- " + text + " -> " + target.
    const source = ["@scene s", "@choice", "- Open the door -> room", "@end", "", "@scene room", "You entered the room."].join(
      "\n"
    );
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.result).toEqual({
      type: "choice",
      items: [{ index: 0, text: "Open the door", target: "room" }]
    });
  });

  it("a conditional regenerated ChoiceItem (Condition Add's canonical `- {text} -> {target} if {condition}` output) preserves filtering exactly as before", () => {
    const source = [
      "---",
      "state:",
      "  has_key: false",
      "---",
      "@scene s",
      "@choice",
      "- Open the door -> room",
      "- Use the key -> vault if has_key",
      "@end",
      "",
      "@scene room",
      "You entered the room.",
      "",
      "@scene vault",
      "You entered the vault."
    ].join("\n");

    const { document, state } = freshState(source);

    const filteredOut = advance(document, state);
    expect(filteredOut.result).toEqual({
      type: "choice",
      items: [{ index: 0, text: "Open the door", target: "room" }]
    });

    const included = advance(document, { ...state, story: { has_key: true } });
    expect(included.result).toEqual({
      type: "choice",
      items: [
        { index: 0, text: "Open the door", target: "room" },
        { index: 1, text: "Use the key", target: "vault" }
      ]
    });
  });

  it("selecting an item from an append-produced multi-item Choice navigates to the expected target", () => {
    // Exactly the shape produced by two sequential ChoiceItem appends into
    // the same, originally-one-item Choice (an append of one item at a time).
    const source = [
      "@scene s",
      "@choice",
      "- Open the door -> room",
      "- Run away -> street",
      "@end",
      "",
      "@scene room",
      "You entered the room.",
      "",
      "@scene street",
      "You ran into the street."
    ].join("\n");

    const { document, state } = freshState(source);
    const suspension = advance(document, state);
    expect(suspension.result.type).toBe("choice");

    const selectedFirst = selectChoice(document, suspension, 0);
    const afterFirst = advance(document, selectedFirst.runtimeState, selectedFirst.cursor);
    expect(afterFirst.result.type).toBe("content");
    if (afterFirst.result.type === "content") {
      expect(afterFirst.result.block).toMatchObject({ type: "Paragraph", children: [{ value: "You entered the room." }] });
    }

    const selectedSecond = selectChoice(document, suspension, 1);
    const afterSecond = advance(document, selectedSecond.runtimeState, selectedSecond.cursor);
    expect(afterSecond.result.type).toBe("content");
    if (afterSecond.result.type === "content") {
      expect(afterSecond.result.block).toMatchObject({ type: "Paragraph", children: [{ value: "You ran into the street." }] });
    }
  });
});

/**
 * ChoiceItem reorder — the same class of regression EVIDENCE: a
 * compiler-only test cannot prove visible order, filtered order, or
 * `selectChoice` navigation after an authored reorder, since none of those
 * ever execute anything. Exercises the real `advance`/`selectChoice` path
 * against source shapes produced by a plain adjacent-line swap, never a
 * regenerated or canonicalized item. Test-only; no Runtime change.
 */
describe("ChoiceItem Reorder — Runtime regression", () => {
  it("an authored reorder exposes the reordered visible list, in the new authored order", () => {
    // Exactly the source shape a Move Up/Move Down swap produces: two
    // adjacent bullet lines exchanged, everything else (including the gap)
    // untouched.
    const source = ["@scene s", "@choice", "- Run away -> street", "- Open the door -> room", "@end", "", "@scene room", "You entered the room.", "", "@scene street", "You ran into the street."].join(
      "\n"
    );
    const { document, state } = freshState(source);
    const step = advance(document, state);
    expect(step.result).toEqual({
      type: "choice",
      items: [
        { index: 0, text: "Run away", target: "street" },
        { index: 1, text: "Open the door", target: "room" }
      ]
    });
  });

  it("a condition-filtered visible order follows the moved authored order, not the pre-move order", () => {
    const source = [
      "---",
      "state:",
      "  has_key: false",
      "---",
      "@scene s",
      "@choice",
      "- Use the key -> vault if has_key",
      "- Open the door -> room",
      "@end",
      "",
      "@scene room",
      "You entered the room.",
      "",
      "@scene vault",
      "You entered the vault."
    ].join("\n");

    const { document, state } = freshState(source);

    // has_key is false: the moved conditional item (now authored first) is
    // filtered out entirely, leaving only the unconditional item — proving
    // the condition travelled WITH the item through the reorder, not left
    // behind at its old array position.
    const filteredOut = advance(document, state);
    expect(filteredOut.result).toEqual({
      type: "choice",
      items: [{ index: 0, text: "Open the door", target: "room" }]
    });

    const included = advance(document, { ...state, story: { has_key: true } });
    expect(included.result).toEqual({
      type: "choice",
      items: [
        { index: 0, text: "Use the key", target: "vault" },
        { index: 1, text: "Open the door", target: "room" }
      ]
    });
  });

  it("selectChoice on the moved visible item still reaches that item's own (unchanged) target", () => {
    // The exact result of moving the last item of a three-item, originally
    // ["Open the door", "Run away", "Wait"] Choice up by one position
    // (moving the last item up by one position) — the new authored order is
    // ["Open the door", "Wait", "Run away"].
    const source = [
      "@scene s",
      "@choice",
      "- Open the door -> room",
      "- Wait -> hallway",
      "- Run away -> street",
      "@end",
      "",
      "@scene room",
      "You entered the room.",
      "",
      "@scene street",
      "You ran into the street.",
      "",
      "@scene hallway",
      "You waited in the hallway."
    ].join("\n");

    const { document, state } = freshState(source);
    const suspension = advance(document, state);
    expect(suspension.result.type).toBe("choice");

    // "Wait" is now visible index 1 (its NEW post-move position) — its own
    // target ("hallway") must still resolve correctly there, not at its old
    // index (2).
    const selected = selectChoice(document, suspension, 1);
    const after = advance(document, selected.runtimeState, selected.cursor);
    expect(after.result.type).toBe("content");
    if (after.result.type === "content") {
      expect(after.result.block).toMatchObject({ type: "Paragraph", children: [{ value: "You waited in the hallway." }] });
    }
  });
});
