import { describe, expect, it } from "vitest";
import type { ExecutionResult } from "@aftertext/runtime";
import { decodeCurrent, encodeCurrent } from "../src/snapshot-current.js";
import type { JsonValue } from "../src/snapshot-types.js";

/**
 * The private current-result descriptor (docs/CORE_SPEC.md Section 33.7):
 * encode never stores an AST reference; decode validates untrusted JSON
 * data and never throws.
 */

describe("encodeCurrent — never stores an AST reference", () => {
  it("notStarted (current === null)", () => {
    expect(encodeCurrent(null)).toEqual({ type: "notStarted" });
  });

  it("content/dialogue/presentation store only the discriminator", () => {
    expect(encodeCurrent({ type: "content", block: { type: "Paragraph", children: [], span: {} as never } })).toEqual({
      type: "content"
    });
    expect(encodeCurrent({ type: "dialogue", speaker: "Alice", content: [] })).toEqual({ type: "dialogue" });
    expect(
      encodeCurrent({ type: "presentation", command: { type: "Background", image: "room.jpg" } })
    ).toEqual({ type: "presentation" });
  });

  it("choice stores exactly {text,target}[] — never index/condition", () => {
    const encoded = encodeCurrent({
      type: "choice",
      items: [
        { index: 0, text: "Go north", target: "a" },
        { index: 1, text: "Go south", target: "b" }
      ]
    });
    expect(encoded).toEqual({
      type: "choice",
      items: [
        { text: "Go north", target: "a" },
        { text: "Go south", target: "b" }
      ]
    });
  });

  it("navigation stores from/to", () => {
    expect(encodeCurrent({ type: "navigation", from: "a", to: "b" })).toEqual({ type: "navigation", from: "a", to: "b" });
  });

  it("completed stores only the discriminator", () => {
    expect(encodeCurrent({ type: "completed" })).toEqual({ type: "completed" });
  });

  it("error stores kind/message, never span", () => {
    const encoded = encodeCurrent({
      type: "error",
      error: { kind: "division-by-zero", message: "Division or modulo by zero.", span: { start: {}, end: {} } as never }
    });
    expect(encoded).toEqual({ type: "error", kind: "division-by-zero", message: "Division or modulo by zero." });
  });
});

describe("decodeCurrent — never throws on malformed input", () => {
  const cases: readonly ExecutionResult["type"][] | readonly string[] = [
    "notStarted",
    "content",
    "dialogue",
    "presentation",
    "completed"
  ];

  it.each(cases)("round-trips a bare discriminator-only descriptor for %s", (type) => {
    const value = encodeCurrent(type === "notStarted" ? null : ({ type } as unknown as ExecutionResult));
    expect(decodeCurrent(value)).toEqual({ type });
  });

  it("round-trips navigation", () => {
    const value = encodeCurrent({ type: "navigation", from: "a", to: "b" });
    expect(decodeCurrent(value)).toEqual({ type: "navigation", from: "a", to: "b" });
  });

  it("round-trips choice", () => {
    const value = encodeCurrent({
      type: "choice",
      items: [{ index: 0, text: "Go", target: "a" }]
    });
    expect(decodeCurrent(value)).toEqual({ type: "choice", items: [{ text: "Go", target: "a" }] });
  });

  it("round-trips error with a real RuntimeExecutionErrorKind", () => {
    const value = encodeCurrent({ type: "error", error: { kind: "empty-choice", message: "No choice items are available." } });
    expect(decodeCurrent(value)).toEqual({ type: "error", kind: "empty-choice", message: "No choice items are available." });
  });

  const malformed: readonly JsonValue[] = [
    null,
    "not an object",
    42,
    [],
    {},
    { type: 7 },
    { type: "mystery" },
    { type: "navigation" },
    { type: "navigation", from: 1, to: "b" },
    { type: "navigation", from: "a", to: 2 },
    { type: "choice" },
    { type: "choice", items: "not an array" },
    { type: "choice", items: [{ text: "Go" }] },
    { type: "choice", items: [{ target: "a" }] },
    { type: "choice", items: [{ text: 1, target: "a" }] },
    { type: "error" },
    { type: "error", kind: "not-a-real-kind", message: "x" },
    { type: "error", kind: "division-by-zero", message: 7 }
  ];

  it.each(malformed.map((value, index) => [index, value] as const))("rejects malformed current #%i without throwing", (_i, value) => {
    expect(() => decodeCurrent(value)).not.toThrow();
    expect(decodeCurrent(value)).toBeUndefined();
  });
});
