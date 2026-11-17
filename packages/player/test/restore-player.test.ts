import { describe, expect, it } from "vitest";
import { advancePlayer, selectPlayerChoice } from "../src/index.js";
import { restorePlayer } from "../src/restore-player.js";
import { snapshotPlayer } from "../src/snapshot-player.js";
import { freshPlayer } from "./helpers.js";

/**
 * Basic restorePlayer wiring: each suspension kind round-trips correctly
 * against the SAME document (the dedicated fresh-recompile proof lives in
 * save-restore-e2e.test.ts). This file proves the mechanics, not the
 * cross-document guarantee.
 */

describe("restorePlayer — round trip per suspension kind, same document", () => {
  it("notStarted", () => {
    const { document, player } = freshPlayer("@scene s\nHi.\n");
    const restored = restorePlayer(document, snapshotPlayer(document, player));
    expect(restored).toEqual({ ok: true, state: player });
  });

  it("content", () => {
    const { document, player } = freshPlayer("@scene s\nHi.\n");
    const advanced = advancePlayer(document, player);
    const restored = restorePlayer(document, snapshotPlayer(document, advanced));
    expect(restored).toEqual({ ok: true, state: advanced });
  });

  it("dialogue", () => {
    const { document, player } = freshPlayer("@scene s\n@say speaker=Alice\nHi.\n");
    const advanced = advancePlayer(document, player);
    const restored = restorePlayer(document, snapshotPlayer(document, advanced));
    expect(restored).toEqual({ ok: true, state: advanced });
  });

  it("presentation", () => {
    const { document, player } = freshPlayer("@scene s\n@background room.jpg\nHi.\n");
    const advanced = advancePlayer(document, player);
    const restored = restorePlayer(document, snapshotPlayer(document, advanced));
    expect(restored).toEqual({ ok: true, state: advanced });
  });

  it("choice", () => {
    const source = ["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A."].join("\n");
    const { document, player } = freshPlayer(source);
    const advanced = advancePlayer(document, player);
    const restored = restorePlayer(document, snapshotPlayer(document, advanced));
    expect(restored).toEqual({ ok: true, state: advanced });
  });

  it("navigation", () => {
    const source = ["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A."].join("\n");
    const { document, player } = freshPlayer(source);
    const suspended = advancePlayer(document, player);
    const navigated = selectPlayerChoice(document, suspended, 0);
    const restored = restorePlayer(document, snapshotPlayer(document, navigated));
    expect(restored).toEqual({ ok: true, state: navigated });
  });

  it("completed", () => {
    const { document, player } = freshPlayer("@scene s\nHi.\n");
    const content = advancePlayer(document, player);
    const completed = advancePlayer(document, content);
    const restored = restorePlayer(document, snapshotPlayer(document, completed));
    expect(restored).toEqual({ ok: true, state: completed });
  });

  it("error (span always dropped, even against the same document — see the dedicated span-removal proof too)", () => {
    const source = ["---", "state:", "  divisor: 0", "---", "@scene s", "@set a = 10 / divisor", "Hi."].join("\n");
    const { document, player } = freshPlayer(source);
    const failed = advancePlayer(document, player);
    expect(failed.current).toMatchObject({ type: "error", error: { kind: "division-by-zero" } });
    if (failed.current?.type === "error") expect(failed.current.error.span).toBeDefined();

    const restored = restorePlayer(document, snapshotPlayer(document, failed));
    expect(restored).toEqual({
      ok: true,
      state: { ...failed, current: { type: "error", error: { kind: "division-by-zero", message: expect.any(String) } } }
    });
  });
});

