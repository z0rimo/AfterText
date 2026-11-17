import { describe, expect, it } from "vitest";
import { advancePlayer, createPlayer } from "../src/index.js";
import { restorePlayer } from "../src/restore-player.js";
import { snapshotPlayer } from "../src/snapshot-player.js";
import type { PlayerSnapshot } from "../src/snapshot-types.js";
import { compileDoc } from "./helpers.js";

/**
 * Untrusted-input validation matrix (docs/CORE_SPEC.md Section 33.8).
 * Every case here must return `{ ok: false, error }` — never throw —
 * with the exact `PlayerRestoreError.kind` the locked, numbered
 * validation order requires.
 */

const SOURCE = ["@scene s", "@variant mood", "@when true", "Happy.", "@end", "@scene t", "There."].join("\n");

function freshSnapshot(): { readonly document: ReturnType<typeof compileDoc>; readonly snapshot: PlayerSnapshot } {
  const document = compileDoc(SOURCE);
  const player = createPlayer(document);
  const advanced = advancePlayer(document, player);
  return { document, snapshot: snapshotPlayer(document, advanced) };
}

describe("top-level validation ordering", () => {
  const { document, snapshot } = freshSnapshot();

  it("non-object snapshot -> malformedSnapshot", () => {
    for (const value of [null, "not an object", 42, [], undefined]) {
      expect(restorePlayer(document, value)).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
    }
  });

  it("missing formatVersion -> unsupportedFormatVersion", () => {
    const { formatVersion, ...rest } = snapshot;
    expect(restorePlayer(document, rest)).toEqual({ ok: false, error: { kind: "unsupportedFormatVersion" } });
  });

  it("wrong-type formatVersion -> unsupportedFormatVersion", () => {
    expect(restorePlayer(document, { ...snapshot, formatVersion: "1" })).toEqual({
      ok: false,
      error: { kind: "unsupportedFormatVersion" }
    });
  });

  it("unknown formatVersion -> unsupportedFormatVersion", () => {
    expect(restorePlayer(document, { ...snapshot, formatVersion: 2 })).toEqual({
      ok: false,
      error: { kind: "unsupportedFormatVersion" }
    });
  });

  it("non-string documentFingerprint -> malformedSnapshot (not a mismatch)", () => {
    expect(restorePlayer(document, { ...snapshot, documentFingerprint: 7 })).toEqual({
      ok: false,
      error: { kind: "malformedSnapshot", reason: expect.any(String) }
    });
  });

  it("valid string documentFingerprint that mismatches -> documentMismatch", () => {
    expect(restorePlayer(document, { ...snapshot, documentFingerprint: "fnv1a64:0000000000000000" })).toEqual({
      ok: false,
      error: { kind: "documentMismatch" }
    });
  });
});

describe("document mismatch (one semantic change at a time)", () => {
  const { snapshot } = freshSnapshot();

  function mismatchAgainst(mutatedSource: string): void {
    const mutatedDocument = compileDoc(mutatedSource);
    expect(restorePlayer(mutatedDocument, snapshot)).toEqual({ ok: false, error: { kind: "documentMismatch" } });
  }

  it("Dialogue text changed elsewhere in the document still mismatches", () => {
    mismatchAgainst(["@scene s", "@variant mood", "@when true", "Happy.", "@end", "@scene t", "@say speaker=A\nHi.\n"].join("\n"));
  });

  it("scene order changed", () => {
    mismatchAgainst(["@scene t", "There.", "", "@scene s", "@variant mood", "@when true", "Happy.", "@end"].join("\n"));
  });

  it("Variant id changed", () => {
    mismatchAgainst(["@scene s", "@variant tone", "@when true", "Happy.", "@end", "@scene t", "There."].join("\n"));
  });
});

