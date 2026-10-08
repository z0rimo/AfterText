import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { codesOf } from "./helpers.js";

describe("unsupported Markdown constructs", () => {
  it.each([
    ["bullet list", "- one\n- two\n"],
    ["blockquote", "> quoted text\n"],
    ["fenced code block", "```\ncode here\n```\n"],
    ["image", "![alt text](pic.png)\n"]
  ])("warns AT3001 for a %s but still falls back to plain text", (_label, markdown) => {
    const result = compile(`@scene s\n${markdown}`);

    expect(codesOf(result.diagnostics)).toContain("AT3001");
    const warning = result.diagnostics.find((d) => d.code === "AT3001")!;
    expect(warning.severity).toBe("warning");

    // Warnings alone must not count as errors, and the document is still produced.
    expect(result.hasErrors).toBe(false);
    expect(result.document.scenes[0]!.blocks.length).toBeGreaterThan(0);
  });

  it("leaves supported Markdown (paragraphs, headings, emphasis, links, code) warning-free", () => {
    const source = "@scene s\n# Title\n\nHi [link](https://example.com) *em* **strong** `code`.\n";
    const result = compile(source);
    expect(codesOf(result.diagnostics)).not.toContain("AT3001");
    expect(result.hasErrors).toBe(false);
  });
});
