import { describe, expect, it } from "vitest";
import { advancePlayer, createPlayer, selectPlayerChoice } from "../src/index.js";
import { compileDoc, freshPlayer } from "./helpers.js";

const WITH_KEY = [
  "---",
  "state:",
  "  has_key: false",
  "---",
  "@scene start",
  "@choice",
  "- Open the door -> room",
  "- Use the key -> basement if has_key",
  "@end",
  "",
  "@scene room",
  "You entered the room.",
  "",
  "@scene basement",
  "You entered the basement."
].join("\n");

describe("selectPlayerChoice — valid selection", () => {
  it("delegates to runtime selectChoice and returns navigation", () => {
    const { document, player } = freshPlayer(WITH_KEY);
    const suspended = advancePlayer(document, player);
    const selected = selectPlayerChoice(document, suspended, 0);
    expect(selected.current).toEqual({ type: "navigation", from: "start", to: "room" });
  });

  it("the next advance enters the selected target scene", () => {
    const { document, player } = freshPlayer(WITH_KEY);
    const suspended = advancePlayer(document, player);
    const selected = selectPlayerChoice(document, suspended, 0);
    const entered = advancePlayer(document, selected);
    expect(entered.current?.type).toBe("content");
    if (entered.current?.type === "content" && entered.current.block.type === "Paragraph") {
      const text = entered.current.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
      expect(text).toBe("You entered the room.");
    }
  });

  it("does not re-evaluate conditions — selection is validated only against the suspension's own item set", () => {
    const { document, player } = freshPlayer(WITH_KEY);
    const suspended = advancePlayer(document, player); // has_key: false -> only item 0 ("Open the door") is offered

    // Tamper with the embedded story: if selection re-derived the item set
    // from it, "basement" would now appear as a valid target too — it
    // must not, since only one item was actually offered.
    const tampered = {
      ...suspended,
      runtimeState: { ...suspended.runtimeState, story: { has_key: true } }
    };
    const result = selectPlayerChoice(document, tampered, 1); // out of range for the ORIGINAL 1-item suspension
    expect(result.current?.type).toBe("error");
    if (result.current?.type === "error") expect(result.current.error.kind).toBe("invalid-choice-selection");
  });
});

describe("selectPlayerChoice — invalid selection", () => {
  it("before the first advance (current === null) returns invalid-choice-selection without throwing", () => {
    const document = compileDoc("@scene s\nHi.\n");
    const player = createPlayer(document);
    expect(() => selectPlayerChoice(document, player, 0)).not.toThrow();

    const result = selectPlayerChoice(document, player, 0);
    expect(result.current?.type).toBe("error");
    if (result.current?.type === "error") expect(result.current.error.kind).toBe("invalid-choice-selection");
    expect(result.runtimeState).toEqual(player.runtimeState);
    expect(result.cursor).toEqual(player.cursor);
  });

  it.each([
    ["content", "@scene s\nHi.\n"],
    ["presentation", "@scene s\n@background room.jpg\n"],
    ["navigation", "@scene s\n@goto t\n@scene t\nHi.\n"],
    ["completed", ""]
  ])("while current is %s, behaves defensively — no throw, invalid-choice-selection, state unchanged", (_kind, source) => {
    const { document, player } = freshPlayer(source);
    const suspended = advancePlayer(document, player);

    expect(() => selectPlayerChoice(document, suspended, 0)).not.toThrow();
    const result = selectPlayerChoice(document, suspended, 0);
    expect(result.current?.type).toBe("error");
    if (result.current?.type === "error") expect(result.current.error.kind).toBe("invalid-choice-selection");
    expect(result.runtimeState).toEqual(suspended.runtimeState);
    expect(result.cursor).toEqual(suspended.cursor);
  });

  it("while current is a runtime error, behaves defensively — no throw, invalid-choice-selection", () => {
    const source = ["---", "state:", "  divisor: 0", "---", "@scene s", "@set x = 10 / divisor"].join("\n");
    const { document, player } = freshPlayer(source);
    const errored = advancePlayer(document, player);
    expect(errored.current?.type).toBe("error");

    expect(() => selectPlayerChoice(document, errored, 0)).not.toThrow();
    const result = selectPlayerChoice(document, errored, 0);
    expect(result.current?.type).toBe("error");
    if (result.current?.type === "error") expect(result.current.error.kind).toBe("invalid-choice-selection");
  });
});
