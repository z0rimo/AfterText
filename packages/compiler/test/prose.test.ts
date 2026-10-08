import { describe, expect, it } from "vitest";
import { compileOk } from "./helpers.js";

describe("prose-only document", () => {
  it("compiles plain markdown paragraphs into an implicit scene", () => {
    const { document } = compileOk("Hello world.\n\nThis is *emphasis* and **strong**.\n");

    expect(document.scenes).toHaveLength(1);
    const scene = document.scenes[0]!;
    expect(scene.id).toBe("main");
    expect(scene.blocks).toHaveLength(2);

    const [first, second] = scene.blocks;
    expect(first!.type).toBe("Paragraph");
    expect(second!.type).toBe("Paragraph");
  });

  it("converts inline emphasis, strong, and links", () => {
    const { document } = compileOk("Hi [link](https://example.com) and `code`.\n");
    const paragraph = document.scenes[0]!.blocks[0]!;
    expect(paragraph.type).toBe("Paragraph");
    if (paragraph.type !== "Paragraph") throw new Error("unreachable");

    const types = paragraph.children.map((c) => c.type);
    expect(types).toContain("Link");
    expect(types).toContain("InlineCode");
  });

  it("supports headings", () => {
    const { document } = compileOk("# Title\n\nBody text.\n");
    const [heading, paragraph] = document.scenes[0]!.blocks;
    expect(heading?.type).toBe("Heading");
    if (heading?.type === "Heading") {
      expect(heading.depth).toBe(1);
    }
    expect(paragraph?.type).toBe("Paragraph");
  });

  it("treats an escaped @ as literal text, not a directive", () => {
    const { document, diagnostics } = compileOk("\\@example is not a directive.\n");
    expect(diagnostics).toHaveLength(0);
    const paragraph = document.scenes[0]!.blocks[0]!;
    expect(paragraph.type).toBe("Paragraph");
    if (paragraph.type !== "Paragraph") throw new Error("unreachable");
    const text = paragraph.children.map((c) => (c.type === "Text" ? c.value : "")).join("");
    expect(text.startsWith("@example")).toBe(true);
  });
});
