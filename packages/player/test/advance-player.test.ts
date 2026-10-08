import { describe, expect, it } from "vitest";
import { advancePlayer } from "../src/index.js";
import type { PlayerState } from "../src/index.js";
import { freshPlayer } from "./helpers.js";

function textOf(player: PlayerState): string {
  if (player.current?.type === "content" && player.current.block.type === "Paragraph") {
    return player.current.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
  }
  throw new Error(`expected content, got ${player.current?.type}`);
}

describe("advancePlayer", () => {
  it("first advance exposes the first runtime result (content)", () => {
    const { document, player } = freshPlayer("@scene s\nFirst.\n\nSecond.\n");
    const next = advancePlayer(document, player);
    expect(next.current?.type).toBe("content");
    expect(textOf(next)).toBe("First.");
  });

  it("repeated advance progresses correctly, one runtime step per call", () => {
    const { document, player } = freshPlayer("@scene s\nFirst.\n\nSecond.\n");
    const first = advancePlayer(document, player);
    const second = advancePlayer(document, first);
    expect(textOf(second)).toBe("Second.");

    const completed = advancePlayer(document, second);
    expect(completed.current).toEqual({ type: "completed" });
  });

  it("does not mutate the supplied PlayerState", () => {
    const { document, player } = freshPlayer("@scene s\nHi.\n");
    const before = JSON.parse(JSON.stringify(player));
    advancePlayer(document, player);
    expect(player).toEqual(before);
  });

  it("Presentation passes through unchanged", () => {
    const { document, player } = freshPlayer("@scene s\n@background room.jpg\n");
    const next = advancePlayer(document, player);
    expect(next.current).toEqual({ type: "presentation", command: { type: "Background", image: "room.jpg" } });
  });

  it("Choice passes through unchanged, including its item set", () => {
    const source = ["@scene s", "@choice", "- Go left -> left", "- Go right -> right", "@end", "", "@scene left", "L.", "", "@scene right", "R."].join(
      "\n"
    );
    const { document, player } = freshPlayer(source);
    const next = advancePlayer(document, player);
    expect(next.current).toEqual({
      type: "choice",
      items: [
        { index: 0, text: "Go left", target: "left" },
        { index: 1, text: "Go right", target: "right" }
      ]
    });
  });

  it("navigation remains observable — the next advance enters the target scene", () => {
    const source = ["@scene a", "@goto b", "@scene b", "Arrived."].join("\n");
    const { document, player } = freshPlayer(source);
    const navigated = advancePlayer(document, player);
    expect(navigated.current).toEqual({ type: "navigation", from: "a", to: "b" });
    expect(navigated.runtimeState.navigation).toEqual({ sceneId: "b" });

    const entered = advancePlayer(document, navigated);
    expect(textOf(entered)).toBe("Arrived.");
  });

  it("completed passes through unchanged", () => {
    const { document, player } = freshPlayer("");
    const next = advancePlayer(document, player);
    expect(next.current).toEqual({ type: "completed" });
  });

  it("a runtime error passes through unchanged", () => {
    const source = ["---", "state:", "  divisor: 0", "---", "@scene s", "@set x = 10 / divisor"].join("\n");
    const { document, player } = freshPlayer(source);
    const next = advancePlayer(document, player);
    expect(next.current?.type).toBe("error");
    if (next.current?.type === "error") expect(next.current.error.kind).toBe("division-by-zero");
  });

  it("forwards AdvanceOptions (e.g. stepBudget) to the runtime unchanged", () => {
    const { document, player } = freshPlayer("@scene s\n@set a = 1\n@set b = 2\nHi.\n");
    const exhausted = advancePlayer(document, player, { stepBudget: 1 });
    expect(exhausted.current?.type).toBe("error");
    if (exhausted.current?.type === "error") expect(exhausted.current.error.kind).toBe("step-limit-exceeded");
  });
});
