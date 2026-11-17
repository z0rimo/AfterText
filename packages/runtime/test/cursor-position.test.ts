import { describe, expect, it } from "vitest";
import type { StoryBlock, StoryDocument } from "@aftertext/compiler";
import { advance, createRuntimeState, fromCursorPosition, selectChoice, toCursorPosition } from "../src/index.js";
import type { ExecutionStep, RuntimeState } from "../src/index.js";
import type { JsonValue } from "../src/execution/cursor-position.js";
import { compileDoc } from "./helpers.js";

/**
 * Structural cursor position encode/decode (docs/CORE_SPEC.md Section
 * 33.2, 33.4, 33.20). Every "round trip" test here follows the locked
 * fresh-recompile proof shape exactly: compile source -> document A,
 * advance -> suspension, encode, discard A, compile the SAME source again
 * -> a distinct document B, JSON round-trip the position, decode against
 * B, and continue. A test relying on document A's AST identity would fail
 * here by construction, since B's nodes are never the same objects as A's.
 */

function textOf(step: ExecutionStep): string {
  if (step.result.type === "content" && step.result.block.type === "Paragraph") {
    return step.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
  }
  throw new Error(`expected content, got ${step.result.type}`);
}

function paragraphText(block: StoryBlock | undefined): string {
  if (block?.type !== "Paragraph") throw new Error(`expected a Paragraph, got ${block?.type}`);
  return block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
}

function roundTrip(position: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(position)) as JsonValue;
}

function withStory(runtimeState: RuntimeState, story: Record<string, unknown>): RuntimeState {
  return { ...runtimeState, story: story as RuntimeState["story"] };
}

/**
 * The locked fresh-recompile proof shape (docs/CORE_SPEC.md Section
 * 33.20), factored out of every round-trip test below: compile `source`
 * once as the live execution document, advance to a suspension, encode
 * and JSON round-trip its position, then compile `source` again as a
 * second, distinct document to decode against. `withState` lets a test
 * seed `RuntimeState.story` before the initial `advance` (default:
 * unchanged).
 */
function freshDocumentRoundTrip(
  source: string,
  withState: (state: RuntimeState) => RuntimeState = (state) => state
): { readonly documentA: StoryDocument; readonly documentB: StoryDocument; readonly suspended: ExecutionStep; readonly position: JsonValue } {
  const documentA = compileDoc(source);
  const suspended = advance(documentA, withState(createRuntimeState(documentA)));
  const position = roundTrip(toCursorPosition(suspended.runtimeState, suspended.cursor));
  const documentB = compileDoc(source);
  return { documentA, documentB, suspended, position };
}

/** Asserts a decode succeeded and narrows to its `ok: true` branch, failing with the usual message otherwise. */
function expectDecoded(decoded: ReturnType<typeof fromCursorPosition>) {
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error("unreachable");
  return decoded;
}

