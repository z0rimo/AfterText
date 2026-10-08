import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { codesOf, compileOk } from "./helpers.js";

describe("frontmatter", () => {
  it("normalizes title, entry, and a first-class initial state", () => {
    const source = [
      "---",
      "title: Example",
      "entry: intro",
      "state:",
      "  timeline: 0",
      "  saw_person: false",
      "  name: nobody",
      "---",
      "",
      "@scene intro",
      "",
      "Hello.",
      ""
    ].join("\n");

    const { document } = compileOk(source);

    expect(document.metadata.title).toBe("Example");
    expect(document.metadata.entry).toBe("intro");
    expect(document.initialState).toEqual({
      timeline: 0,
      saw_person: false,
      name: "nobody"
    });
    expect(document.metadata.span).toBeDefined();
    // State is a first-class document field, not folded into metadata.
    expect("state" in document.metadata).toBe(false);
  });

  it("defaults to empty metadata and initial state when there is no frontmatter block", () => {
    const { document } = compileOk("Just prose.\n");
    expect(document.metadata.title).toBeUndefined();
    expect(document.metadata.entry).toBeUndefined();
    expect(document.initialState).toEqual({});
    expect(document.metadata.span).toBeUndefined();
  });

  describe("unsupported initial state values", () => {
    it.each([
      ["array", "state:\n  tags:\n    - a\n    - b"],
      ["nested object", "state:\n  nested:\n    x: 1"],
      ["yaml alias", "state:\n  base: &b 1\n  ref: *b"],
      ["non-map state", "state: 5"]
    ])("reports AT1201 for a %s", (_label, stateYaml) => {
      const source = `---\n${stateYaml}\n---\n@scene s\nHello.\n`;
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toContain("AT1201");
      expect(result.hasErrors).toBe(true);
    });

    it("drops only the offending key, keeping other valid state entries", () => {
      const source = ["---", "state:", "  timeline: 0", "  tags:", "    - a", "---", "@scene s", "Hi."].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toContain("AT1201");
      expect(result.document.initialState).toEqual({ timeline: 0 });
    });

    it("treats an empty `state:` as no initial state, not an error", () => {
      const source = ["---", "title: Example", "state:", "---", "@scene s", "Hi."].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).not.toContain("AT1201");
      expect(result.document.initialState).toEqual({});
    });
  });

  describe("invalid frontmatter YAML", () => {
    it("reports AT1202 for a YAML syntax error and does not throw", () => {
      const source = ["---", "title: Example", "state:", "  timeline: [", "---", "@scene s", "Hi."].join("\n");

      expect(() => compile(source)).not.toThrow();

      const result = compile(source);
      expect(codesOf(result.diagnostics)).toContain("AT1202");
      expect(result.hasErrors).toBe(true);
      // Compilation stays best-effort: a document is still produced.
      expect(result.document).toBeDefined();
      expect(result.document.scenes.map((s) => s.id)).toContain("s");
    });

    it("still recovers the title when only the state block is malformed", () => {
      const source = ["---", "title: Example", "state:", "  timeline: [", "---", "@scene s", "Hi."].join("\n");
      const result = compile(source);
      expect(result.document.metadata.title).toBe("Example");
    });

    it("anchors the AT1202 diagnostic's span within the frontmatter block", () => {
      const source = ["---", "title: Example", "state:", "  timeline: [", "---", "@scene s", "Hi."].join("\n");
      const result = compile(source);
      const diagnostic = result.diagnostics.find((d) => d.code === "AT1202")!;
      expect(diagnostic.severity).toBe("error");
      // The frontmatter block spans lines 1-5 ("---" ... "---").
      expect(diagnostic.span.start.line).toBeGreaterThanOrEqual(1);
      expect(diagnostic.span.start.line).toBeLessThanOrEqual(5);
    });

    it("does not report AT1202 for well-formed YAML", () => {
      const result = compile(["---", "title: Example", "---", "@scene s", "Hi."].join("\n"));
      expect(codesOf(result.diagnostics)).not.toContain("AT1202");
    });

    it("does not cascade into a misleading AT1201 for state values recovered from broken syntax", () => {
      // Malformed `state:` syntax used to produce both AT1202 (the real
      // parser error) and a secondary AT1201 for the value the parser
      // recovered around it — the latter is misleading noise, not a
      // genuine "unsupported value" authoring mistake.
      const source = ["---", "state:", "  timeline: [", "---", "@scene s", "Hi."].join("\n");
      const result = compile(source);

      const codes = codesOf(result.diagnostics);
      expect(codes).toContain("AT1202");
      expect(codes).not.toContain("AT1201");
      expect(result.hasErrors).toBe(true);
      expect(result.document.initialState).toEqual({});
    });

    it("still validates state values normally once the YAML is well-formed again", () => {
      // Sanity check that the cascade suppression is scoped to actual
      // syntax errors, not to `state:` validation in general.
      const source = ["---", "state:", "  tags:", "    - a", "---", "@scene s", "Hi."].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toEqual(["AT1201"]);
    });
  });
});