describe("RuntimeState malformed-input tests", () => {
  const { document, snapshot } = freshSnapshot();

  function expectMalformed(runtimeState: unknown): void {
    expect(restorePlayer(document, { ...snapshot, runtimeState })).toEqual({
      ok: false,
      error: { kind: "malformedSnapshot", reason: expect.any(String) }
    });
  }

  it("rejects NaN/Infinity/-Infinity/object/array story values", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, {}, []]) {
      expectMalformed({ ...snapshot.runtimeState, story: { a: bad } });
    }
  });

  it("rejects a non-positive/fractional/non-finite visitCount", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectMalformed({ ...snapshot.runtimeState, reader: { visitedScenes: { s: { visitCount: bad } }, seenVariants: {} } });
    }
  });

  it("rejects a non-positive/fractional/non-finite seenCount", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectMalformed({
        ...snapshot.runtimeState,
        reader: {
          visitedScenes: {},
          seenVariants: { mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: bad } }
        }
      });
    }
  });

  it("rejects seenCount===1 with different first/last branch", () => {
    expectMalformed({
      ...snapshot.runtimeState,
      reader: {
        visitedScenes: {},
        seenVariants: { mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:1", seenCount: 1 } }
      }
    });
  });

  it("rejects an unknown visited scene, unknown Variant, and foreign branch ids", () => {
    expectMalformed({ ...snapshot.runtimeState, reader: { visitedScenes: { ghost: { visitCount: 1 } }, seenVariants: {} } });
    expectMalformed({
      ...snapshot.runtimeState,
      reader: { visitedScenes: {}, seenVariants: { ghost: { firstSeenBranchId: "x", lastSeenBranchId: "x", seenCount: 1 } } }
    });
    expectMalformed({
      ...snapshot.runtimeState,
      reader: {
        visitedScenes: {},
        seenVariants: { mood: { firstSeenBranchId: "not-a-real-branch", lastSeenBranchId: "mood:0", seenCount: 2 } }
      }
    });
    expectMalformed({
      ...snapshot.runtimeState,
      reader: {
        visitedScenes: {},
        seenVariants: { mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "not-a-real-branch", seenCount: 2 } }
      }
    });
  });

  it("rejects an unknown navigation scene", () => {
    expectMalformed({ ...snapshot.runtimeState, navigation: { sceneId: "ghost" } });
  });
});

describe("prototype-safety", () => {
  const PROTOTYPE_NAMES = ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "valueOf"];
  const { document, snapshot: liveSnapshot } = (() => {
    const d = compileDoc(SOURCE);
    const p = createPlayer(d);
    const advanced = advancePlayer(d, p); // current becomes "content" — bypasses notStarted's exact-equality requirement
    expect(advanced.current?.type).toBe("content");
    return { document: d, snapshot: snapshotPlayer(d, advanced) };
  })();

  it.each(PROTOTYPE_NAMES)("accepts %s as an ordinary story key, as an own data property, with no prototype pollution", (key) => {
    const withKey = { ...liveSnapshot, runtimeState: { ...liveSnapshot.runtimeState, story: { [key]: 1 } } };
    const restored = restorePlayer(document, withKey);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(Object.hasOwn(restored.state.runtimeState.story, key)).toBe(true);
      expect(restored.state.runtimeState.story[key]).toBe(1);
      expect(Object.getPrototypeOf(restored.state.runtimeState.story)).toBe(Object.prototype);
      expect(Object.getPrototypeOf({})).toBe(Object.prototype); // no global pollution occurred
    }
  });

  it.each(PROTOTYPE_NAMES)("accepts %s as a genuine, live visited-scene id with no prototype pollution", (key) => {
    const sceneSource = [`@scene ${key}`, "Hi."].join("\n");
    const sceneDocument = compileDoc(sceneSource);
    const player = createPlayer(sceneDocument);
    const advanced = advancePlayer(sceneDocument, player);
    expect(advanced.runtimeState.reader.visitedScenes).toEqual({ [key]: { visitCount: 1 } });

    const restored = restorePlayer(sceneDocument, snapshotPlayer(sceneDocument, advanced));
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(Object.hasOwn(restored.state.runtimeState.reader.visitedScenes, key)).toBe(true);
      expect(restored.state.runtimeState.reader.visitedScenes[key]).toEqual({ visitCount: 1 });
      expect(Object.getPrototypeOf(restored.state.runtimeState.reader.visitedScenes)).toBe(Object.prototype);
    }
  });

  it("rejects a story object whose own prototype was reassigned (not Object.prototype/null)", () => {
    const polluted = Object.create({ polluted: true });
    polluted.a = 1;
    const restored = restorePlayer(document, { ...liveSnapshot, runtimeState: { ...liveSnapshot.runtimeState, story: polluted } });
    expect(restored).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });
});

