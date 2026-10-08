import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { compileOk } from "./helpers.js";
import type { HeadingNode } from "../src/ast/story.js";

function heading(source: string): HeadingNode {
  const { document } = compileOk(source);
  const block = document.scenes[0]!.blocks[0]!;
  if (block.type !== "Heading") throw new Error(`expected Heading, got ${block.type}`);
  return block;
}

function nestedHeading(source: string): HeadingNode {
  const { document } = compileOk(source);
  const block = document.scenes[0]!.blocks[0]!;
  if (block.type !== "Conditional") throw new Error("expected Conditional");
  const inner = block.branches[0]!.blocks[0]!;
  if (inner.type !== "Heading") throw new Error(`expected nested Heading, got ${inner.type}`);
  return inner;
}

function contentSlice(source: string, h: HeadingNode): string {
  return source.slice(h.contentSourceSpan.start.offset, h.contentSourceSpan.end.offset);
}

describe("HeadingNode.contentSourceSpan — nonempty ATX", () => {
  it("depth 1-6, plain content", () => {
    for (let depth = 1; depth <= 6; depth++) {
      const marker = "#".repeat(depth);
      const source = `@scene s\n${marker} Heading\n`;
      const h = heading(source);
      expect(h.depth).toBe(depth);
      expect(contentSlice(source, h)).toBe("Heading");
    }
  });

  it("excludes opening marker and single-space separator", () => {
    const source = "@scene s\n# Heading\n";
    const h = heading(source);
    expect(h.contentSourceSpan).toEqual({ start: { line: 2, column: 3, offset: 11 }, end: { line: 2, column: 10, offset: 18 } });
    expect(contentSlice(source, h)).toBe("Heading");
  });

  it("excludes multi-space opening separator", () => {
    const source = "@scene s\n#  Heading\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Heading");
    expect(source.slice(9, h.contentSourceSpan.start.offset)).toBe("#  ");
  });

  it("preserves inline Markdown delimiters inside content", () => {
    const source = "@scene s\n### Hello *world* ###\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Hello *world*");
  });

  it("recognized closing hashes excluded (space-preceded)", () => {
    const source = "@scene s\n### Heading ###\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Heading");
  });

  it("recognized closing hashes excluded (multi-space before closing)", () => {
    const source = "@scene s\n### Heading    ###\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Heading");
  });

  it("recognized closing hashes excluded (tab-preceded)", () => {
    const source = "@scene s\n### Heading\t###\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Heading");
  });

  it("literal hashes with no preceding space remain content", () => {
    const source = "@scene s\n### Heading###\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Heading###");
  });

  it("stray mid-content hash (not at line end) remains content", () => {
    const source = "@scene s\n### Heading # text\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Heading # text");
  });

  it("excludes trailing Heading whitespace", () => {
    const source = "@scene s\n# Heading  \n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Heading");
    expect(h.contentSourceSpan.end.offset).toBeLessThan(h.span.end.offset);
  });

  it("CRLF: exact offsets, no normalization", () => {
    const source = "@scene s\r\n# Heading\r\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Heading");
    expect(source[h.contentSourceSpan.end.offset]).toBe("\r");
  });

  it("Korean content", () => {
    const source = "@scene s\n# 안녕하세요\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("안녕하세요");
  });

  it("emoji content (surrogate pair offsets)", () => {
    const source = "@scene s\n# Hello 👋 world\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Hello 👋 world");
  });

  it("nested inside a Conditional branch", () => {
    const source = "@scene s\n@if true\n## Nested\n@end\n";
    const h = nestedHeading(source);
    expect(h.depth).toBe(2);
    expect(contentSlice(source, h)).toBe("Nested");
  });
});

