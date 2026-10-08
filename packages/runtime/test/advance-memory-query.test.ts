import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import type { ExecutionStep, RuntimeState } from "../src/index.js";
import { freshState } from "./helpers.js";

/**
 * Focused integration coverage proving a Reader Memory query (docs/CORE_SPEC.md
 * Sections 17.14–17.17) is correctly wired through every expression-owning
 * construct via the full `advance()` path — not exhaustive per-construct
 * unit coverage (that lives in memory-queries.test.ts/expression.test.ts).
 */

function textOf(step: ExecutionStep): string {
  if (step.result.type === "content" && step.result.block.type === "Paragraph") {
    return step.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
  }
  throw new Error(`expected content, got ${step.result.type}`);
}

function atScene(state: RuntimeState, sceneId: string): RuntimeState {
  return { ...state, navigation: { sceneId } };
}

describe("Reader Memory queries wired through Conditional", () => {
  const SOURCE = ["@scene intro", "Hi.", "", "@scene s", '@if visited("intro")', "Been to intro.", "@else", "Never been.", "@end"].join(
    "\n"
  );

  it("branches on whether the reader actually visited the referenced scene", () => {
    const { document, state } = freshState(SOURCE);

    const neverVisited = advance(document, atScene(state, "s"));
    expect(textOf(neverVisited)).toBe("Never been.");

    const afterVisiting = advance(document, state); // records "intro"
    const hasVisitedState = atScene(afterVisiting.runtimeState, "s");
    const step = advance(document, hasVisitedState);
    expect(textOf(step)).toBe("Been to intro.");
  });
});

describe("Reader Memory queries wired through Variant", () => {
  const SOURCE = ["@scene intro", "Hi.", "", "@scene s", "@variant mood", '@when visited("intro")', "Familiar.", "@otherwise", "Fresh.", "@end"].join(
    "\n"
  );

  it("a @when condition resolves using actual Reader Memory", () => {
    const { document, state } = freshState(SOURCE);

    const neverVisited = advance(document, atScene(state, "s"));
    expect(textOf(neverVisited)).toBe("Fresh.");

    const afterVisiting = advance(document, state);
    const step = advance(document, atScene(afterVisiting.runtimeState, "s"));
    expect(textOf(step)).toBe("Familiar.");
  });
});

describe("Reader Memory queries wired through Choice item conditions", () => {
  const SOURCE = [
    "@scene s",
    "@variant mood",
    "@when true",
    "Hi.",
    "@end",
    "@choice",
    '- Reflect -> reflect if seen_variant("mood")',
    "- Leave -> leave",
    "@end",
    "",
    "@scene reflect",
    "Reflecting.",
    "",
    "@scene leave",
    "Leaving."
  ].join("\n");

  it("an item's condition sees the Variant occurrence just recorded earlier in the same scene", () => {
    const { document, state } = freshState(SOURCE);

    const shown = advance(document, state); // "Hi." — records mood seen
    expect(textOf(shown)).toBe("Hi.");

    const choice = advance(document, shown.runtimeState, shown.cursor);
    expect(choice.result).toEqual({
      type: "choice",
      items: [
        { index: 0, text: "Reflect", target: "reflect" },
        { index: 1, text: "Leave", target: "leave" }
      ]
    });
  });
});
