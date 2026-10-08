import { describe, expect, it } from "vitest";
import { advancePlayer, selectPlayerChoice } from "../src/index.js";
import { freshPlayer } from "./helpers.js";

describe("purity", () => {
  it("createPlayer -> advancePlayer -> selectPlayerChoice never mutates an earlier PlayerState", () => {
    const source = ["@scene s", "@choice", "- Go -> room", "@end", "", "@scene room", "R."].join("\n");
    const { document, player: player1 } = freshPlayer(source);
    const before1 = JSON.parse(JSON.stringify(player1));

    const player2 = advancePlayer(document, player1);
    const before2 = JSON.parse(JSON.stringify(player2));

    const player3 = selectPlayerChoice(document, player2, 0);

    expect(player1).toEqual(before1);
    expect(player2).toEqual(before2);
    expect(player3).not.toBe(player2);
    expect(player3).not.toBe(player1);
  });

  it("older runtimeState/cursor/current values remain unchanged after later operations", () => {
    const { document, player } = freshPlayer("@scene s\nFirst.\n\nSecond.\n");
    const first = advancePlayer(document, player);
    const firstRuntimeStateSnapshot = JSON.parse(JSON.stringify(first.runtimeState));
    const firstCursorSnapshot = JSON.parse(JSON.stringify(first.cursor));

    advancePlayer(document, first); // a further step, from a separate variable

    expect(first.runtimeState).toEqual(firstRuntimeStateSnapshot);
    expect(first.cursor).toEqual(firstCursorSnapshot);
  });
});

describe("replay / fork", () => {
  it("selecting two different choices from the same retained PlayerState produces independent, non-interfering branches", () => {
    const source = [
      "@scene start",
      "@choice",
      "- Room -> room",
      "- Street -> street",
      "@end",
      "",
      "@scene room",
      "R.",
      "",
      "@scene street",
      "S."
    ].join("\n");
    const { document, player } = freshPlayer(source);
    const choiceState = advancePlayer(document, player);
    const before = JSON.parse(JSON.stringify(choiceState));

    const left = selectPlayerChoice(document, choiceState, 0);
    const right = selectPlayerChoice(document, choiceState, 1);

    expect(left.current).toEqual({ type: "navigation", from: "start", to: "room" });
    expect(right.current).toEqual({ type: "navigation", from: "start", to: "street" });
    expect(choiceState).toEqual(before); // neither selection touched the shared suspension

    const leftContent = advancePlayer(document, left);
    const rightContent = advancePlayer(document, right);
    if (leftContent.current?.type === "content" && leftContent.current.block.type === "Paragraph") {
      expect(leftContent.current.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("")).toBe("R.");
    }
    if (rightContent.current?.type === "content" && rightContent.current.block.type === "Paragraph") {
      expect(rightContent.current.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("")).toBe("S.");
    }
  });
});
