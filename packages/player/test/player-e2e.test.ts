import { describe, expect, it } from "vitest";
import { compile } from "@aftertext/compiler";
import { advancePlayer, createPlayer, selectPlayerChoice } from "../src/index.js";
import type { PlayerState } from "../src/index.js";

/**
 * True end-to-end integration coverage for the Player Core: real AfterText
 * source text flowing through compile() -> createPlayer() ->
 * advancePlayer()/selectPlayerChoice(), using only the public compiler and
 * player APIs. No manual AST construction. Per-function unit coverage
 * lives in the other test files in this directory; this file exists to
 * catch a wiring defect no single unit test could.
 */

function textOf(player: PlayerState): string {
  if (player.current?.type === "content" && player.current.block.type === "Paragraph") {
    return player.current.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
  }
  throw new Error(`expected content, got ${player.current?.type}`);
}

describe("end-to-end: compile -> createPlayer -> advancePlayer -> Choice -> selectPlayerChoice -> navigation -> advancePlayer -> completed", () => {
  const SOURCE = [
    "@scene start",
    "Opening paragraph.",
    "@set has_key = true",
    "@if has_key",
    "You have the key.",
    "@end",
    "@choice",
    "- Open the door -> room",
    "@end",
    "",
    "@scene room",
    "You enter the room."
  ].join("\n");

  it("plays the whole story through the Player Core public API", () => {
    const result = compile(SOURCE);
    expect(result.hasErrors).toBe(false);
    const { document } = result;

    let player = createPlayer(document);
    expect(player.current).toBeNull();

    player = advancePlayer(document, player);
    expect(textOf(player)).toBe("Opening paragraph.");

    // @set + Conditional selection run automatically within this one call.
    player = advancePlayer(document, player);
    expect(textOf(player)).toBe("You have the key.");
    expect(player.runtimeState.story).toEqual({ has_key: true });

    player = advancePlayer(document, player);
    expect(player.current).toEqual({
      type: "choice",
      items: [{ index: 0, text: "Open the door", target: "room" }]
    });

    player = selectPlayerChoice(document, player, 0);
    expect(player.current).toEqual({ type: "navigation", from: "start", to: "room" });
    expect(player.runtimeState.navigation).toEqual({ sceneId: "room" });

    player = advancePlayer(document, player);
    expect(textOf(player)).toBe("You enter the room.");
    expect(player.runtimeState.reader.visitedScenes).toEqual({
      start: { visitCount: 1 },
      room: { visitCount: 1 }
    });

    player = advancePlayer(document, player);
    expect(player.current).toEqual({ type: "completed" });
  });
});