describe("current/position classification", () => {
  const { document, snapshot } = freshSnapshot();

  it("malformed current descriptor -> malformedSnapshot", () => {
    expect(restorePlayer(document, { ...snapshot, current: { type: "mystery" } })).toEqual({
      ok: false,
      error: { kind: "malformedSnapshot", reason: expect.any(String) }
    });
  });

  it("non-JSON position -> malformedSnapshot", () => {
    expect(restorePlayer(document, { ...snapshot, position: undefined })).toEqual({
      ok: false,
      error: { kind: "malformedSnapshot", reason: expect.any(String) }
    });
  });

  it("Runtime position decode failure -> malformedSnapshot (not unresolvablePosition)", () => {
    expect(restorePlayer(document, { ...snapshot, position: { sceneId: "s", frames: [{ kind: "scene", index: -1, visitRecorded: true }] } })).toEqual({
      ok: false,
      error: { kind: "malformedSnapshot", reason: expect.any(String) }
    });
  });

  it("position resolves but the resolved AST block type is wrong for the current descriptor -> unresolvablePosition", () => {
    // "content" current against a position that actually resolves to a Variant's own frame structure mismatched to dialogue would be
    // contrived to construct directly; simplest reliable case: ask for "dialogue" against a position that really produced a Paragraph.
    const paragraphDocument = compileDoc("@scene s\nHi.\n");
    const paragraphPlayer = createPlayer(paragraphDocument);
    const advanced = advancePlayer(paragraphDocument, paragraphPlayer);
    const paragraphSnapshot = snapshotPlayer(paragraphDocument, advanced);
    const mismatched = { ...paragraphSnapshot, current: { type: "dialogue" } };
    expect(restorePlayer(paragraphDocument, mismatched)).toEqual({
      ok: false,
      error: { kind: "unresolvablePosition", reason: expect.any(String) }
    });
  });
});

describe("notStarted exactness", () => {
  const document = compileDoc("@scene s\nHi.\n");
  const fresh = createPlayer(document);
  const snapshot = snapshotPlayer(document, fresh);

  it("accepts the genuine fresh state", () => {
    expect(restorePlayer(document, snapshot)).toEqual({ ok: true, state: fresh });
  });

  it("rejects a modified StoryState", () => {
    const tampered = { ...snapshot, runtimeState: { ...snapshot.runtimeState, story: { injected: true } } };
    expect(restorePlayer(document, tampered)).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });

  it("rejects a non-empty visitedScenes", () => {
    const tampered = {
      ...snapshot,
      runtimeState: { ...snapshot.runtimeState, reader: { visitedScenes: { s: { visitCount: 1 } }, seenVariants: {} } }
    };
    expect(restorePlayer(document, tampered)).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });

  it("rejects a non-entry navigation scene", () => {
    const twoScenes = compileDoc("@scene s\nHi.\n\n@scene t\nThere.\n");
    const freshTwoScenes = createPlayer(twoScenes);
    const snapshotTwoScenes = snapshotPlayer(twoScenes, freshTwoScenes);
    const tampered = { ...snapshotTwoScenes, runtimeState: { ...snapshotTwoScenes.runtimeState, navigation: { sceneId: "t" } } };
    expect(restorePlayer(twoScenes, tampered)).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });
});

describe("completed consistency", () => {
  it("rejects a completed snapshot missing the current scene's visit entry", () => {
    const document = compileDoc("@scene s\nHi.\n");
    const player = createPlayer(document);
    const content = advancePlayer(document, player);
    const completed = advancePlayer(document, content);
    expect(completed.current).toEqual({ type: "completed" });

    const snapshot = snapshotPlayer(document, completed);
    const tampered = { ...snapshot, runtimeState: { ...snapshot.runtimeState, reader: { visitedScenes: {}, seenVariants: {} } } };
    expect(restorePlayer(document, tampered)).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });
});

