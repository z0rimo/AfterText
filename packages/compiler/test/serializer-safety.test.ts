import { describe, expect, it } from "vitest";
import { isChoiceTargetBoundarySafe, isPresentationNamedArgumentValueBoundarySafe } from "../src/index.js";

describe("isChoiceTargetBoundarySafe (docs/CORE_SPEC.md Section 25.40)", () => {
  it("accepts ordinary, unknown, forward-reference, and content-invalid-but-boundary-safe targets", () => {
    expect(isChoiceTargetBoundarySafe("north")).toBe(true);
    expect(isChoiceTargetBoundarySafe("unknown_scene")).toBe(true);
    expect(isChoiceTargetBoundarySafe("future_scene")).toBe(true);
    expect(isChoiceTargetBoundarySafe("123")).toBe(true);
    expect(isChoiceTargetBoundarySafe("foo:bar")).toBe(true);
  });

  it("rejects a value that could inject an implicit condition or re-split the item/target boundary", () => {
    expect(isChoiceTargetBoundarySafe("north if has_key")).toBe(false);
    expect(isChoiceTargetBoundarySafe("north -> south")).toBe(false);
    expect(isChoiceTargetBoundarySafe("north->south")).toBe(false);
    expect(isChoiceTargetBoundarySafe("north\tsouth")).toBe(false);
  });

  it("does not reject an escaped arrow (not the same as an unescaped one)", () => {
    expect(isChoiceTargetBoundarySafe("north\\->south")).toBe(true);
  });
});

describe("isPresentationNamedArgumentValueBoundarySafe (docs/CORE_SPEC.md Section 25.40)", () => {
  it("accepts ordinary atomic values, including content-invalid-but-boundary-safe ones", () => {
    expect(isPresentationNamedArgumentValueBoundarySafe("1.0")).toBe(true);
    expect(isPresentationNamedArgumentValueBoundarySafe("500ms")).toBe(true);
    expect(isPresentationNamedArgumentValueBoundarySafe("bananas")).toBe(true);
  });

  it("rejects a value that could inject an additional named parameter or truncate the intended one", () => {
    expect(isPresentationNamedArgumentValueBoundarySafe("1 duration=2s")).toBe(false);
    expect(isPresentationNamedArgumentValueBoundarySafe("1\tfoo=bar")).toBe(false);
  });
});
