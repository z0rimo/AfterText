import { describe, expect, it } from "vitest";
import { compileOk } from "./helpers.js";

describe("source span accuracy", () => {
  it("anchors a scene span at its @scene directive", () => {
    const source = "@scene intro\nHello.\n";
    const { document } = compileOk(source);
    const scene = document.scenes[0]!;
    expect(scene.span.start).toEqual({ line: 1, column: 1, offset: 0 });
  });

  it("anchors a paragraph on a later line at the correct line/column/offset", () => {
    const source = "@scene intro\n\nSecond line paragraph.\n";
    const { document } = compileOk(source);
    const paragraph = document.scenes[0]!.blocks[0]!;
    expect(paragraph.type).toBe("Paragraph");
    // "Second line paragraph." begins on line 3, column 1.
    expect(paragraph.span.start.line).toBe(3);
    expect(paragraph.span.start.column).toBe(1);
    expect(paragraph.span.start.offset).toBe(source.indexOf("Second line"));
  });

  it("anchors inline text nested inside a paragraph at its true column", () => {
    const source = "@scene s\nPrefix *emphasis* suffix.\n";
    const { document } = compileOk(source);
    const paragraph = document.scenes[0]!.blocks[0]!;
    if (paragraph.type !== "Paragraph") throw new Error("expected Paragraph");
    const emphasis = paragraph.children.find((c) => c.type === "Emphasis");
    expect(emphasis).toBeDefined();
    // "*emphasis*" begins right after "Prefix " on line 2.
    const expectedColumn = "Prefix ".length + 1;
    expect(emphasis!.span.start.line).toBe(2);
    expect(emphasis!.span.start.column).toBe(expectedColumn);
  });

  it("anchors a directive argument's expression span past the directive name", () => {
    const source = "@scene s\n@set timeline = timeline + 1\n";
    const { document } = compileOk(source);
    const block = document.scenes[0]!.blocks[0]!;
    if (block.type !== "Set") throw new Error("expected Set");
    const rhsColumn = "@set timeline = ".length + 1;
    expect(block.expression.span.start.line).toBe(2);
    expect(block.expression.span.start.column).toBe(rhsColumn);
  });

  it("keeps offsets correct across CRLF line endings", () => {
    const source = "@scene s\r\nFirst.\r\n\r\nSecond.\r\n";
    const { document } = compileOk(source);
    const [first, second] = document.scenes[0]!.blocks;
    expect(first!.span.start.offset).toBe(source.indexOf("First."));
    expect(second!.span.start.offset).toBe(source.indexOf("Second."));
  });
});
