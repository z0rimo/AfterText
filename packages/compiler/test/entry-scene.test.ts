import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { codesOf, compileOk } from "./helpers.js";

describe("StoryDocument.entryScene", () => {
  it("uses the explicit entry when it references an existing scene", () => {
    const source = ["---", "entry: middle", "---", "@scene intro", "A.", "", "@scene middle", "B."].join("\n");
    const { document } = compileOk(source);
    expect(document.entryScene).toBe("middle");
  });

  it("reports AT1004 when the explicit entry references no scene", () => {
    const source = ["---", "entry: nowhere", "---", "@scene intro", "A."].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1004");
    expect(result.hasErrors).toBe(true);
    // Best-effort: the declared (invalid) entry is preserved, not silently
    // swapped for a fallback — the same way a dangling @goto target is kept.
    expect(result.document.entryScene).toBe("nowhere");
  });

  it("defaults to the first scene when entry is omitted and explicit scenes exist", () => {
    const source = ["@scene intro", "A.", "", "@scene middle", "B."].join("\n");
    const { document } = compileOk(source);
    expect(document.entryScene).toBe("intro");
  });

  it('defaults to "main" when entry is omitted and the document is scene-less prose', () => {
    const { document } = compileOk("Just prose, no @scene at all.\n");
    expect(document.scenes.map((s) => s.id)).toEqual(["main"]);
    expect(document.entryScene).toBe("main");
  });

  it('defaults to the synthetic "main" scene when entry is omitted and leading prose precedes explicit scenes', () => {
    const source = ["Leading prose.", "", "@scene intro", "A."].join("\n");
    const { document } = compileOk(source);
    expect(document.scenes.map((s) => s.id)).toEqual(["main", "intro"]);
    expect(document.entryScene).toBe("main");
  });

  it("never leaves entryScene undefined, even for a completely empty document", () => {
    // A fully empty document synthesizes an actual (empty) "main" scene —
    // see scene-id.test.ts's "fully empty document" tests — so entryScene
    // resolves to a real scene and no AT1004 is reported.
    const result = compile("");
    expect(result.document.entryScene).toBe("main");
    expect(codesOf(result.diagnostics)).not.toContain("AT1004");
  });
});
