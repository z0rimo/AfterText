import { describe, expect, it } from "vitest";
import { compile } from "@aftertext/compiler";
import type { StoryDocument } from "@aftertext/compiler";
import { advancePlayer, createPlayer, selectPlayerChoice } from "../src/index.js";
import type { PlayerState } from "../src/index.js";
import { restorePlayer } from "../src/restore-player.js";
import { snapshotPlayer } from "../src/snapshot-player.js";
import type { PlayerSnapshot } from "../src/snapshot-types.js";

/**
 * True end-to-end Save/Restore conformance (docs/CORE_SPEC.md Section
 * 33.20): the fresh-recompile proof, no-double-effect, the mandatory
 * Choice Reader-Memory-divergence test, and the progressive-error
 * false-exposure test, each driven only through the public
 * createPlayer/advancePlayer/selectPlayerChoice/snapshotPlayer/
 * restorePlayer surface.
 */

function compileDoc(source: string): StoryDocument {
  const result = compile(source);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  return result.document;
}

/** Round-trips `player`'s snapshot through JSON, against a SEPARATELY, freshly compiled document B. */
function roundTripFreshDocument(source: string, player: PlayerState): { readonly documentB: StoryDocument; readonly parsed: unknown } {
  const documentA = compileDoc(source);
  const snapshot = snapshotPlayer(documentA, player);
  const parsed = JSON.parse(JSON.stringify(snapshot)) as unknown;
  const documentB = compileDoc(source);
  expect(documentB).not.toBe(documentA);
  return { documentB, parsed };
}

function textOf(player: PlayerState): string {
  if (player.current?.type === "content" && player.current.block.type === "Paragraph") {
    return player.current.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
  }
  throw new Error(`expected content, got ${player.current?.type}`);
}