describe("navigation tests", () => {
  const source = ["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A."].join("\n");
  const document = compileDoc(source);

  function navigatedSnapshot() {
    const player = createPlayer(document);
    const suspended = advancePlayer(document, player);
    return suspended;
  }

  const REJECTED_NAVIGATION_CASES: readonly { readonly name: string; readonly from: string; readonly to: string; readonly navigationSceneId: string }[] = [
    { name: "rejects current.to !== runtimeState.navigation.sceneId", from: "s", to: "a", navigationSceneId: "s" },
    { name: "rejects an unknown from scene", from: "ghost", to: "a", navigationSceneId: "a" }
  ];

  it.each(REJECTED_NAVIGATION_CASES)("$name", ({ from, to, navigationSceneId }) => {
    const suspended = navigatedSnapshot();
    const snapshot = snapshotPlayer(document, suspended);
    const navigated = {
      ...snapshot,
      current: { type: "navigation", from, to },
      runtimeState: { ...snapshot.runtimeState, navigation: { sceneId: navigationSceneId } }
    };
    expect(restorePlayer(document, navigated)).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });

  it("does not call fromCursorPosition for navigation (no structural decode) and restores INITIAL_CURSOR", () => {
    const suspended = navigatedSnapshot();
    const snapshot = snapshotPlayer(document, suspended);
    const navigated = {
      ...snapshot,
      current: { type: "navigation", from: "s", to: "a" },
      runtimeState: { ...snapshot.runtimeState, navigation: { sceneId: "a" } }
    };
    const restored = restorePlayer(document, navigated);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.state.cursor).toEqual([]);
  });
});

describe("recursive/cyclic JSON graph safety (Codex-reported P2, docs/CORE_SPEC.md Section 33.8)", () => {
  const { document, snapshot } = freshSnapshot();

  it("rejects a self-referential (cyclic) object in position without throwing", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => restorePlayer(document, { ...snapshot, position: cyclic })).not.toThrow();
    expect(restorePlayer(document, { ...snapshot, position: cyclic })).toEqual({
      ok: false,
      error: { kind: "malformedSnapshot", reason: expect.any(String) }
    });
  });

  it("rejects a self-referential (cyclic) array in current without throwing", () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => restorePlayer(document, { ...snapshot, current: cyclic })).not.toThrow();
    expect(restorePlayer(document, { ...snapshot, current: cyclic })).toEqual({
      ok: false,
      error: { kind: "malformedSnapshot", reason: expect.any(String) }
    });
  });

  it("rejects a pathologically deeply nested (but acyclic) array without throwing", () => {
    let deep: unknown = "leaf";
    for (let i = 0; i < 100_000; i++) deep = [deep];
    expect(() => restorePlayer(document, { ...snapshot, position: deep })).not.toThrow();
    expect(restorePlayer(document, { ...snapshot, position: deep })).toEqual({
      ok: false,
      error: { kind: "malformedSnapshot", reason: expect.any(String) }
    });
  });
});

describe("untrusted snapshot accessor safety (Codex-reported P2, docs/CORE_SPEC.md Section 33.8)", () => {
  const { document } = freshSnapshot();

  it("rejects a plain object with a throwing getter for formatVersion without propagating the exception", () => {
    const throwing: Record<string, unknown> = {};
    Object.defineProperty(throwing, "formatVersion", {
      get() {
        throw new Error("boom");
      },
      enumerable: true
    });
    expect(() => restorePlayer(document, throwing)).not.toThrow();
    expect(restorePlayer(document, throwing)).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });

  it("rejects a Proxy whose getPrototypeOf trap throws without propagating the exception", () => {
    const proxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("boom");
        }
      }
    );
    expect(() => restorePlayer(document, proxy)).not.toThrow();
    expect(restorePlayer(document, proxy)).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });

  it("rejects a Proxy whose get trap throws without propagating the exception", () => {
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error("boom");
        }
      }
    );
    expect(() => restorePlayer(document, proxy)).not.toThrow();
    expect(restorePlayer(document, proxy)).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });
});

describe("catch-handler safety for hostile thrown values (Codex-reported P2, docs/CORE_SPEC.md Section 33.8)", () => {
  const { document } = freshSnapshot();

  it("rejects a getter that throws a non-Error whose toString itself throws, without propagating either exception", () => {
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, "formatVersion", {
      get() {
        throw { toString: () => { throw new Error("second boom"); } }; // eslint-disable-line @typescript-eslint/no-throw-literal
      },
      enumerable: true
    });
    expect(() => restorePlayer(document, hostile)).not.toThrow();
    expect(restorePlayer(document, hostile)).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });

  it("rejects a getter that throws an Error-like object with a throwing message getter, without propagating either exception", () => {
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, "formatVersion", {
      get() {
        const errorLike = Object.create(Error.prototype);
        Object.defineProperty(errorLike, "message", {
          get() {
            throw new Error("second boom");
          }
        });
        throw errorLike;
      },
      enumerable: true
    });
    expect(() => restorePlayer(document, hostile)).not.toThrow();
    expect(restorePlayer(document, hostile)).toEqual({ ok: false, error: { kind: "malformedSnapshot", reason: expect.any(String) } });
  });
});

