import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

/**
 * docs/CORE_SPEC.md Section 25.49 (Heading Content Source Span) — confirms
 * a Heading whose content was changed by replacing exactly its
 * `contentSourceSpan` presents its NEW content correctly under real
 * `advance()`, at the SAME depth, with no Runtime change involved. The
 * "before"/"after" source pairs below stand in for what such a narrow patch
 * produces.
 */
describe("Heading Structured Editing — edited-content Runtime regression", () => {
  it("a freshly recompiled document presents the EDITED ATX Heading text, not the original authored text, at the same depth", () => {
    const before = freshState("@scene s\n## Original heading\n");
    const beforeAdvance = advance(before.document, before.state);
    expect(beforeAdvance.result.type).toBe("content");
    if (beforeAdvance.result.type !== "content") throw new Error("expected content");
    expect(beforeAdvance.result.block.type).toBe("Heading");
    if (beforeAdvance.result.block.type !== "Heading") throw new Error("expected Heading");
    expect(beforeAdvance.result.block.depth).toBe(2);
    const beforeText = beforeAdvance.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
    expect(beforeText).toBe("Original heading");

    // Exactly what a narrow contentSourceSpan replacement
    // produces: only the Heading's own authored content changes, the
    // marker/depth is untouched — a brand new, independent compile +
    // RuntimeState, never a migrated one.
    const after = freshState("@scene s\n## Edited heading\n");
    const afterAdvance = advance(after.document, after.state);
    expect(afterAdvance.result.type).toBe("content");
    if (afterAdvance.result.type !== "content") throw new Error("expected content");
    expect(afterAdvance.result.block.type).toBe("Heading");
    if (afterAdvance.result.block.type !== "Heading") throw new Error("expected Heading");
    expect(afterAdvance.result.block.depth).toBe(2);
    const afterText = afterAdvance.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
    expect(afterText).toBe("Edited heading");
  });

  it("a freshly recompiled document presents the EDITED single-line Setext Heading text, with the underline/depth unaffected", () => {
    const before = freshState("@scene s\nOriginal heading\n=================\n");
    const beforeAdvance = advance(before.document, before.state);
    expect(beforeAdvance.result.type).toBe("content");
    if (beforeAdvance.result.type !== "content") throw new Error("expected content");
    expect(beforeAdvance.result.block.type).toBe("Heading");
    if (beforeAdvance.result.block.type !== "Heading") throw new Error("expected Heading");
    expect(beforeAdvance.result.block.depth).toBe(1);

    // A narrow content patch never touches the underline line.
    const after = freshState("@scene s\nEdited heading\n=================\n");
    const afterAdvance = advance(after.document, after.state);
    expect(afterAdvance.result.type).toBe("content");
    if (afterAdvance.result.type !== "content") throw new Error("expected content");
    expect(afterAdvance.result.block.type).toBe("Heading");
    if (afterAdvance.result.block.type !== "Heading") throw new Error("expected Heading");
    expect(afterAdvance.result.block.depth).toBe(1);
    const afterText = afterAdvance.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
    expect(afterText).toBe("Edited heading");
  });

  it("inline Markdown preserved by a structured Heading edit renders with the expected inline AST, not stripped or reserialized", () => {
    const { document, state } = freshState("@scene s\n# Hello *world* and [a link](https://example.com).\n");
    const result = advance(document, state);
    expect(result.result.type).toBe("content");
    if (result.result.type !== "content") throw new Error("expected content");
    expect(result.result.block.type).toBe("Heading");
    if (result.result.block.type !== "Heading") throw new Error("expected Heading");
    const types = result.result.block.children.map((c) => c.type);
    expect(types).toContain("Emphasis");
    expect(types).toContain("Link");
  });
});
