import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { codesOf } from "./helpers.js";

const at1008 = (source: string) => compile(source).diagnostics.filter((d) => d.code === "AT1008");

describe("AT1008 empty scene id", () => {
  it("diagnoses a bare @scene with a zero-width span after the keyword", () => {
    const result = compile("@scene\nHello.");
    const found = result.diagnostics.filter((d) => d.code === "AT1008");
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe("error");
    expect(found[0]!.span.start).toEqual({ line: 1, column: 7, offset: 6 });
    expect(found[0]!.span.end).toEqual(found[0]!.span.start);
    expect(result.hasErrors).toBe(true);
  });

  it("keeps the best-effort scene with id \"\" and does not invent an id", () => {
    const { document } = compile("@scene\nHello.");
    expect(document.scenes.map((s) => s.id)).toEqual([""]);
    expect(document.scenes[0]!.blocks).toHaveLength(1);
    expect(document.entryScene).toBe("");
  });

  it("uses the same insertion point for a whitespace-only id", () => {
    const found = at1008("@scene    \nHello.");
    expect(found).toHaveLength(1);
    expect(found[0]!.span.start).toEqual({ line: 1, column: 7, offset: 6 });
    expect(found[0]!.span.end).toEqual(found[0]!.span.start);
  });

  it("reports exact coordinates with CRLF line endings", () => {
    const found = at1008("Intro.\r\n\r\n@scene\r\nHello.");
    expect(found).toHaveLength(1);
    expect(found[0]!.span.start).toEqual({ line: 3, column: 7, offset: 16 });
    expect(found[0]!.span.end).toEqual(found[0]!.span.start);
  });

  it("does not diagnose a valid scene", () => {
    expect(codesOf(compile("@scene intro\nHi.").diagnostics)).not.toContain("AT1008");
  });

  it("diagnoses each empty scene and keeps the duplicate-id diagnostic", () => {
    const result = compile("@scene\nA.\n\n@scene\nB.");
    const found = result.diagnostics.filter((d) => d.code === "AT1008");
    expect(found.map((d) => d.span.start.line)).toEqual([1, 4]);
    expect(codesOf(result.diagnostics)).toContain("AT1003");
    expect(result.document.scenes.map((s) => s.id)).toEqual(["", ""]);
  });

  it("leaves surrounding valid scenes untouched", () => {
    const source = "@scene a\nA.\n@scene\nB.\n@scene c\nC.";
    const result = compile(source);
    expect(result.diagnostics.filter((d) => d.code === "AT1008")).toHaveLength(1);
    expect(result.document.scenes.map((s) => s.id)).toEqual(["a", "", "c"]);
    expect(result.document.entryScene).toBe("a");
    expect(result.document.scenes[2]!.span.start.line).toBe(5);
  });

  it("does not apply to @variant ids", () => {
    expect(codesOf(compile("@scene s\n@variant\n@when true\nX.\n@end\n").diagnostics)).not.toContain("AT1008");
  });
});