describe("fresh-document round trip (docs/CORE_SPEC.md Section 33.20)", () => {
  it("content: resolvedBlock is the block that produced the suspension; continuation does not re-show it", () => {
    const { documentA, documentB, suspended, position } = freshDocumentRoundTrip("@scene s\nFirst.\n\nSecond.\n");
    expect(textOf(suspended)).toBe("First.");
    expect(documentB).not.toBe(documentA);
    expect(documentB.scenes[0]).not.toBe(documentA.scenes[0]);

    const decoded = expectDecoded(fromCursorPosition(documentB, suspended.runtimeState, position, "content"));
    expect(decoded.resolvedBlock?.type).toBe("Paragraph");
    expect(paragraphText(decoded.resolvedBlock)).toBe("First.");
    expect(decoded.resolvedBlock).not.toBe(documentA.scenes[0]!.blocks[0]);

    const next = advance(documentB, suspended.runtimeState, decoded.cursor);
    expect(textOf(next)).toBe("Second.");
  });

  it("dialogue: resolvedBlock is the freshly-compiled DialogueNode; continuation resumes after it", () => {
    const { documentA, documentB, suspended, position } = freshDocumentRoundTrip("@scene s\n@say speaker=Alice\nHello.\n\nAfter.\n");
    expect(suspended.result.type).toBe("dialogue");

    const decoded = expectDecoded(fromCursorPosition(documentB, suspended.runtimeState, position, "dialogue"));
    expect(decoded.resolvedBlock?.type).toBe("Dialogue");
    expect(decoded.resolvedBlock).not.toBe(documentA.scenes[0]!.blocks[0]);

    const next = advance(documentB, suspended.runtimeState, decoded.cursor);
    expect(next.result.type).toBe("content");
    if (next.result.type === "content") expect(paragraphText(next.result.block)).toBe("After.");
  });

  it("presentation: command comes from fresh document B; continuation resumes after it", () => {
    const { documentA, documentB, suspended, position } = freshDocumentRoundTrip("@scene s\n@background room.jpg\nAfter.\n");
    expect(suspended.result.type).toBe("presentation");

    const decoded = expectDecoded(fromCursorPosition(documentB, suspended.runtimeState, position, "presentation"));
    expect(decoded.resolvedBlock?.type).toBe("Presentation");
    expect(decoded.resolvedBlock).not.toBe(documentA.scenes[0]!.blocks[0]);

    const next = advance(documentB, suspended.runtimeState, decoded.cursor);
    expect(textOf(next)).toBe("After.");
  });

  it("choice: cursor stays at the ChoiceNode; resolvedBlock is that ChoiceNode", () => {
    const source = ["@scene s", "@choice", "- Go -> elsewhere", "@end", "", "@scene elsewhere", "There."].join("\n");
    const { documentB, suspended, position } = freshDocumentRoundTrip(source);
    expect(suspended.result.type).toBe("choice");

    const decoded = expectDecoded(fromCursorPosition(documentB, suspended.runtimeState, position, "choice"));
    expect(decoded.resolvedBlock?.type).toBe("Choice");
    expect(decoded.cursor).toEqual(suspended.cursor); // AST-free, so structural equality holds across documents

    const selected = selectChoice(documentB, { ...suspended, cursor: decoded.cursor }, 0);
    expect(selected.result).toEqual({ type: "navigation", from: "s", to: "elsewhere" });
  });

  it("choice: decode never re-runs item filtering — resolvedBlock carries every authored item regardless of current story state", () => {
    const source = ["@scene s", "@choice", "- Always -> a", "- Gated -> b if flag", "@end", "@scene a", "A.", "@scene b", "B."].join(
      "\n"
    );
    const { documentB, suspended, position } = freshDocumentRoundTrip(source, (state) => withStory(state, { flag: true }));
    expect(suspended.result.type).toBe("choice");
    if (suspended.result.type === "choice") expect(suspended.result.items).toHaveLength(2);

    // Decode with a runtimeState whose story would exclude the gated item if
    // filterChoiceItems were (incorrectly) re-run during decode.
    const decoded = expectDecoded(
      fromCursorPosition(documentB, withStory(suspended.runtimeState, { flag: false }), position, "choice")
    );
    expect(decoded.resolvedBlock?.type).toBe("Choice");
    if (decoded.resolvedBlock?.type === "Choice") expect(decoded.resolvedBlock.items).toHaveLength(2);
  });
});

/**
 * One "structural nesting round-trips through a fresh document" case
 * (docs/CORE_SPEC.md Section 33.4, 33.10): the suspension text to expect,
 * the cursor depth to assert (and, only then, that `decoded.cursor`
 * exactly matches `suspended.cursor` — the original cursor was itself
 * built against document A, so this also re-proves AST-freedom), and what
 * continuing from the decoded cursor should produce, if anything.
 */
interface NestingRoundTripCase {
  readonly name: string;
  readonly source: string;
  readonly suspendedText: string;
  readonly cursorDepth?: number;
  readonly after?: "completed" | { readonly text: string };
}

const NESTING_ROUND_TRIP_CASES: readonly NestingRoundTripCase[] = [
  {
    name: "nested Conditional",
    source: ["@scene s", "@if true", "@if true", "Inner.", "@end", "Outer.", "@end"].join("\n"),
    suspendedText: "Inner.",
    after: { text: "Outer." }
  },
  {
    name: "nested Variant",
    source: ["@scene s", "@variant v", "@when true", "First.", "", "Second.", "@end"].join("\n"),
    suspendedText: "First.",
    after: { text: "Second." }
  },
  {
    name: "Conditional inside Variant",
    source: ["@scene s", "@variant mood", "@when true", "@if true", "Deep.", "@end", "@end"].join("\n"),
    suspendedText: "Deep.",
    cursorDepth: 3,
    after: "completed"
  },
  {
    name: "Variant inside Conditional",
    source: ["@scene s", "@if true", "@variant mood", "@when true", "Deep.", "@end", "@end"].join("\n"),
    suspendedText: "Deep.",
    cursorDepth: 3,
    after: "completed"
  },
  {
    name: "multiple nested levels (Conditional > Variant > Conditional)",
    source: ["@scene s", "@if true", "@variant outer", "@when true", "@if true", "Deepest.", "@end", "@end", "@end"].join("\n"),
    suspendedText: "Deepest.",
    cursorDepth: 4
  }
];

