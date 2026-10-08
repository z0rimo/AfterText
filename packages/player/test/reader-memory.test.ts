import { describe, expect, it } from "vitest";
import { advancePlayer } from "../src/index.js";
import { freshPlayer } from "./helpers.js";

/**
 * Proves Reader Memory evolves naturally through runtime execution with no
 * Player-specific logic (docs/CORE_SPEC.md Section 18.11) — Player only
 * threads the RuntimeState `advance()` already returns.
 */

describe("Reader Memory through Player", () => {
  const SOURCE = [
    "@scene a",
    "You are in room A.",
    "@goto b",
    "",
    "@scene b",
    '@if visited("a")',
    "You remember being in room A.",
    "@else",
    "This place feels unfamiliar.",
    "@end"
  ].join("\n");

  it("experiencing Scene A through Player records the visit in runtime ReaderState", () => {
    const { document, player } = freshPlayer(SOURCE);
    const roomA = advancePlayer(document, player);
    expect(roomA.runtimeState.reader.visitedScenes).toEqual({ a: { visitCount: 1 } });
  });

  it("a later visited(\"a\") query, reached only through Player, sees that memory and changes the branch", () => {
    const { document, player } = freshPlayer(SOURCE);

    const roomA = advancePlayer(document, player);
    const navigated = advancePlayer(document, roomA);
    expect(navigated.current).toEqual({ type: "navigation", from: "a", to: "b" });

    const roomB = advancePlayer(document, navigated);
    if (roomB.current?.type === "content" && roomB.current.block.type === "Paragraph") {
      const text = roomB.current.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
      expect(text).toBe("You remember being in room A.");
    } else {
      throw new Error(`expected content, got ${roomB.current?.type}`);
    }
  });

  it("bypassing Scene A entirely leaves visited(\"a\") false", () => {
    const { document, player } = freshPlayer(SOURCE);
    const atB = { ...player, runtimeState: { ...player.runtimeState, navigation: { sceneId: "b" } } };

    const roomB = advancePlayer(document, atB);
    if (roomB.current?.type === "content" && roomB.current.block.type === "Paragraph") {
      const text = roomB.current.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
      expect(text).toBe("This place feels unfamiliar.");
    } else {
      throw new Error(`expected content, got ${roomB.current?.type}`);
    }
  });
});
