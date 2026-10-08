import { describe, expect, it } from "vitest";
import { compileOk } from "./helpers.js";
import type { HeadingNode } from "../src/ast/story.js";

function heading(source: string): HeadingNode {
  const { document } = compileOk(source);
  const block = document.scenes[0]!.blocks[0]!;
  if (block.type !== "Heading") throw new Error(`expected Heading, got ${block.type}`);
  return block;
}

function levelSlice(source: string, h: HeadingNode): string {
  return source.slice(h.levelSourceSpan.start.offset, h.levelSourceSpan.end.offset);
}

describe("HeadingNode.levelSourceSpan — ATX", () => {
  it("depth 1-6, plain content", () => {
    for (let depth = 1; depth <= 6; depth++) {
      const marker = "#".repeat(depth);
      const source = `@scene s\n${marker} Heading\n`;
      const h = heading(source);
      expect(h.depth).toBe(depth);
      expect(levelSlice(source, h)).toBe(marker);
    }
  });

  it("excludes single-space opening separator and content", () => {
    const source = "@scene s\n# Heading\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("#");
    expect(h.levelSourceSpan).toEqual({ start: { line: 2, column: 1, offset: 9 }, end: { line: 2, column: 2, offset: 10 } });
  });

  it("excludes multiple opening separator spaces", () => {
    const source = "@scene s\n###   Heading\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("###");
  });

  it("excludes recognized closing hashes (space-preceded)", () => {
    const source = "@scene s\n### Heading ###\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("###");
  });

  it("excludes recognized closing hashes with multi-space opening separator", () => {
    const source = "@scene s\n###   Heading ###\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("###");
  });

  it("literal hashes with no preceding space remain content, not level", () => {
    const source = "@scene s\n### Heading###\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("###");
    expect(h.children.map((c) => (c.type === "Text" ? c.value : ""))).toEqual(["Heading###"]);
  });

  it("excludes trailing Heading whitespace", () => {
    const source = "@scene s\n# Heading  \n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("#");
  });

  it("CRLF: exact offsets, no normalization", () => {
    const source = "@scene s\r\n### Heading\r\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("###");
  });

  it("Korean content does not affect level span offsets", () => {
    const source = "@scene s\n## 안녕하세요\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("##");
  });

  it("emoji content does not affect level span offsets", () => {
    const source = "@scene s\n## Hello 👋 world\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("##");
  });

  it("bare empty marker, depth 1", () => {
    const source = "@scene s\n#\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("#");
  });

  it("empty marker + separator, no closing hashes", () => {
    const source = "@scene s\n###   \n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("###");
  });

  it("empty marker + recognized closing hash syntax", () => {
    const source = "@scene s\n### ###\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("###");
    expect(source[h.levelSourceSpan.end.offset]).toBe(" ");
  });

  it("extra-hash empty variant: closing run longer than opening marker", () => {
    const source = "@scene s\n### ######\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("###");
  });

  it("depth 6 bare marker", () => {
    const source = "@scene s\n###### \n";
    const h = heading(source);
    expect(h.depth).toBe(6);
    expect(levelSlice(source, h)).toBe("######");
  });

  it("depth 6 + recognized closing hash syntax", () => {
    const source = "@scene s\n###### ######\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("######");
  });
});

describe("HeadingNode.levelSourceSpan — Setext", () => {
  it("= underline, depth 1", () => {
    const source = "@scene s\nHeading\n=======\n";
    const h = heading(source);
    expect(h.depth).toBe(1);
    expect(levelSlice(source, h)).toBe("=======");
  });

  it("- underline, depth 2", () => {
    const source = "@scene s\nHeading\n-------\n";
    const h = heading(source);
    expect(h.depth).toBe(2);
    expect(levelSlice(source, h)).toBe("-------");
  });

  it("excludes content and the EOL before the underline", () => {
    const source = "@scene s\nHeading\n=======\n";
    const h = heading(source);
    expect(h.levelSourceSpan.start.offset).toBeGreaterThan(h.contentSourceSpan.end.offset);
    expect(source.slice(h.contentSourceSpan.end.offset, h.levelSourceSpan.start.offset)).toBe("\n");
  });

  it("excludes underline indentation (up to 3 spaces, CommonMark-legal)", () => {
    const source = "@scene s\n  Heading\n  -------\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("-------");
    expect(source[h.levelSourceSpan.start.offset - 1]).toBe(" ");
  });

  it("excludes trailing underline whitespace", () => {
    const source = "@scene s\nHeading\n=======   \n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("=======");
    expect(h.levelSourceSpan.end.offset).toBeLessThan(h.span.end.offset);
  });

  it("preserves exact underline length distinct from content length", () => {
    const source = "@scene s\nHi\n==========\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("==========");
    expect(levelSlice(source, h).length).toBe(10);
  });

  it("inline Markdown content does not affect underline span", () => {
    const source = "@scene s\nHello *world* and `code`\n=============\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("=============");
  });

  it("CRLF: underline span excludes CR/LF, exact offsets", () => {
    const source = "@scene s\r\nHeading\r\n=======\r\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("=======");
    expect(source[h.levelSourceSpan.end.offset]).toBe("\r");
  });

  it("Korean content does not affect underline span", () => {
    const source = "@scene s\n한글 제목\n=======\n";
    const h = heading(source);
    expect(levelSlice(source, h)).toBe("=======");
  });
});