describe("read-once safety for validated untrusted fields (Codex-reported P2, docs/CORE_SPEC.md Section 33.8)", () => {
  const { document, snapshot } = freshSnapshot();

  it("reads visitedScenes[id].visitCount exactly once per restore, not once-to-validate and again-to-use", () => {
    let reads = 0;
    const hostileVisitedScenes = {
      s: {
        get visitCount() {
          reads++;
          return reads === 1 ? 1 : 999999.5;
        }
      }
    };
    const tampered = {
      ...snapshot,
      runtimeState: { ...snapshot.runtimeState, reader: { ...snapshot.runtimeState.reader, visitedScenes: hostileVisitedScenes } }
    };
    expect(() => restorePlayer(document, tampered)).not.toThrow();
    reads = 0;
    const restored = restorePlayer(document, tampered);
    expect(reads).toBe(1);
    if (restored.ok) expect(restored.state.runtimeState.reader.visitedScenes.s).toEqual({ visitCount: 1 });
  });

  it("reads navigation.sceneId exactly once per restore, not once-to-validate and again-to-use", () => {
    let reads = 0;
    const hostileNavigation = {
      get sceneId() {
        reads++;
        return reads === 1 ? "s" : "ghost-scene-that-does-not-exist";
      }
    };
    const tampered = { ...snapshot, runtimeState: { ...snapshot.runtimeState, navigation: hostileNavigation } };
    expect(() => restorePlayer(document, tampered)).not.toThrow();
    reads = 0;
    restorePlayer(document, tampered);
    expect(reads).toBe(1);
  });

  it("does not re-read a choice item's text/target a third time now that decodeChoiceItems captures each once", () => {
    let textReads = 0;
    let targetReads = 0;
    const hostileItem = {
      get text() {
        textReads++;
        return textReads <= 2 ? "Go" : 12345;
      },
      get target() {
        targetReads++;
        return targetReads <= 2 ? "a" : 67890;
      }
    };
    const tampered = { ...snapshot, current: { type: "choice", items: [hostileItem] } };
    expect(() => restorePlayer(document, tampered)).not.toThrow();
    textReads = 0;
    targetReads = 0;
    restorePlayer(document, tampered);
    expect(textReads).toBeLessThanOrEqual(2);
    expect(targetReads).toBeLessThanOrEqual(2);
  });

  it("reads snapshot.position and snapshot.current exactly once each per restore", () => {
    let positionReads = 0;
    let currentReads = 0;
    const tampered: Record<string, unknown> = {
      formatVersion: snapshot.formatVersion,
      documentFingerprint: snapshot.documentFingerprint,
      runtimeState: snapshot.runtimeState
    };
    Object.defineProperty(tampered, "position", {
      enumerable: true,
      get() {
        positionReads++;
        return positionReads === 1 ? snapshot.position : { poisoned: true };
      }
    });
    Object.defineProperty(tampered, "current", {
      enumerable: true,
      get() {
        currentReads++;
        return currentReads === 1 ? snapshot.current : { poisoned: true };
      }
    });
    expect(() => restorePlayer(document, tampered)).not.toThrow();
    positionReads = 0;
    currentReads = 0;
    restorePlayer(document, tampered);
    expect(positionReads).toBe(1);
    expect(currentReads).toBe(1);
  });
});

describe("bounded total work for shared (DAG-shaped) JSON graphs (Codex-reported P2, docs/CORE_SPEC.md Section 33.8)", () => {
  const { document, snapshot } = freshSnapshot();

  it("validates a deeply shared (but shallow) JSON graph quickly instead of doing exponential work", () => {
    let shared: unknown = "leaf";
    for (let i = 0; i < 40; i++) shared = [shared, shared];
    const start = performance.now();
    expect(() => restorePlayer(document, { ...snapshot, position: shared })).not.toThrow();
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(2000);
  });
});