describe("restorePlayer — Choice item reconstruction never trusts a persisted index", () => {
  it("reconstructs AvailableChoiceItem.index fresh, by array position in the persisted (filtered) list — never the wire format, which has no index field at all", () => {
    // Item 1 is conditioned false and legitimately absent live; items 2/3
    // are offered. The persisted list is therefore [item2, item3], and
    // reconstruction must index them 0/1 by THEIR OWN array position, not
    // by any field a "tampered index" could even occupy (there is none —
    // {text,target}[] has no index field in the first place, Section 33.7).
    const source = [
      "---",
      "state:",
      "  show_first: false",
      "---",
      "@scene s",
      "@choice",
      "- First -> a if show_first",
      "- Second -> b",
      "- Third -> c",
      "@end",
      "@scene a",
      "A.",
      "@scene b",
      "B.",
      "@scene c",
      "C."
    ].join("\n");
    const { document, player } = freshPlayer(source);
    const advanced = advancePlayer(document, player);
    expect(advanced.current).toEqual({
      type: "choice",
      items: [
        { index: 0, text: "Second", target: "b" },
        { index: 1, text: "Third", target: "c" }
      ]
    });

    const restored = restorePlayer(document, snapshotPlayer(document, advanced));
    expect(restored).toEqual({ ok: true, state: advanced });
  });
});

