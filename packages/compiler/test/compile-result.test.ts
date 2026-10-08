import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

describe("CompileResult.hasErrors", () => {
  it("is false for a clean document", () => {
    const result = compile("@scene s\nHello.\n");
    expect(result.hasErrors).toBe(false);
  });

  it("is true when an error diagnostic is present", () => {
    const result = compile("@nonsense foo\n");
    expect(result.hasErrors).toBe(true);
  });

  it("is false when only warning diagnostics are present", () => {
    const result = compile("@scene s\n- a list item\n");
    expect(result.diagnostics.every((d) => d.severity === "warning")).toBe(true);
    expect(result.hasErrors).toBe(false);
  });

  it("still returns a best-effort document when hasErrors is true", () => {
    const result = compile("@scene intro\n@goto missing\n");
    expect(result.hasErrors).toBe(true);
    expect(result.document).toBeDefined();
    expect(result.document.scenes.map((s) => s.id)).toEqual(["intro"]);
  });
});