describe("structural nesting (docs/CORE_SPEC.md Section 33.4, 33.10)", () => {
  it.each(NESTING_ROUND_TRIP_CASES)("$name round-trips through a fresh document", ({ source, suspendedText, cursorDepth, after }) => {
    const { documentB, suspended, position } = freshDocumentRoundTrip(source);
    expect(textOf(suspended)).toBe(suspendedText);
    if (cursorDepth !== undefined) expect(suspended.cursor).toHaveLength(cursorDepth);

    const decoded = expectDecoded(fromCursorPosition(documentB, suspended.runtimeState, position, "content"));
    if (cursorDepth !== undefined) expect(decoded.cursor).toEqual(suspended.cursor);

    if (after === "completed") {
      const completed = advance(documentB, suspended.runtimeState, decoded.cursor);
      expect(completed.result).toEqual({ type: "completed" });
    } else if (after) {
      const next = advance(documentB, suspended.runtimeState, decoded.cursor);
      expect(textOf(next)).toBe(after.text);
    }
  });
});

describe("error suspensions (docs/CORE_SPEC.md Section 33.4, 33.20)", () => {
  it("false exposure flags survive restore: the later qualifying result records exactly once, not zero or twice", () => {
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
    const state = createRuntimeState(documentA);
    const failed = advance(documentA, state);
    expect(failed.result.type).toBe("error");

    // Still genuinely unrecorded at the moment of the error.
    const [sceneFrame, variantFrame] = failed.cursor;
    expect(sceneFrame).toMatchObject({ kind: "scene", visitRecorded: false });
    expect(variantFrame).toMatchObject({ kind: "variant", seenRecorded: false });

    const position = roundTrip(toCursorPosition(failed.runtimeState, failed.cursor));
    const documentB = compileDoc(source);
    const decoded = fromCursorPosition(documentB, failed.runtimeState, position, "error");
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("unreachable");
    expect(decoded.resolvedBlock).toBeUndefined();

    const retried = advance(documentB, withStory(failed.runtimeState, { trust: 1, divisor: 1 }), decoded.cursor);
    expect(textOf(retried)).toBe("Hi.");
    expect(retried.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
    expect(retried.runtimeState.reader.seenVariants).toEqual({
      mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 1 }
    });
  });

  it("true exposure flags survive restore: continuing never double-records the same occurrence", () => {
    const source = ["@scene s", "@variant mood", "@when true", "First.", "", "Second.", "@end"].join("\n");
    const documentA = compileDoc(source);
    const state = createRuntimeState(documentA);
    const suspended = advance(documentA, state);
    expect(textOf(suspended)).toBe("First.");
    expect(suspended.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } });
    expect(suspended.runtimeState.reader.seenVariants.mood?.seenCount).toBe(1);

    const position = roundTrip(toCursorPosition(suspended.runtimeState, suspended.cursor));
    const documentB = compileDoc(source);
    const decoded = fromCursorPosition(documentB, suspended.runtimeState, position, "content");
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("unreachable");

    const next = advance(documentB, suspended.runtimeState, decoded.cursor);
    expect(textOf(next)).toBe("Second.");
    expect(next.runtimeState.reader.visitedScenes).toEqual({ s: { visitCount: 1 } }); // still exactly 1
    expect(next.runtimeState.reader.seenVariants.mood?.seenCount).toBe(1); // still exactly 1
  });

  it("an empty error cursor (e.g. an invalid scene target) decodes to INITIAL_CURSOR without fabricating a block", () => {
    const documentA = compileDoc("@scene s\nHi.\n");
    const state = createRuntimeState(documentA);
    const failed = advance(documentA, { ...state, navigation: { sceneId: "does-not-exist" } });
    expect(failed.result.type).toBe("error");
    expect(failed.cursor).toEqual([]);

    const position = roundTrip(toCursorPosition(failed.runtimeState, failed.cursor));
    const decoded = fromCursorPosition(documentA, failed.runtimeState, position, "error");
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("unreachable");
    expect(decoded.cursor).toEqual([]);
    expect(decoded.resolvedBlock).toBeUndefined();
  });

  it("an empty position is rejected for every non-error result kind", () => {
    const documentA = compileDoc("@scene s\nHi.\n");
    const state = createRuntimeState(documentA);
    const position: JsonValue = { sceneId: "s", frames: [] };
    for (const resultKind of ["content", "dialogue", "presentation", "choice"] as const) {
      expect(fromCursorPosition(documentA, state, position, resultKind)).toEqual({
        ok: false,
        reason: expect.any(String)
      });
    }
  });
});

