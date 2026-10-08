import { describe, expect, it } from "vitest";
import { advance } from "../src/index.js";
import { freshState } from "./helpers.js";

/**
 * docs/CORE_SPEC.md Section 25.50 (Heading Level Source Span) — confirms a
 * Heading whose DEPTH was changed by replacing exactly its
 * `levelSourceSpan` presents the NEW depth correctly under real
 * `advance()`, with its authored content and style untouched, and no
 * Runtime change involved. The "before"/"after" source pairs below stand in
 * for what such a narrow patch produces.
 */
describe("Heading Level Editing — level-edited Runtime regression", () => {
  it("a freshly recompiled document presents the EDITED ATX Heading depth, with content untouched", () => {
    const before = freshState("@scene s\n# Heading\n");
    const beforeAdvance = advance(before.document, before.state);
    expect(beforeAdvance.result.type).toBe("content");
    if (beforeAdvance.result.type !== "content") throw new Error("expected content");
    expect(beforeAdvance.result.block.type).toBe("Heading");
    if (beforeAdvance.result.block.type !== "Heading") throw new Error("expected Heading");
    expect(beforeAdvance.result.block.depth).toBe(1);

    // Exactly what a narrow levelSourceSpan replacement
    // produces: only the opening marker changes, content is untouched — a
    // brand new, independent compile + RuntimeState, never a migrated one.
    const after = freshState("@scene s\n#### Heading\n");
    const afterAdvance = advance(after.document, after.state);
    expect(afterAdvance.result.type).toBe("content");
    if (afterAdvance.result.type !== "content") throw new Error("expected content");
    expect(afterAdvance.result.block.type).toBe("Heading");
    if (afterAdvance.result.block.type !== "Heading") throw new Error("expected Heading");
    expect(afterAdvance.result.block.depth).toBe(4);
    const afterText = afterAdvance.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
    expect(afterText).toBe("Heading");
  });

  it("a freshly recompiled document presents the EDITED Setext Heading depth (H1 -> H2), with content and underline style untouched", () => {
    const before = freshState("@scene s\nHeading\n=======\n");
    const beforeAdvance = advance(before.document, before.state);
    expect(beforeAdvance.result.type).toBe("content");
    if (beforeAdvance.result.type !== "content") throw new Error("expected content");
    expect(beforeAdvance.result.block.type).toBe("Heading");
    if (beforeAdvance.result.block.type !== "Heading") throw new Error("expected Heading");
    expect(beforeAdvance.result.block.depth).toBe(1);

    // A narrow levelSourceSpan patch swaps only the underline
    // marker character, preserving its exact length.
    const after = freshState("@scene s\nHeading\n-------\n");
    const afterAdvance = advance(after.document, after.state);
    expect(afterAdvance.result.type).toBe("content");
    if (afterAdvance.result.type !== "content") throw new Error("expected content");
    expect(afterAdvance.result.block.type).toBe("Heading");
    if (afterAdvance.result.block.type !== "Heading") throw new Error("expected Heading");
    expect(afterAdvance.result.block.depth).toBe(2);
    const afterText = afterAdvance.result.block.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
    expect(afterText).toBe("Heading");
  });

  it("inline Markdown content survives a level-only change, rendering with the expected inline AST", () => {
    const { document, state } = freshState("@scene s\n###### Hello *world* and [a link](https://example.com).\n");
    const result = advance(document, state);
    expect(result.result.type).toBe("content");
    if (result.result.type !== "content") throw new Error("expected content");
    expect(result.result.block.type).toBe("Heading");
    if (result.result.block.type !== "Heading") throw new Error("expected Heading");
    expect(result.result.block.depth).toBe(6);
    const types = result.result.block.children.map((c) => c.type);
    expect(types).toContain("Emphasis");
    expect(types).toContain("Link");
  });
});
