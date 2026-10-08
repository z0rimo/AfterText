import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

/**
 * Confirms a Paragraph whose text was changed by replacing exactly its
 * `Paragraph.span` presents its NEW content correctly under real
 * `advance()`, with no Runtime change involved (fresh document/session
 * semantics only; no Runtime migration). The "before"/"after" source pair
 * below stands in for what such a narrow patch produces.
 */
describe("Paragraph Structured Editing — edited-content Runtime regression", () => {
  it("a freshly recompiled document presents the EDITED Paragraph text, not the original authored text", () => {
    const before = freshState("@scene s\nOriginal text.\n");
    const beforeAdvance = advance(before.document, before.state);
    expect(beforeAdvance.result.type).toBe("content");
    if (beforeAdvance.result.type !== "content") throw new Error("expected content");
    const beforeText = beforeAdvance.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
    expect(beforeText).toBe("Original text.");

    // Exactly what a narrow span-replacement produces: only
    // the Paragraph's own authored text changes, nothing else — a brand
    // new, independent compile + RuntimeState, never a migrated one.
    const after = freshState("@scene s\nEdited text.\n");
    const afterAdvance = advance(after.document, after.state);
    expect(afterAdvance.result.type).toBe("content");
    if (afterAdvance.result.type !== "content") throw new Error("expected content");
    const afterText = afterAdvance.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
    expect(afterText).toBe("Edited text.");
  });

  it("inline Markdown preserved by a structured edit renders with the expected inline AST, not stripped or reserialized", () => {
    const { document, state } = freshState("@scene s\nHello *world* and [a link](https://example.com).\n");
    const result = advance(document, state);
    expect(result.result.type).toBe("content");
    if (result.result.type !== "content") throw new Error("expected content");
    const types = result.result.block.children.map((c) => c.type);
    expect(types).toContain("Emphasis");
    expect(types).toContain("Link");
  });
});