describe("integrity validation (docs/CORE_SPEC.md Section 33.4, 33.8)", () => {
  it("rejects a position/runtimeState pair that agree on a scene id neither of them can prove exists", () => {
    // Both fields independently well-typed and mutually consistent — but
    // the scene itself does not exist in the given document. Must not be
    // confused with the scene-mismatch case (where the two disagree); here
    // they agree on a scene that simply isn't there.
    const documentA = compileDoc("@scene s\nHi.\n");
    const runtimeState = { ...createRuntimeState(documentA), navigation: { sceneId: "ghost" } };
    const position: JsonValue = { sceneId: "ghost", frames: [{ kind: "scene", index: 0, visitRecorded: false }] };
    expect(fromCursorPosition(documentA, runtimeState, position, "error")).toEqual({ ok: false, reason: expect.any(String) });
  });

  it("rejects a position whose embedded scene id disagrees with runtimeState.navigation.sceneId", () => {
    const source = ["@scene s", "Hi.", "", "@scene t", "There."].join("\n");
    const documentA = compileDoc(source);
    const state = createRuntimeState(documentA);
    const suspended = advance(documentA, state);
    expect(textOf(suspended)).toBe("Hi.");

    const position = roundTrip(toCursorPosition(suspended.runtimeState, suspended.cursor)) as { sceneId: string; frames: JsonValue[] };
    // Craft a position claiming scene "t" — a real scene, just not the current one.
    const tampered: JsonValue = { ...position, sceneId: "t" };

    const decoded = fromCursorPosition(documentA, suspended.runtimeState, tampered, "content");
    expect(decoded).toEqual({ ok: false, reason: expect.any(String) });
  });

  it("branchIndex: valid, negative, fractional, out-of-range, and wrong-parent-kind are each handled correctly", () => {
    const source = ["@scene s", "@if true", "@if true", "Hi.", "@end", "@end"].join("\n");
    const documentA = compileDoc(source);
    const state = createRuntimeState(documentA);
    const suspended = advance(documentA, state);
    expect(textOf(suspended)).toBe("Hi.");

    const position = roundTrip(toCursorPosition(suspended.runtimeState, suspended.cursor)) as {
      sceneId: string;
      frames: { kind: string; branchIndex?: number; index: number }[];
    };
    const innerDepth = position.frames.length - 1;

    // valid (the original) still decodes.
    expect(fromCursorPosition(documentA, suspended.runtimeState, position, "content").ok).toBe(true);

    for (const branchIndex of [-1, 0.5, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
      const tampered = structuredClone(position);
      tampered.frames[innerDepth]!.branchIndex = branchIndex;
      expect(fromCursorPosition(documentA, suspended.runtimeState, tampered, "content")).toEqual({
        ok: false,
        reason: expect.any(String)
      });
    }

    // wrong-parent-kind: point the inner conditional frame at a parent depth whose block is not Conditional.
    const notConditionalSource = ["@scene s", "Hi.", "@if true", "There.", "@end"].join("\n");
    const documentC = compileDoc(notConditionalSource);
    const wrongParent: JsonValue = {
      sceneId: "s",
      frames: [
        { kind: "scene", index: 0, visitRecorded: false }, // scene's current block ("Hi.") is a Paragraph, not Conditional
        { kind: "conditional", branchIndex: 0, index: 0 }
      ]
    };
    expect(fromCursorPosition(documentC, createRuntimeState(documentC), wrongParent, "content")).toEqual({
      ok: false,
      reason: expect.any(String)
    });
  });

  it("Variant identity: variantId mismatch, missing branchId, cross-Variant branchId, and wrong-parent-kind are each rejected", () => {
    const source = ["@scene s", "@variant mood", "@when true", "Hi.", "@end"].join("\n");
    const documentA = compileDoc(source);
    const state = createRuntimeState(documentA);
    const suspended = advance(documentA, state);
    expect(textOf(suspended)).toBe("Hi.");

    const position = roundTrip(toCursorPosition(suspended.runtimeState, suspended.cursor)) as {
      sceneId: string;
      frames: { kind: string; variantId?: string; branchId?: string; index: number; seenRecorded?: boolean }[];
    };
    const variantDepth = position.frames.length - 1;

    const variantIdMismatch = structuredClone(position);
    variantIdMismatch.frames[variantDepth]!.variantId = "not-mood";
    expect(fromCursorPosition(documentA, suspended.runtimeState, variantIdMismatch, "content")).toEqual({
      ok: false,
      reason: expect.any(String)
    });

    const branchIdMissing = structuredClone(position);
    branchIdMissing.frames[variantDepth]!.branchId = "mood:does-not-exist";
    expect(fromCursorPosition(documentA, suspended.runtimeState, branchIdMissing, "content")).toEqual({
      ok: false,
      reason: expect.any(String)
    });

    // cross-Variant branchId: a real branchId, but belonging to a different Variant.
    const twoVariants = ["@scene s", "@variant other", "@when true", "Side.", "@end", "@variant mood", "@when true", "Hi.", "@end"].join(
      "\n"
    );
    const documentD = compileDoc(twoVariants);
    const crossVariant: JsonValue = {
      sceneId: "s",
      frames: [
        { kind: "scene", index: 1, visitRecorded: false },
        { kind: "variant", variantId: "mood", branchId: "other:0", index: 0, seenRecorded: false }
      ]
    };
    expect(fromCursorPosition(documentD, createRuntimeState(documentD), crossVariant, "content")).toEqual({
      ok: false,
      reason: expect.any(String)
    });

    // wrong-parent-kind: the parent's current block is not a Variant at all.
    const notVariantSource = ["@scene s", "Hi.", "@variant mood", "@when true", "There.", "@end"].join("\n");
    const documentE = compileDoc(notVariantSource);
    const wrongParent: JsonValue = {
      sceneId: "s",
      frames: [
        { kind: "scene", index: 0, visitRecorded: false },
        { kind: "variant", variantId: "mood", branchId: "mood:0", index: 0, seenRecorded: false }
      ]
    };
    expect(fromCursorPosition(documentE, createRuntimeState(documentE), wrongParent, "content")).toEqual({
      ok: false,
      reason: expect.any(String)
    });
  });

  it("index bounds differ by resultKind: one-past-end is valid for content/dialogue/presentation/error but not choice", () => {
    const source = "@scene s\nOnly.\n";
    const documentA = compileDoc(source);
    const blockCount = documentA.scenes[0]!.blocks.length;
    expect(blockCount).toBe(1);

    // A genuinely live content/dialogue/presentation/choice suspension
    // always has visitRecorded: true for every open frame (Section 33.4),
    // which in turn requires a matching visitedScenes entry — so this
    // fixture — proving the *bounds* rule, not the exposure-flag rule —
    // must use a runtimeState that already has one.
    const stateWithVisit = { ...createRuntimeState(documentA), reader: { visitedScenes: { s: { visitCount: 1 } }, seenVariants: {} } };
    const onePastEndRecorded: JsonValue = { sceneId: "s", frames: [{ kind: "scene", index: blockCount, visitRecorded: true }] };
    expect(fromCursorPosition(documentA, stateWithVisit, onePastEndRecorded, "content").ok).toBe(true);
    expect(fromCursorPosition(documentA, stateWithVisit, onePastEndRecorded, "dialogue").ok).toBe(true);
    expect(fromCursorPosition(documentA, stateWithVisit, onePastEndRecorded, "presentation").ok).toBe(true);
    expect(fromCursorPosition(documentA, stateWithVisit, onePastEndRecorded, "error").ok).toBe(true);
    expect(fromCursorPosition(documentA, stateWithVisit, onePastEndRecorded, "choice")).toEqual({
      ok: false,
      reason: expect.any(String)
    });

    for (const index of [-1, blockCount + 1, 0.5]) {
      const outOfBounds: JsonValue = { sceneId: "s", frames: [{ kind: "scene", index, visitRecorded: true }] };
      for (const resultKind of ["content", "dialogue", "presentation", "error", "choice"] as const) {
        expect(fromCursorPosition(documentA, stateWithVisit, outOfBounds, resultKind)).toEqual({
          ok: false,
          reason: expect.any(String)
        });
      }
    }
  });

  it("rejects a false exposure flag for every observable suspension kind — only error may genuinely carry one", () => {
    const source = "@scene s\nOnly.\n";
    const documentA = compileDoc(source);
    const state = createRuntimeState(documentA);
    const blockCount = documentA.scenes[0]!.blocks.length;

    // Same in-bounds position, differing only in visitRecorded: false.
    // advance() always records exposure before committing content/
    // dialogue/presentation/choice (Section 33.4), so a live suspension of
    // any of those four kinds can never carry a false flag — only error
    // legitimately can (already covered by the false-exposure round-trip
    // test above). `false` carries no ReaderState-entry requirement, so
    // the plain fresh `state` (empty Reader Memory) is fine here.
    const unrecorded: JsonValue = { sceneId: "s", frames: [{ kind: "scene", index: blockCount, visitRecorded: false }] };
    expect(fromCursorPosition(documentA, state, unrecorded, "content")).toEqual({ ok: false, reason: expect.any(String) });
    expect(fromCursorPosition(documentA, state, unrecorded, "dialogue")).toEqual({ ok: false, reason: expect.any(String) });
    expect(fromCursorPosition(documentA, state, unrecorded, "presentation")).toEqual({
      ok: false,
      reason: expect.any(String)
    });
    expect(fromCursorPosition(documentA, state, unrecorded, "error").ok).toBe(true);

    // The same rule applies to an open Variant frame's seenRecorded. The
    // scene frame above it is marked recorded, so it needs its own
    // matching visitedScenes entry, same as the bounds test above.
    const variantSource = ["@scene s", "@variant mood", "@when true", "Hi.", "@end"].join("\n");
    const documentV = compileDoc(variantSource);
    const stateWithSceneVisited = {
      ...createRuntimeState(documentV),
      reader: { visitedScenes: { s: { visitCount: 1 } }, seenVariants: {} }
    };
    const unrecordedVariant: JsonValue = {
      sceneId: "s",
      frames: [
        { kind: "scene", index: 0, visitRecorded: true },
        { kind: "variant", variantId: "mood", branchId: "mood:0", index: 1, seenRecorded: false }
      ]
    };
    expect(fromCursorPosition(documentV, stateWithSceneVisited, unrecordedVariant, "content")).toEqual({
      ok: false,
      reason: expect.any(String)
    });
    expect(fromCursorPosition(documentV, stateWithSceneVisited, unrecordedVariant, "error").ok).toBe(true);
  });

  it("exposure-flag consistency: a true flag without a matching ReaderState entry is rejected", () => {
    const documentA = compileDoc("@scene s\nHi.\n");
    const state = createRuntimeState(documentA);
    const claimsVisited: JsonValue = { sceneId: "s", frames: [{ kind: "scene", index: 0, visitRecorded: true }] };
    // state.reader.visitedScenes is still {} — a live cursor could never carry visitRecorded: true here.
    expect(fromCursorPosition(documentA, state, claimsVisited, "error")).toEqual({ ok: false, reason: expect.any(String) });

    // A false flag carries no such requirement.
    const claimsNotVisited: JsonValue = { sceneId: "s", frames: [{ kind: "scene", index: 0, visitRecorded: false }] };
    expect(fromCursorPosition(documentA, state, claimsNotVisited, "error").ok).toBe(true);
  });

  it("exposure-flag consistency: a seenRecorded Variant frame must match ReaderState's own lastSeenBranchId", () => {
    const source = ["@scene s", "@variant mood", "@when true", "Happy.", "@when true", "Sad.", "@end"].join("\n");
    const documentA = compileDoc(source);
    const runtimeStateWithHappySeen: RuntimeState = {
      ...createRuntimeState(documentA),
      reader: { visitedScenes: {}, seenVariants: { mood: { firstSeenBranchId: "mood:0", lastSeenBranchId: "mood:0", seenCount: 1 } } }
    };

    const claimsSadSeen: JsonValue = {
      sceneId: "s",
      frames: [
        { kind: "scene", index: 0, visitRecorded: false },
        { kind: "variant", variantId: "mood", branchId: "mood:1", index: 0, seenRecorded: true } // mismatched branchId
      ]
    };
    expect(fromCursorPosition(documentA, runtimeStateWithHappySeen, claimsSadSeen, "error")).toEqual({
      ok: false,
      reason: expect.any(String)
    });

    const claimsHappySeen: JsonValue = {
      sceneId: "s",
      frames: [
        { kind: "scene", index: 0, visitRecorded: false },
        { kind: "variant", variantId: "mood", branchId: "mood:0", index: 0, seenRecorded: true }
      ]
    };
    expect(fromCursorPosition(documentA, runtimeStateWithHappySeen, claimsHappySeen, "error").ok).toBe(true);
  });

  const PROTOTYPE_NAMES = ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"];

  it.each(PROTOTYPE_NAMES)(
    "exposure-flag consistency treats scene id %s as an ordinary id, not an inherited property",
    (sceneId) => {
      const documentA = compileDoc(`@scene ${sceneId}\nHi.\n`);
      const runtimeStateWithoutVisit = { ...createRuntimeState(documentA), navigation: { sceneId } };
      const claimsVisited: JsonValue = { sceneId, frames: [{ kind: "scene", index: 0, visitRecorded: true }] };
      // `{}.toString` etc. exist on Object.prototype — a naive `reader.visitedScenes[sceneId]`
      // lookup would wrongly treat that as "already recorded" without ever calling recordSceneVisit.
      expect(fromCursorPosition(documentA, runtimeStateWithoutVisit, claimsVisited, "error")).toEqual({
        ok: false,
        reason: expect.any(String)
      });

      const runtimeStateWithVisit = {
        ...runtimeStateWithoutVisit,
        reader: { visitedScenes: { [sceneId]: { visitCount: 1 } }, seenVariants: {} }
      };
      expect(fromCursorPosition(documentA, runtimeStateWithVisit, claimsVisited, "error").ok).toBe(true);
    }
  );

  it.each(PROTOTYPE_NAMES)(
    "exposure-flag consistency treats variant id %s as an ordinary id, not an inherited property",
    (variantId) => {
      const source = ["@scene s", `@variant ${variantId}`, "@when true", "Hi.", "@end"].join("\n");
      const documentA = compileDoc(source);
      const runtimeStateWithoutSeen = createRuntimeState(documentA);
      const claimsSeen: JsonValue = {
        sceneId: "s",
        frames: [
          { kind: "scene", index: 0, visitRecorded: false },
          { kind: "variant", variantId, branchId: `${variantId}:0`, index: 0, seenRecorded: true }
        ]
      };
      expect(fromCursorPosition(documentA, runtimeStateWithoutSeen, claimsSeen, "error")).toEqual({
        ok: false,
        reason: expect.any(String)
      });

      const runtimeStateWithSeen = {
        ...runtimeStateWithoutSeen,
        reader: {
          visitedScenes: {},
          seenVariants: { [variantId]: { firstSeenBranchId: `${variantId}:0`, lastSeenBranchId: `${variantId}:0`, seenCount: 1 } }
        }
      };
      expect(fromCursorPosition(documentA, runtimeStateWithSeen, claimsSeen, "error").ok).toBe(true);
    }
  );
});

describe("malformed payload handling (docs/CORE_SPEC.md Section 33.4, 33.8) — never throws", () => {
  const documentA = compileDoc("@scene s\nHi.\n");
  const state = createRuntimeState(documentA);

  const malformed: readonly JsonValue[] = [
    null,
    "not an object",
    42,
    [],
    { sceneId: "s" }, // missing frames
    { frames: [] }, // missing sceneId
    { sceneId: 7, frames: [] }, // wrong sceneId type
    { sceneId: "s", frames: "not an array" } as unknown as JsonValue,
    { sceneId: "s", frames: [{ kind: "mystery", index: 0 }] }, // unknown frame kind
    { sceneId: "s", frames: [{ kind: "scene" }] }, // missing index
    { sceneId: "s", frames: [{ kind: "scene", index: "0", visitRecorded: false }] }, // wrong index type
    { sceneId: "s", frames: [{ kind: "scene", index: 0, visitRecorded: "yes" }] }, // wrong visitRecorded type
    { sceneId: "s", frames: [{ kind: "conditional", branchIndex: "0", index: 0 }] }, // wrong branchIndex type, and not frame 0
    { sceneId: "s", frames: [{ kind: "variant", variantId: 1, branchId: "mood:0", index: 0, seenRecorded: false }] }, // wrong variantId type
    // NaN/Infinity are `typeof "number"`, so they survive the JsonValue type
    // check; only `Number.isInteger` catches them. These are passed as raw
    // (non-JSON-round-tripped) JS values, since JSON.stringify would itself
    // already turn either into `null` before reaching this function.
    { sceneId: "s", frames: [{ kind: "scene", index: Number.NaN, visitRecorded: false }] },
    { sceneId: "s", frames: [{ kind: "scene", index: Number.POSITIVE_INFINITY, visitRecorded: false }] },
    { sceneId: "s", frames: [{ kind: "scene", index: Number.NEGATIVE_INFINITY, visitRecorded: false }] }
  ];

  it.each(malformed.map((value, index) => [index, value] as const))("rejects malformed payload #%i without throwing", (_index, value) => {
    expect(() => fromCursorPosition(documentA, state, value, "error")).not.toThrow();
    expect(fromCursorPosition(documentA, state, value, "error")).toEqual({ ok: false, reason: expect.any(String) });
  });
});

describe("JSON round-trip (docs/CORE_SPEC.md Section 33.4)", () => {
  it("a normal encoded position survives JSON.stringify/JSON.parse and remains decodable", () => {
    const source = ["@scene s", "@variant mood", "@when true", "@if true", "Hi.", "@end", "@end"].join("\n");
    const documentA = compileDoc(source);
    const state = createRuntimeState(documentA);
    const suspended = advance(documentA, state);
    expect(textOf(suspended)).toBe("Hi.");

    const position = toCursorPosition(suspended.runtimeState, suspended.cursor);
    const serialized = JSON.stringify(position);
    expect(serialized).not.toContain("undefined");

    const parsed = JSON.parse(serialized) as JsonValue;
    const decoded = fromCursorPosition(documentA, suspended.runtimeState, parsed, "content");
    expect(decoded.ok).toBe(true);
  });
});

describe("bounded/non-iterator-hijackable frame reads (Codex-reported P2, docs/CORE_SPEC.md Section 33.8)", () => {
  const documentA = compileDoc("@scene s\nHi.\n");
  const state = createRuntimeState(documentA);

  it("reads a frames array Proxy by index, ignoring a Symbol.iterator that would yield indefinitely, without hanging", () => {
    const realFrames = [{ kind: "scene", index: 0, visitRecorded: false }];
    const hijacked = new Proxy(realFrames, {
      get(target, prop, receiver) {
        if (prop === Symbol.iterator) {
          return function* () {
            while (true) yield { kind: "scene", index: 0, visitRecorded: false };
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    const position = { sceneId: "s", frames: hijacked } as unknown as JsonValue;
    const start = performance.now();
    expect(() => fromCursorPosition(documentA, state, position, "error")).not.toThrow();
    const result = fromCursorPosition(documentA, state, position, "error");
    const elapsedMs = performance.now() - start;
    // Indexed access reads realFrames[0] by its real, short .length — the
    // malicious generator is never consumed, so this resolves normally.
    expect(result.ok).toBe(true);
    expect(elapsedMs).toBeLessThan(2000);
  });

  it("rejects a sparse frames array claiming an astronomical length quickly instead of scanning every index", () => {
    const sparse = new Array(0xffffffff);
    const position = { sceneId: "s", frames: sparse } as unknown as JsonValue;
    const start = performance.now();
    expect(() => fromCursorPosition(documentA, state, position, "error")).not.toThrow();
    const result = fromCursorPosition(documentA, state, position, "error");
    const elapsedMs = performance.now() - start;
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
    expect(elapsedMs).toBeLessThan(2000);
  });
});
