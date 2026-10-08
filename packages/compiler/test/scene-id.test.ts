import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { codesOf, compileOk } from "./helpers.js";

describe("synthetic leading scene id", () => {
  it("uses the deterministic id \"main\" for an @scene-less document", () => {
    const { document } = compileOk("Just prose, no @scene at all.\n");
    expect(document.scenes.map((s) => s.id)).toEqual(["main"]);
  });

  it("preserves prose before the first explicit @scene under the synthetic main scene", () => {
    const source = ["Leading prose.", "", "@scene intro", "Intro body."].join("\n");
    const { document } = compileOk(source);
    expect(document.scenes.map((s) => s.id)).toEqual(["main", "intro"]);
    expect(document.scenes[0]!.blocks).toHaveLength(1);
  });

  it("never introduces an empty-string scene id", () => {
    const { document } = compileOk("Prose only.\n");
    expect(document.scenes.every((s) => s.id !== "")).toBe(true);
  });

  it("reports AT1003 when leading prose collides with an explicit @scene main", () => {
    const source = ["Leading prose.", "", "@scene main", "Explicit main."].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1003");
    // Both scenes still exist deterministically — no silent id collision.
    expect(result.document.scenes.map((s) => s.id)).toEqual(["main", "main"]);
  });

  it("does not synthesize a main scene when the document has no leading content", () => {
    const source = ["@scene intro", "Body."].join("\n");
    const { document } = compileOk(source);
    expect(document.scenes.map((s) => s.id)).toEqual(["intro"]);
  });

  describe("fully empty document", () => {
    it("still produces a single, valid synthetic main scene", () => {
      const { document } = compileOk("");
      expect(document.scenes).toHaveLength(1);
      expect(document.scenes[0]!.id).toBe("main");
      expect(document.scenes[0]!.blocks).toHaveLength(0);
      expect(document.entryScene).toBe("main");
    });

    it("does not report an unknown-scene diagnostic merely because the source is empty", () => {
      const result = compile("");
      expect(result.hasErrors).toBe(false);
      expect(codesOf(result.diagnostics)).not.toContain("AT1004");
    });

    it("treats whitespace-only source the same as a fully empty document", () => {
      const { document } = compileOk("   \n\n  \n");
      expect(document.scenes).toHaveLength(1);
      expect(document.scenes[0]!.id).toBe("main");
      expect(document.scenes[0]!.blocks).toHaveLength(0);
      expect(document.entryScene).toBe("main");
    });
  });
});