describe("HeadingNode.contentSourceSpan — empty ATX (zero-width, exact absolute offsets)", () => {
  it("bare marker, depth 1", () => {
    const source = "@scene s\n#\n";
    const h = heading(source);
    expect(h.children).toHaveLength(0);
    expect(h.contentSourceSpan.start.offset).toBe(10);
    expect(h.contentSourceSpan.end.offset).toBe(10);
  });

  it("marker + single trailing separator space", () => {
    const source = "@scene s\n# \n";
    const h = heading(source);
    expect(h.contentSourceSpan.start.offset).toBe(11);
    expect(h.contentSourceSpan.end.offset).toBe(11);
  });

  it("marker + multiple trailing separator spaces", () => {
    const source = "@scene s\n#   \n";
    const h = heading(source);
    expect(h.contentSourceSpan.start.offset).toBe(13);
    expect(h.contentSourceSpan.end.offset).toBe(13);
  });

  it("bare marker, depth 2", () => {
    const source = "@scene s\n##\n";
    const h = heading(source);
    expect(h.depth).toBe(2);
    expect(h.contentSourceSpan.start.offset).toBe(11);
    expect(h.contentSourceSpan.end.offset).toBe(11);
  });

  it("depth 3 + trailing separator, no closing hashes", () => {
    const source = "@scene s\n### \n";
    const h = heading(source);
    expect(h.contentSourceSpan.start.offset).toBe(13);
    expect(h.contentSourceSpan.end.offset).toBe(13);
  });

  it("marker + recognized closing hash syntax (empty content)", () => {
    const source = "@scene s\n### ###\n";
    const h = heading(source);
    expect(h.contentSourceSpan.start.offset).toBe(13);
    expect(h.contentSourceSpan.end.offset).toBe(13);
    expect(source[h.contentSourceSpan.end.offset]).toBe("#");
  });

  it("marker + separator + recognized closing hash syntax (extra opening spaces)", () => {
    const source = "@scene s\n###   ###\n";
    const h = heading(source);
    expect(h.contentSourceSpan.start.offset).toBe(15);
    expect(h.contentSourceSpan.end.offset).toBe(15);
  });

  it("extra-hash empty variant: closing run longer than opening marker", () => {
    const source = "@scene s\n### ######\n";
    const h = heading(source);
    expect(h.contentSourceSpan.start.offset).toBe(13);
    expect(h.contentSourceSpan.end.offset).toBe(13);
  });

  it("extra-hash empty variant: closing run one longer than opening marker", () => {
    const source = "@scene s\n### ####\n";
    const h = heading(source);
    expect(h.contentSourceSpan.start.offset).toBe(13);
    expect(h.contentSourceSpan.end.offset).toBe(13);
  });

  it("depth 6 bare marker + trailing separator", () => {
    const source = "@scene s\n###### \n";
    const h = heading(source);
    expect(h.depth).toBe(6);
    expect(h.contentSourceSpan.start.offset).toBe(16);
    expect(h.contentSourceSpan.end.offset).toBe(16);
  });

  it("depth 6 + recognized closing hash syntax", () => {
    const source = "@scene s\n###### ######\n";
    const h = heading(source);
    expect(h.contentSourceSpan.start.offset).toBe(16);
    expect(h.contentSourceSpan.end.offset).toBe(16);
  });

  it("CRLF: empty bare marker offsets unaffected by CRLF", () => {
    const source = "@scene s\r\n#\r\n";
    const h = heading(source);
    expect(h.contentSourceSpan.start.offset).toBe(h.contentSourceSpan.end.offset);
    expect(source[h.contentSourceSpan.end.offset]).toBe("\r");
  });
});

describe("HeadingNode.contentSourceSpan — Setext", () => {
  it("= underline, depth 1", () => {
    const source = "@scene s\nHello *world*\n=============\n";
    const h = heading(source);
    expect(h.depth).toBe(1);
    expect(contentSlice(source, h)).toBe("Hello *world*");
  });

  it("- underline, depth 2", () => {
    const source = "@scene s\nHeading\n-------\n";
    const h = heading(source);
    expect(h.depth).toBe(2);
    expect(contentSlice(source, h)).toBe("Heading");
  });

  it("excludes the underline and the EOL before it", () => {
    const source = "@scene s\nOld heading\n===========\n";
    const h = heading(source);
    expect(h.contentSourceSpan.end.offset).toBeLessThan(h.span.end.offset);
    expect(source.slice(h.contentSourceSpan.end.offset, h.span.end.offset)).toBe("\n===========");
  });

  it("inline Markdown preserved in content", () => {
    const source = "@scene s\nHello *world* and `code`\n=============\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Hello *world* and `code`");
  });

  it("indentation (up to 3 spaces, CommonMark-legal) excluded from content", () => {
    const source = "@scene s\n  Heading\n  -------\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Heading");
  });

  it("CRLF: underline excluded, exact offsets", () => {
    const source = "@scene s\r\nHeading\r\n=======\r\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("Heading");
    expect(source[h.contentSourceSpan.end.offset]).toBe("\r");
  });

  it("Korean content", () => {
    const source = "@scene s\n안녕하세요\n=======\n";
    const h = heading(source);
    expect(contentSlice(source, h)).toBe("안녕하세요");
  });
});

describe("HeadingNode.contentSourceSpan — non-optional (regression guard)", () => {
  it("every Heading, including empty ones, publishes a usable contentSourceSpan", () => {
    const sources = ["@scene s\n#\n", "@scene s\n# Heading\n", "@scene s\nHeading\n=======\n"];
    for (const source of sources) {
      const h = heading(source);
      expect(h.contentSourceSpan).toBeDefined();
      expect(h.contentSourceSpan.start.offset).toBeLessThanOrEqual(h.contentSourceSpan.end.offset);
    }
  });

  it("empty Setext content does not produce an empty-content HeadingNode at all", () => {
    const { document } = compileOk("@scene s\n=======\n");
    const block = document.scenes[0]!.blocks[0]!;
    expect(block.type).toBe("Paragraph");
  });
});
