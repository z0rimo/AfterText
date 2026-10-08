import { describe, expect, it } from "vitest";
import type { PresentationCommand, PresentationNode, StoryBlock } from "../src/index.js";
import { compile } from "../src/index.js";
import { codesOf, compileOk } from "./helpers.js";

/**
 * docs/CORE_SPEC.md Section 24 (Compiler Numeric Hardening).
 *
 * A lexically-valid numeric literal/parameter that converts to a non-finite
 * JavaScript number must be rejected (never clamped, never silently kept as
 * Infinity) with a dedicated diagnostic: AT2005 for expression literals,
 * AT1302 for presentation numeric parameters.
 */

/** 300 nines: still a finite `Number` (~9.99e299) — must remain valid everywhere. */
const LARGE_FINITE_DIGITS = "9".repeat(300);

/** 400 nines: overflows `Number(...)` to `Infinity` on its own. */
const OVERFLOW_DIGITS = "9".repeat(400);

/**
 * 306 nines: the raw amount (`Number(...)`) is itself finite, but multiplying
 * by 1000 (the seconds-to-milliseconds conversion) overflows to `Infinity`.
 * This is the "post-conversion-only" overflow distinct from a raw literal
 * that is already non-finite before any arithmetic.
 */
const POST_CONVERSION_OVERFLOW_DIGITS = "9".repeat(306);

function presentation(block: StoryBlock): PresentationNode {
  if (block.type !== "Presentation") throw new Error(`expected Presentation, got ${block.type}`);
  return block;
}