describe("fresh-recompile conformance — every suspension kind", () => {
  it("content: resolved AST comes from document B, continuation resumes correctly", () => {
    const source = "@scene s\nFirst.\n\nSecond.\n";
    const documentA = compileDoc(source);
    const suspended = advancePlayer(documentA, createPlayer(documentA));
    expect(textOf(suspended)).toBe("First.");

    const { documentB, parsed } = roundTripFreshDocument(source, suspended);
    const restored = restorePlayer(documentB, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");
    const restoredCurrent = restored.state.current;
    if (restoredCurrent?.type === "content") {
      expect(documentB.scenes.some((s) => s.blocks.includes(restoredCurrent.block))).toBe(true);
    }

    const next = advancePlayer(documentB, restored.state);
    expect(textOf(next)).toBe("Second.");
  });

  it("dialogue: speaker/content come from document B", () => {
    const source = "@scene s\n@say speaker=Alice\nHello.\n\nAfter.\n";
    const documentA = compileDoc(source);
    const suspended = advancePlayer(documentA, createPlayer(documentA));
    expect(suspended.current?.type).toBe("dialogue");

    const { documentB, parsed } = roundTripFreshDocument(source, suspended);
    const restored = restorePlayer(documentB, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");
    expect(restored.state.current).toEqual({
      type: "dialogue",
      speaker: "Alice",
      content: [{ type: "Text", value: "Hello.", span: expect.anything() }]
    });

    const next = advancePlayer(documentB, restored.state);
    expect(textOf(next)).toBe("After.");
  });

  it("presentation: command comes from document B, no application occurs", () => {
    const source = "@scene s\n@background room.jpg\nAfter.\n";
    const documentA = compileDoc(source);
    const suspended = advancePlayer(documentA, createPlayer(documentA));
    expect(suspended.current?.type).toBe("presentation");

    const { documentB, parsed } = roundTripFreshDocument(source, suspended);
    const restored = restorePlayer(documentB, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");
    expect(restored.state.current).toEqual({ type: "presentation", command: { type: "Background", image: "room.jpg" } });

    const next = advancePlayer(documentB, restored.state);
    expect(textOf(next)).toBe("After.");
  });

  it("choice: persisted items reused verbatim, filtering never re-run, navigates correctly on B", () => {
    const source = ["@scene s", "@choice", "- Go -> elsewhere", "@end", "", "@scene elsewhere", "There."].join("\n");
    const documentA = compileDoc(source);
    const suspended = advancePlayer(documentA, createPlayer(documentA));
    expect(suspended.current?.type).toBe("choice");

    const { documentB, parsed } = roundTripFreshDocument(source, suspended);
    const restored = restorePlayer(documentB, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");
    expect(restored.state.current).toEqual({ type: "choice", items: [{ index: 0, text: "Go", target: "elsewhere" }] });

    const navigated = selectPlayerChoice(documentB, restored.state, 0);
    expect(navigated.current).toEqual({ type: "navigation", from: "s", to: "elsewhere" });
    const next = advancePlayer(documentB, navigated);
    expect(textOf(next)).toBe("There.");
  });

  it("error: cursor reconstructed against document B, span never retained", () => {
    const source = ["---", "state:", "  divisor: 0", "---", "@scene s", "@set a = 10 / divisor", "Hi."].join("\n");
    const documentA = compileDoc(source);
    const failed = advancePlayer(documentA, createPlayer(documentA));
    expect(failed.current?.type).toBe("error");
    if (failed.current?.type === "error") expect(failed.current.error.span).toBeDefined();

    const { documentB, parsed } = roundTripFreshDocument(source, failed);
    const restored = restorePlayer(documentB, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");
    expect(restored.state.current).toEqual({ type: "error", error: { kind: "division-by-zero", message: expect.any(String) } });
    if (restored.state.current?.type === "error") expect(restored.state.current.error.span).toBeUndefined();

    const retried = advancePlayer(documentB, { ...restored.state, runtimeState: { ...restored.state.runtimeState, story: { divisor: 1 } } });
    expect(textOf(retried)).toBe("Hi.");
  });

  it("notStarted/navigation/completed round-trip against document B with the no-position sentinel", () => {
    const source = ["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A."].join("\n");

    // not started
    {
      const documentA = compileDoc(source);
      const fresh = createPlayer(documentA);
      const { documentB, parsed } = roundTripFreshDocument(source, fresh);
      const restored = restorePlayer(documentB, parsed);
      expect(restored).toEqual({ ok: true, state: createPlayer(documentB) });
    }

    // navigation
    {
      const documentA = compileDoc(source);
      const suspended = advancePlayer(documentA, createPlayer(documentA));
      const navigated = selectPlayerChoice(documentA, suspended, 0);
      const { documentB, parsed } = roundTripFreshDocument(source, navigated);
      const restored = restorePlayer(documentB, parsed);
      expect(restored.ok).toBe(true);
      if (restored.ok) {
        expect(restored.state.current).toEqual({ type: "navigation", from: "s", to: "a" });
        expect(restored.state.cursor).toEqual([]);
        const next = advancePlayer(documentB, restored.state);
        expect(textOf(next)).toBe("A.");
      }
    }

    // completed
    {
      const simpleSource = "@scene s\nHi.\n";
      const documentA = compileDoc(simpleSource);
      const content = advancePlayer(documentA, createPlayer(documentA));
      const completed = advancePlayer(documentA, content);
      const { documentB, parsed } = roundTripFreshDocument(simpleSource, completed);
      const restored = restorePlayer(documentB, parsed);
      expect(restored).toEqual({ ok: true, state: { ...completed, runtimeState: expect.anything() } });
    }
  });
});

describe("no-double-effect", () => {
  it("@set is not re-executed across snapshot/restore/continue", () => {
    const source = ["@scene s", "@set a = 1", "Hi.", "", "After."].join("\n");
    const documentA = compileDoc(source);
    const content = advancePlayer(documentA, createPlayer(documentA));
    expect(content.runtimeState.story).toEqual({ a: 1 });

    const { documentB, parsed } = roundTripFreshDocument(source, content);
    const restored = restorePlayer(documentB, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");
    expect(restored.state.runtimeState.story).toEqual({ a: 1 });

    const next = advancePlayer(documentB, restored.state);
    expect(textOf(next)).toBe("After.");
    expect(next.runtimeState.story).toEqual({ a: 1 }); // still exactly once
  });

  it("scene visit and Variant seen are not re-recorded across snapshot/restore/continue", () => {
    const source = ["@scene s", "@variant mood", "@when true", "First.", "", "Second.", "@end"].join("\n");
    const documentA = compileDoc(source);
    const first = advancePlayer(documentA, createPlayer(documentA));
    expect(first.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
    expect(first.runtimeState.reader.seenVariants.mood?.seenCount).toBe(1);

    const { documentB, parsed } = roundTripFreshDocument(source, first);
    const restored = restorePlayer(documentB, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");

    const next = advancePlayer(documentB, restored.state);
    expect(textOf(next)).toBe("Second.");
    expect(next.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
    expect(next.runtimeState.reader.seenVariants.mood?.seenCount).toBe(1);
  });

  it("navigation is not replayed — restore never calls advance() merely to derive current", () => {
    const source = ["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A."].join("\n");
    const documentA = compileDoc(source);
    const suspended = advancePlayer(documentA, createPlayer(documentA));
    const navigated = selectPlayerChoice(documentA, suspended, 0);
    expect(navigated.current).toEqual({ type: "navigation", from: "s", to: "a" });
    // "s" already qualified when the Choice itself suspended; "a" is not yet visited.
    expect(navigated.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });

    const { documentB, parsed } = roundTripFreshDocument(source, navigated);
    const restored = restorePlayer(documentB, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");
    expect(restored.state.current).toEqual({ type: "navigation", from: "s", to: "a" });
    // Restore itself did not advance into "a" — only "s" (already-recorded before the snapshot) is present.
    expect(restored.state.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
  });
});

describe("Choice Reader Memory divergence (mandatory, docs/CORE_SPEC.md Section 33.7/33.9)", () => {
  it("restored Choice uses the originally-offered item set, not a naive re-filter against the snapshotted ReaderState", () => {
    // The item's condition depends on visited("s") — the SAME scene whose
    // exposure is recorded at this very Choice suspension (Choice itself
    // qualifies, Section 17.9). Live: filterChoiceItems runs BEFORE
    // recordObservableExposure, so it sees visited("s") still false and
    // excludes the item. The snapshotted RuntimeState, taken AFTER
    // recordObservableExposure, has visited("s") already true — so a
    // naive re-filter against it would WRONGLY include the item.
    const source = ['@scene s', '@choice', "- Always -> a", '- OnlyIfRevisited -> b if visited("s")', "@end", "@scene a", "A.", "@scene b", "B."].join(
      "\n"
    );
    const documentA = compileDoc(source);
    const suspended = advancePlayer(documentA, createPlayer(documentA));
    expect(suspended.current).toEqual({ type: "choice", items: [{ index: 0, text: "Always", target: "a" }] });
    expect(suspended.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } }); // already true in the snapshotted state

    const { documentB, parsed } = roundTripFreshDocument(source, suspended);
    const restored = restorePlayer(documentB, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");
    // Must still be exactly the originally-offered single item, not the
    // two-item set a live re-filter against the snapshotted state would produce.
    expect(restored.state.current).toEqual({ type: "choice", items: [{ index: 0, text: "Always", target: "a" }] });
  });
});

describe("progressive error false-exposure conformance (mandatory, docs/CORE_SPEC.md Section 33.4/33.9/33.20)", () => {
  it("a false exposure flag survives snapshot/restore; the later qualifying result records exactly once", () => {
    const source = [
      "---",
      "state:",
      "  trust: 1",
      "  divisor: 0",
      "---",
      "@scene s",
      "@variant mood",
      "@when trust == 1",
      "@set x = 10 / divisor",
      "Hi.",
      "@end"
    ].join("\n");
    const documentA = compileDoc(source);
    const failed = advancePlayer(documentA, createPlayer(documentA));
    expect(failed.current?.type).toBe("error");
    expect(failed.runtimeState.reader.visitedScenes).toEqual({});
    expect(failed.runtimeState.reader.seenVariants).toEqual({});

    const { documentB, parsed } = roundTripFreshDocument(source, failed);
    const restored = restorePlayer(documentB, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");

    const retried = advancePlayer(documentB, {
      ...restored.state,
      runtimeState: { ...restored.state.runtimeState, story: { trust: 1, divisor: 1 } }
    });
    expect(textOf(retried)).toBe("Hi.");
    expect(retried.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } }); // exactly once, not zero
    expect(retried.runtimeState.reader.seenVariants).toEqual({
      mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 1 } // exactly once, not twice
    });
  });
});

describe("caller-mutation independence", () => {
  it("mutating the parsed snapshot after restore never affects the restored PlayerState", () => {
    const source = ["@scene s", "@variant mood", "@when true", "@choice", "- Go -> a", "@end", "@end", "@scene a", "A."].join("\n");
    const documentA = compileDoc(source);
    const suspended = advancePlayer(documentA, createPlayer(documentA));
    expect(suspended.current?.type).toBe("choice");

    const snapshot: PlayerSnapshot = snapshotPlayer(documentA, suspended);
    const parsed = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
    const restored = restorePlayer(documentA, parsed);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("unreachable");
    const before = JSON.stringify(restored.state);

    const runtimeState = parsed.runtimeState as Record<string, unknown>;
    (runtimeState.story as Record<string, unknown>).injected = true;
    const reader = runtimeState.reader as Record<string, unknown>;
    (reader.visitedScenes as Record<string, unknown>).injected = { visitCount: 999 };
    (reader.seenVariants as Record<string, unknown>).injected = { firstSeenBranchId: "x", lastSeenBranchId: "x", seenCount: 1 };
    (runtimeState.navigation as Record<string, unknown>).sceneId = "a";
    (parsed.current as Record<string, unknown>).type = "mutated";
    (parsed.position as Record<string, unknown>).sceneId = "a";
    ((parsed.current as Record<string, unknown>).items as unknown[])?.push?.({ text: "Injected", target: "a" });

    expect(JSON.stringify(restored.state)).toBe(before);
  });
});
