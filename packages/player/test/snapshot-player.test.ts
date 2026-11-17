import { describe, expect, it } from "vitest";
import { advancePlayer, selectPlayerChoice } from "../src/index.js";
import { snapshotPlayer } from "../src/snapshot-player.js";
import { computeDocumentFingerprint } from "../src/document-fingerprint.js";
import { freshPlayer } from "./helpers.js";

describe("snapshotPlayer", () => {
  it("formatVersion is 1 and documentFingerprint matches the document", () => {
    const { document, player } = freshPlayer("@scene s\nHi.\n");
    const snapshot = snapshotPlayer(document, player);
    expect(snapshot.formatVersion).toBe(1);
    expect(snapshot.documentFingerprint).toBe(computeDocumentFingerprint(document));
  });

  it("may share runtimeState object identity with the live PlayerState (no deep clone)", () => {
    const { document, player } = freshPlayer("@scene s\nHi.\n");
    const advanced = advancePlayer(document, player);
    const snapshot = snapshotPlayer(document, advanced);
    expect(snapshot.runtimeState).toBe(advanced.runtimeState);
  });

  it("notStarted: position is the no-position sentinel, current is notStarted", () => {
    const { document, player } = freshPlayer("@scene s\nHi.\n");
    const snapshot = snapshotPlayer(document, player);
    expect(snapshot.position).toEqual({ kind: "none" });
    expect(snapshot.current).toEqual({ type: "notStarted" });
  });

  it("content: position is a real structural position, current is the discriminator only", () => {
    const { document, player } = freshPlayer("@scene s\nHi.\n");
    const advanced = advancePlayer(document, player);
    const snapshot = snapshotPlayer(document, advanced);
    expect(snapshot.position).not.toEqual({ kind: "none" });
    expect(snapshot.current).toEqual({ type: "content" });
  });

  it("choice: position is real, current carries persisted {text,target}[] only", () => {
    const source = ["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A."].join("\n");
    const { document, player } = freshPlayer(source);
    const advanced = advancePlayer(document, player);
    const snapshot = snapshotPlayer(document, advanced);
    expect(snapshot.position).not.toEqual({ kind: "none" });
    expect(snapshot.current).toEqual({ type: "choice", items: [{ text: "Go", target: "a" }] });
  });

  it("navigation: position is the no-position sentinel", () => {
    const source = ["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A."].join("\n");
    const { document, player } = freshPlayer(source);
    const suspended = advancePlayer(document, player);
    const navigated = selectPlayerChoice(document, suspended, 0);
    const snapshot = snapshotPlayer(document, navigated);
    expect(snapshot.position).toEqual({ kind: "none" });
    expect(snapshot.current).toEqual({ type: "navigation", from: "s", to: "a" });
  });

  it("completed: position is the no-position sentinel", () => {
    const { document, player } = freshPlayer("@scene s\nHi.\n");
    const content = advancePlayer(document, player);
    const completed = advancePlayer(document, content);
    const snapshot = snapshotPlayer(document, completed);
    expect(snapshot.position).toEqual({ kind: "none" });
    expect(snapshot.current).toEqual({ type: "completed" });
  });

  it("error: position is real (not the sentinel), current carries kind/message only", () => {
    const source = ["---", "state:", "  divisor: 0", "---", "@scene s", "@set a = 10 / divisor", "Hi."].join("\n");
    const { document, player } = freshPlayer(source);
    const failed = advancePlayer(document, player);
    expect(failed.current?.type).toBe("error");
    const snapshot = snapshotPlayer(document, failed);
    expect(snapshot.position).not.toEqual({ kind: "none" });
    expect(snapshot.current).toEqual({ type: "error", kind: "division-by-zero", message: expect.any(String) });
  });
});