describe("restorePlayer — Choice DP validation (docs/CORE_SPEC.md Section 33.8)", () => {
  function choiceState(source: string) {
    const { document, player } = freshPlayer(source);
    const advanced = advancePlayer(document, player);
    return { document, snapshot: snapshotPlayer(document, advanced) };
  }

  it("rejects empty persisted items", () => {
    const { document, snapshot } = choiceState(["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A."].join("\n"));
    const tampered = { ...snapshot, current: { type: "choice", items: [] } };
    expect(restorePlayer(document, tampered)).toEqual({ ok: false, error: { kind: "unresolvablePosition", reason: expect.any(String) } });
  });

  it("rejects an injected item not among the authored items", () => {
    const { document, snapshot } = choiceState(["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A."].join("\n"));
    const tampered = { ...snapshot, current: { type: "choice", items: [{ text: "Hacked", target: "a" }] } };
    expect(restorePlayer(document, tampered)).toEqual({ ok: false, error: { kind: "unresolvablePosition", reason: expect.any(String) } });
  });

  it("rejects a modified text or target", () => {
    const { document, snapshot } = choiceState(["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A."].join("\n"));
    expect(restorePlayer(document, { ...snapshot, current: { type: "choice", items: [{ text: "Different", target: "a" }] } }).ok).toBe(
      false
    );
    expect(restorePlayer(document, { ...snapshot, current: { type: "choice", items: [{ text: "Go", target: "different" }] } }).ok).toBe(
      false
    );
  });

  it("rejects reordered items", () => {
    const source = ["@scene s", "@choice", "- First -> a", "- Second -> b", "@end", "@scene a", "A.", "@scene b", "B."].join("\n");
    const { document, snapshot } = choiceState(source);
    const tampered = {
      ...snapshot,
      current: { type: "choice", items: [{ text: "Second", target: "b" }, { text: "First", target: "a" }] }
    };
    expect(restorePlayer(document, tampered).ok).toBe(false);
  });

  it("accepts a missing conditioned item", () => {
    const source = ["---", "state:", "  has_key: false", "---", "@scene s", "@choice", "- Open -> a", "- Key -> b if has_key", "@end", "@scene a", "A.", "@scene b", "B."].join(
      "\n"
    );
    const { document, snapshot } = choiceState(source);
    expect(snapshot.current).toEqual({ type: "choice", items: [{ text: "Open", target: "a" }] });
    expect(restorePlayer(document, snapshot).ok).toBe(true);
  });

  it("rejects a missing unconditional item", () => {
    const source = ["@scene s", "@choice", "- Open -> a", "- Run -> b", "@end", "@scene a", "A.", "@scene b", "B."].join("\n");
    const { document, snapshot } = choiceState(source);
    const tampered = { ...snapshot, current: { type: "choice", items: [{ text: "Open", target: "a" }] } };
    expect(restorePlayer(document, tampered)).toEqual({ ok: false, error: { kind: "unresolvablePosition", reason: expect.any(String) } });
  });

  it("accepts the full authored set", () => {
    const source = ["@scene s", "@choice", "- Open -> a", "- Run -> b", "@end", "@scene a", "A.", "@scene b", "B."].join("\n");
    const { document, snapshot } = choiceState(source);
    expect(restorePlayer(document, snapshot).ok).toBe(true);
  });

  it("accepts a valid conditioned subset in authored order", () => {
    const source = [
      "---",
      "state:",
      "  has_key: true",
      "---",
      "@scene s",
      "@choice",
      "- Open -> a",
      "- Key -> b if has_key",
      "- Run -> c",
      "@end",
      "@scene a",
      "A.",
      "@scene b",
      "B.",
      "@scene c",
      "C."
    ].join("\n");
    const { document, snapshot } = choiceState(source);
    expect(snapshot.current).toEqual({
      type: "choice",
      items: [
        { text: "Open", target: "a" },
        { text: "Key", target: "b" },
        { text: "Run", target: "c" }
      ]
    });
    expect(restorePlayer(document, snapshot).ok).toBe(true);
  });

  it("ACCEPTS a duplicate conditioned item followed by an unconditional duplicate, persisted as the single occurrence (the DP-vs-greedy proof)", () => {
    // authored: 1. "Go"->"x" (conditioned, false -> filtered out live)
    //           2. "Go"->"x" (unconditional -> always present)
    // A greedy left-to-right matcher would consume persisted[0] against
    // authored item #1 and then wrongly report mandatory item #2 missing.
    const source = [
      "---",
      "state:",
      "  show_first: false",
      "---",
      "@scene s",
      "@choice",
      "- Go -> x if show_first",
      "- Go -> x",
      "@end",
      "@scene x",
      "X."
    ].join("\n");
    const { document, snapshot } = choiceState(source);
    expect(snapshot.current).toEqual({ type: "choice", items: [{ text: "Go", target: "x" }] });
    expect(restorePlayer(document, snapshot).ok).toBe(true);
  });

  it("ACCEPTS a duplicate unconditional item followed by a conditioned duplicate, persisted once, since the conditioned one is legitimately absent", () => {
    // authored: 1. "Go"->"x" (unconditional -> must always be present)
    //           2. "Go"->"x" (conditioned, false -> filtered out live)
    // persisted [X] must still be accepted (it satisfies item #1; item #2
    // is legitimately absent) -- this is the ACCEPT half of the duplicate
    // pair; the next case proves the REJECT half.
    const source = [
      "---",
      "state:",
      "  show_second: false",
      "---",
      "@scene s",
      "@choice",
      "- Go -> x",
      "- Go -> x if show_second",
      "@end",
      "@scene x",
      "X."
    ].join("\n");
    const { document, snapshot } = choiceState(source);
    expect(snapshot.current).toEqual({ type: "choice", items: [{ text: "Go", target: "x" }] });
    expect(restorePlayer(document, snapshot).ok).toBe(true);
  });

  it("REJECTS persisted items missing a mandatory unconditional item even among duplicates", () => {
    const source = ["@scene s", "@choice", "- Go -> x", "- Go -> x", "@end", "@scene x", "X."].join("\n");
    const { document, snapshot } = choiceState(source);
    // Live result offers both (both unconditional); tamper down to only one.
    expect(snapshot.current).toEqual({
      type: "choice",
      items: [
        { text: "Go", target: "x" },
        { text: "Go", target: "x" }
      ]
    });
    const tampered = { ...snapshot, current: { type: "choice", items: [{ text: "Go", target: "x" }] } };
    expect(restorePlayer(document, tampered)).toEqual({ ok: false, error: { kind: "unresolvablePosition", reason: expect.any(String) } });
  });
});

describe("restorePlayer — invalid-choice-selection inherited cursor", () => {
  it("snapshot/restore of an error inherited from a content suspension (one-past-end cursor) preserves resumability", () => {
    const { document, player } = freshPlayer("@scene s\nOnly.\n");
    const content = advancePlayer(document, player);
    expect(content.current?.type).toBe("content");

    const invalidSelection = selectPlayerChoice(document, content, 0);
    expect(invalidSelection.current?.type).toBe("error");
    if (invalidSelection.current?.type === "error") {
      expect(invalidSelection.current.error.kind).toBe("invalid-choice-selection");
    }

    const snapshot = snapshotPlayer(document, invalidSelection);
    const restored = restorePlayer(document, snapshot);
    expect(restored).toEqual({ ok: true, state: invalidSelection });

    // Resuming from the restored state completes the scene, exactly as
    // resuming from the live one would have.
    if (restored.ok) {
      const completed = advancePlayer(document, restored.state);
      expect(completed.current).toEqual({ type: "completed" });
    }
  });
});