describe("expression numeric literal finiteness (AT2005)", () => {
  it("keeps an ordinary integer literal valid", () => {
    const { document } = compileOk("@scene s\n@set x = 42\n");
    const block = document.scenes[0]!.blocks[0]!;
    if (block.type !== "Set") throw new Error("expected Set");
    expect(block.expression).toMatchObject({ type: "Literal", value: 42 });
  });

  it("keeps an ordinary decimal literal valid", () => {
    const { document } = compileOk("@scene s\n@set x = 3.5\n");
    const block = document.scenes[0]!.blocks[0]!;
    if (block.type !== "Set") throw new Error("expected Set");
    expect(block.expression).toMatchObject({ type: "Literal", value: 3.5 });
  });

  it("keeps a large-but-finite literal valid, based on representability not source length", () => {
    const { document } = compileOk(`@scene s\n@set x = ${LARGE_FINITE_DIGITS}\n`);
    const block = document.scenes[0]!.blocks[0]!;
    if (block.type !== "Set") throw new Error("expected Set");
    if (block.expression.type !== "Literal") throw new Error("expected Literal");
    expect(Number.isFinite(block.expression.value)).toBe(true);
    expect(block.expression.value).toBe(Number(LARGE_FINITE_DIGITS));
  });

  it("reports AT2005 (not AT2001) for an overflowing numeric literal in @set, and drops the Set node", () => {
    const result = compile(`@scene s\n@set x = ${OVERFLOW_DIGITS}\n`);
    expect(result.hasErrors).toBe(true);
    expect(codesOf(result.diagnostics)).toContain("AT2005");
    expect(codesOf(result.diagnostics)).not.toContain("AT2001");
    const diagnostic = result.diagnostics.find((d) => d.code === "AT2005")!;
    expect(diagnostic.message).toBe("Numeric literal is not representable as a finite number.");
    expect(result.document.scenes[0]!.blocks).toHaveLength(0);
  });

  it("anchors AT2005 at the exact numeric token span, not a zero-width point", () => {
    const result = compile(`@scene s\n@set x = ${OVERFLOW_DIGITS}\n`);
    const diagnostic = result.diagnostics.find((d) => d.code === "AT2005")!;
    const width = diagnostic.span.end.offset - diagnostic.span.start.offset;
    expect(width).toBe(OVERFLOW_DIGITS.length);
  });

  it("reports AT2005 for an overflowing literal in an @if condition, using existing conditional recovery", () => {
    const source = ["@scene s", `@if ${OVERFLOW_DIGITS} == 1`, "Body.", "@end"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT2005");
    const block = result.document.scenes[0]!.blocks[0]!;
    if (block.type !== "Conditional") throw new Error("expected Conditional");
    // Existing conditional recovery: a branch with a failed condition keeps
    // its condition undefined rather than dropping the whole branch/block.
    expect(block.branches[0]!.condition).toBeUndefined();
  });

  it("reports AT2005 for an overflowing literal in a Choice condition, using existing choice-condition recovery", () => {
    const source = [
      "@scene s",
      "@choice",
      `* Go -> s if x == ${OVERFLOW_DIGITS}`,
      "@end"
    ].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT2005");
    const block = result.document.scenes[0]!.blocks[0]!;
    if (block.type !== "Choice") throw new Error("expected Choice");
    // Existing choice-condition recovery: the item survives, condition undefined.
    expect(block.items).toHaveLength(1);
    expect(block.items[0]!.condition).toBeUndefined();
  });

  it("still reports AT2001 (unchanged) for ordinary malformed expression syntax", () => {
    const result = compile("@scene s\n@set x = 1 +\n");
    expect(codesOf(result.diagnostics)).toContain("AT2001");
    expect(codesOf(result.diagnostics)).not.toContain("AT2005");
  });
});

describe("presentation numeric finiteness (AT1302)", () => {
  it.each<[string, PresentationCommand]>([
    ["@camera zoom to=0", { type: "Camera", action: "zoom", to: 0, durationMs: undefined }],
    ["@camera zoom to=-1.5", { type: "Camera", action: "zoom", to: -1.5, durationMs: undefined }],
    ["@camera zoom to=2.25", { type: "Camera", action: "zoom", to: 2.25, durationMs: undefined }]
  ])("keeps finite Camera to= behavior unchanged for %s", (line, expected) => {
    const { document } = compileOk(`@scene s\n${line}\n`);
    const block = presentation(document.scenes[0]!.blocks[0]!);
    expect(block.command).toEqual(expected);
  });

  it.each<[string, PresentationCommand]>([
    ["@music rain.mp3 volume=-0.5", { type: "Music", track: "rain.mp3", volume: -0.5 }],
    ["@music rain.mp3 volume=0", { type: "Music", track: "rain.mp3", volume: 0 }],
    ["@music rain.mp3 volume=0.8", { type: "Music", track: "rain.mp3", volume: 0.8 }],
    ["@music rain.mp3 volume=1.5", { type: "Music", track: "rain.mp3", volume: 1.5 }]
  ])("keeps out-of-[0,1] Music volume valid (no range validation added) for %s", (line, expected) => {
    const { document } = compileOk(`@scene s\n${line}\n`);
    const block = presentation(document.scenes[0]!.blocks[0]!);
    expect(block.command).toEqual(expected);
  });

  it("preserves negative zero for Camera to=-0", () => {
    const { document } = compileOk("@scene s\n@camera zoom to=-0\n");
    const block = presentation(document.scenes[0]!.blocks[0]!);
    if (block.command.type !== "Camera") throw new Error("expected Camera");
    expect(Object.is(block.command.to, -0)).toBe(true);
  });

  it("keeps a large-but-finite Camera to= and Music volume= valid", () => {
    const { document } = compileOk(
      `@scene s\n@camera zoom to=${LARGE_FINITE_DIGITS}\n@music rain.mp3 volume=${LARGE_FINITE_DIGITS}\n`
    );
    const camera = presentation(document.scenes[0]!.blocks[0]!).command;
    const music = presentation(document.scenes[0]!.blocks[1]!).command;
    if (camera.type !== "Camera" || music.type !== "Music") throw new Error("expected Camera/Music");
    expect(camera.to).toBe(Number(LARGE_FINITE_DIGITS));
    expect(music.volume).toBe(Number(LARGE_FINITE_DIGITS));
  });

  it.each([
    ["@camera zoom to=" + OVERFLOW_DIGITS, "Camera to="],
    ["@music rain.mp3 volume=" + OVERFLOW_DIGITS, "Music volume="]
  ])("reports AT1302 (not AT1301) for an overflowing %s value, and drops the command", (line) => {
    const result = compile(`@scene s\n${line}\n`);
    expect(result.hasErrors).toBe(true);
    expect(codesOf(result.diagnostics)).toContain("AT1302");
    expect(codesOf(result.diagnostics)).not.toContain("AT1301");
    const diagnostic = result.diagnostics.find((d) => d.code === "AT1302")!;
    expect(diagnostic.message).toBe("Numeric value is not representable as a finite number.");
    expect(result.document.scenes[0]!.blocks).toHaveLength(0);
  });

  it("does not move the renderer's finite>0 Camera rule into the compiler", () => {
    // Finite negative/zero to= must still compile (asserted above); this
    // test simply documents the boundary: only non-finite is rejected here.
    const result = compile("@scene s\n@camera zoom to=-999999\n");
    expect(result.hasErrors).toBe(false);
  });
});

describe("duration finiteness — Pause and Camera duration (AT1302)", () => {
  it.each<[string, number]>([
    ["@pause 0ms", 0],
    ["@pause 1200ms", 1200],
    ["@pause 2s", 2000],
    ["@pause 1.5s", 1500]
  ])("keeps finite %s durations unchanged", (line, expectedMs) => {
    const { document } = compileOk(`@scene s\n${line}\n`);
    const block = presentation(document.scenes[0]!.blocks[0]!);
    expect(block.command).toEqual({ type: "Pause", durationMs: expectedMs });
  });

  it("rejects a Pause duration whose raw amount already overflows (ms unit)", () => {
    const result = compile(`@scene s\n@pause ${OVERFLOW_DIGITS}ms\n`);
    expect(codesOf(result.diagnostics)).toContain("AT1302");
    expect(result.document.scenes[0]!.blocks).toHaveLength(0);
  });

  it("rejects a Pause duration whose raw seconds amount is finite but overflows only after *1000", () => {
    const rawAmount = Number(POST_CONVERSION_OVERFLOW_DIGITS);
    expect(Number.isFinite(rawAmount)).toBe(true);
    expect(Number.isFinite(rawAmount * 1000)).toBe(false);

    const result = compile(`@scene s\n@pause ${POST_CONVERSION_OVERFLOW_DIGITS}s\n`);
    expect(codesOf(result.diagnostics)).toContain("AT1302");
    expect(result.document.scenes[0]!.blocks).toHaveLength(0);
  });

  it("rejects an overflowing Camera duration= the same way as Pause", () => {
    const result = compile(`@scene s\n@camera zoom to=1 duration=${OVERFLOW_DIGITS}ms\n`);
    expect(codesOf(result.diagnostics)).toContain("AT1302");
    expect(result.document.scenes[0]!.blocks).toHaveLength(0);
  });

  it("keeps a finite Camera duration= unchanged", () => {
    const { document } = compileOk("@scene s\n@camera zoom to=1.15 duration=6s\n");
    const block = presentation(document.scenes[0]!.blocks[0]!);
    expect(block.command).toEqual({ type: "Camera", action: "zoom", to: 1.15, durationMs: 6000 });
  });
});

describe("no-Infinity AST regression", () => {
  /** Recursively scans a compiled value for a non-finite number anywhere in the tree. */
  function findNonFiniteNumber(value: unknown): boolean {
    if (typeof value === "number") return !Number.isFinite(value);
    if (Array.isArray(value)) return value.some(findNonFiniteNumber);
    if (value && typeof value === "object") {
      return Object.values(value).some(findNonFiniteNumber);
    }
    return false;
  }

  it("never lets an authored non-finite numeric literal/parameter reach the compiled StoryDocument", () => {
    const source = [
      "@scene s",
      `@set x = ${OVERFLOW_DIGITS}`,
      `@camera zoom to=${OVERFLOW_DIGITS}`,
      `@music rain.mp3 volume=${OVERFLOW_DIGITS}`,
      `@pause ${OVERFLOW_DIGITS}ms`,
      `@camera zoom to=1 duration=${POST_CONVERSION_OVERFLOW_DIGITS}s`
    ].join("\n");

    const result = compile(source);
    expect(result.hasErrors).toBe(true);
    expect(findNonFiniteNumber(result.document)).toBe(false);
    // Every offending construct was omitted per existing recovery, not
    // repaired with a placeholder — the scene body ends up empty.
    expect(result.document.scenes[0]!.blocks).toHaveLength(0);
  });
});
