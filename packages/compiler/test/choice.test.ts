import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { codesOf, compileOk } from "./helpers.js";

describe("@choice", () => {
  it("parses items with and without conditions", () => {
    const source = [
      "@scene s",
      "@choice",
      "",
      "* Open the door -> room",
      "* Run away -> street",
      "* Use the key -> basement if has_key",
      "",
      "@end",
      "",
      "@scene room",
      "@scene street",
      "@scene basement"
    ].join("\n");

    const { document } = compileOk(source);
    const block = document.scenes[0]!.blocks[0]!;
    if (block.type !== "Choice") throw new Error("expected Choice");
    expect(block.items).toHaveLength(3);

    expect(block.items[0]).toMatchObject({ text: "Open the door", target: "room", condition: undefined });
    expect(block.items[1]).toMatchObject({ text: "Run away", target: "street", condition: undefined });

    const conditional = block.items[2]!;
    expect(conditional.text).toBe("Use the key");
    expect(conditional.target).toBe("basement");
    expect(conditional.condition).toEqual(
      expect.objectContaining({ type: "Identifier", name: "has_key" })
    );
  });

  it("reports AT1004 for a choice item targeting an unknown scene", () => {
    const source = ["@scene s", "@choice", "* Go -> nowhere", "@end"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1004");
  });

  it("reports AT1002 for a choice missing @end", () => {
    const source = ["@scene s", "@choice", "* Go -> s"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1002");
  });

  it("supports \"-\" as a bullet marker, not just \"*\"", () => {
    const source = ["@scene s", "@choice", "- Go -> s", "@end"].join("\n");
    const { document } = compileOk(source);
    const block = document.scenes[0]!.blocks[0]!;
    if (block.type !== "Choice") throw new Error("expected Choice");
    expect(block.items).toMatchObject([{ text: "Go", target: "s", condition: undefined }]);
  });

  describe("hardened target/condition parsing", () => {
    it('does not treat "if" inside display text as a condition delimiter', () => {
      const source = ["@scene stay", "@choice", "- What if I stay? -> stay", "@end"].join("\n");
      const { document } = compileOk(source);
      const block = document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toMatchObject([
        { text: "What if I stay?", target: "stay", condition: undefined }
      ]);
    });

    it('recognizes "if" as a condition delimiter only after the target', () => {
      const source = [
        "@scene stay",
        "@set has_key = true",
        "@choice",
        "- Stay here -> stay if has_key",
        "@end"
      ].join("\n");
      const { document } = compileOk(source);
      const choice = document.scenes[0]!.blocks.find((b) => b.type === "Choice");
      if (!choice || choice.type !== "Choice") throw new Error("expected Choice");
      expect(choice.items).toHaveLength(1);
      expect(choice.items[0]!.text).toBe("Stay here");
      expect(choice.items[0]!.target).toBe("stay");
      expect(choice.items[0]!.condition).toEqual(
        expect.objectContaining({ type: "Identifier", name: "has_key" })
      );
    });

    it("preserves an escaped arrow in display text while the final unescaped arrow is the delimiter", () => {
      const source = [
        "@scene s",
        "@choice",
        "- A \\-> B라고 적힌 문을 연다 -> strange-room",
        "@end",
        "",
        "@scene strange-room"
      ].join("\n");
      const { document } = compileOk(source);
      const block = document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toHaveLength(1);
      expect(block.items[0]!.text).toBe("A -> B라고 적힌 문을 연다");
      expect(block.items[0]!.target).toBe("strange-room");
      expect(block.items[0]!.condition).toBeUndefined();
    });
  });

  describe("malformed items are diagnosed, not silently dropped (AT1005)", () => {
    it("accepts a valid basic item as a control case", () => {
      const source = ["@scene s", "@choice", "- Go -> room", "@end", "@scene room"].join("\n");
      const { document } = compileOk(source);
      const block = document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toMatchObject([{ text: "Go", target: "room" }]);
    });

    it("accepts a hyphen/underscore target as a control case", () => {
      const source = ["@scene s", "@choice", "- Go -> weird_room-2", "@end", "@scene weird_room-2"].join(
        "\n"
      );
      const { document } = compileOk(source);
      const block = document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toMatchObject([{ text: "Go", target: "weird_room-2" }]);
    });

    it("reports AT1005 and drops the item for a target starting with a digit", () => {
      const source = ["@scene s", "@choice", "- Go -> 123", "@end"].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toEqual(["AT1005"]);
      const block = result.document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toHaveLength(0);
    });

    it("reports AT1005 for a target containing whitespace", () => {
      const source = ["@scene s", "@choice", "- Go -> north room", "@end"].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toEqual(["AT1005"]);
      expect(result.diagnostics[0]!.message).toContain('invalid target "north room"');
    });

    it("reports AT1005 for a target containing a colon", () => {
      const source = ["@scene s", "@choice", "- Go -> foo:bar", "@end"].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toEqual(["AT1005"]);
    });

    it("reports AT1005 for a target beginning with an underscore", () => {
      const source = ["@scene s", "@choice", "- Go -> _under", "@end"].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toEqual(["AT1005"]);
    });

    it("reports AT1005 for a bullet line with no arrow at all", () => {
      const source = ["@scene s", "@choice", "- just some text", "@end"].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toEqual(["AT1005"]);
      expect(result.diagnostics[0]!.message).toContain('missing "-> target"');
      const block = result.document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toHaveLength(0);
    });

    it("still reports AT1004 (not AT1005) for a syntactically valid but unknown target", () => {
      const source = ["@scene s", "@choice", "- Go -> nowhere", "@end"].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toEqual(["AT1004"]);
      const block = result.document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toMatchObject([{ text: "Go", target: "nowhere" }]);
    });

    it("allows a forward reference to a scene declared later in the document", () => {
      const source = ["@scene s", "@choice", "- Go -> later", "@end", "@scene later"].join("\n");
      const { document } = compileOk(source);
      const block = document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toMatchObject([{ text: "Go", target: "later" }]);
    });

    it("keeps a valid sibling item and reports AT1005 only for the malformed one", () => {
      const source = [
        "@scene s",
        "@choice",
        "- Valid -> good",
        "- Invalid -> 123",
        "@end",
        "@scene good"
      ].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toEqual(["AT1005"]);
      const block = result.document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toMatchObject([{ text: "Valid", target: "good" }]);
    });

    it("still parses a valid optional condition alongside a valid target", () => {
      const source = ["@scene s", "@choice", "- Go -> room if has_key", "@end", "@scene room"].join("\n");
      const { document } = compileOk(source);
      const block = document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toHaveLength(1);
      expect(block.items[0]!.target).toBe("room");
      expect(block.items[0]!.condition).toEqual(
        expect.objectContaining({ type: "Identifier", name: "has_key" })
      );
    });

    it("preserves existing AT2001 malformed-expression diagnostics for a bad condition, without masking them behind AT1005", () => {
      const source = ["@scene s", "@choice", "- Go -> room if 1 +", "@end", "@scene room"].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toEqual(["AT2001"]);
      const block = result.document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      // The target itself was valid — only its condition failed — so the
      // item still survives with target set and condition omitted, exactly
      // as it already did before this fix (unrelated to AT1005).
      expect(block.items).toMatchObject([{ text: "Go", target: "room", condition: undefined }]);
    });

    it("still finds the final unescaped arrow as the delimiter when item text contains an earlier one", () => {
      const source = ["@scene s", "@choice", "- Turn left -> right -> room", "@end", "@scene room"].join(
        "\n"
      );
      const { document } = compileOk(source);
      const block = document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toMatchObject([{ text: "Turn left -> right", target: "room" }]);
    });

    it("accepts Korean and emoji item text unaffected by the new diagnostic", () => {
      const source = ["@scene s", "@choice", "- 문을 연다 🎉 -> room", "@end", "@scene room"].join("\n");
      const { document } = compileOk(source);
      const block = document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toMatchObject([{ text: "문을 연다 🎉", target: "room" }]);
    });

    it("leaves an empty choice (zero items) at zero diagnostics, unchanged from existing locked behavior", () => {
      const source = ["@scene s", "@choice", "@end"].join("\n");
      const { document } = compileOk(source);
      const block = document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toHaveLength(0);
    });

    it("still silently skips unrelated non-bullet narrative lines inside @choice", () => {
      const source = [
        "@scene s",
        "@choice",
        "- Go -> room",
        "A narrative line that is not an item.",
        "@end",
        "@scene room"
      ].join("\n");
      const { document } = compileOk(source);
      const block = document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      expect(block.items).toMatchObject([{ text: "Go", target: "room" }]);
    });

    it("anchors the AT1005 span on the invalid target segment, not the whole line", () => {
      const source = ["@scene s", "@choice", "- Go -> north room", "@end"].join("\n");
      const result = compile(source);
      const diagnostic = result.diagnostics.find((d) => d.code === "AT1005")!;
      const line = source.split("\n")[2]!;
      expect(line.slice(diagnostic.span.start.column - 1, diagnostic.span.end.column - 1)).toBe(
        "north room"
      );
    });
  });

  describe("conditionSourceSpan", () => {
    function slice(source: string, span: { start: { offset: number }; end: { offset: number } }): string {
      return source.slice(span.start.offset, span.end.offset);
    }

    function firstItem(source: string) {
      const { document } = compileOk(source);
      const block = document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      return block.items[0]!;
    }

    it("slices exactly the condition text for a simple identifier", () => {
      const source = ["@scene s", "@choice", "- Go -> north if has_key", "@end", "@scene north"].join("\n");
      const item = firstItem(source);
      expect(item.conditionSourceSpan).toBeDefined();
      expect(slice(source, item.conditionSourceSpan!)).toBe("has_key");
    });

    it("slices the full parenthesized text when parens wrap the entire condition", () => {
      const source = ["@scene s", "@choice", "- Go -> north if (has_key)", "@end", "@scene north"].join("\n");
      const item = firstItem(source);
      expect(slice(source, item.conditionSourceSpan!)).toBe("(has_key)");
    });

    it("slices nested parentheses that fully wrap the condition", () => {
      const source = ["@scene s", "@choice", "- Go -> north if ((has_key))", "@end", "@scene north"].join("\n");
      const item = firstItem(source);
      expect(slice(source, item.conditionSourceSpan!)).toBe("((has_key))");
    });

    it("slices exactly the condition text, including an internal parenthesized sub-term, for an arithmetic expression", () => {
      const source = ["@scene s", "@choice", "- Go -> north if a + b * (c - d)", "@end", "@scene north"].join("\n");
      const item = firstItem(source);
      expect(slice(source, item.conditionSourceSpan!)).toBe("a + b * (c - d)");
    });

    it("preserves unusual-but-valid internal whitespace exactly", () => {
      const source = ["@scene s", "@choice", "- Go -> north if   has_key  &&  flag  ", "@end", "@scene north"].join("\n");
      const item = firstItem(source);
      expect(slice(source, item.conditionSourceSpan!)).toBe("has_key  &&  flag");
    });

    it("handles CRLF line endings", () => {
      const source = ["@scene s", "@choice", "- Go -> north if has_key", "@end", "@scene north"].join("\r\n") + "\r\n";
      const item = firstItem(source);
      expect(slice(source, item.conditionSourceSpan!)).toBe("has_key");
    });

    it(
      "load-bearing proof: conditionSourceSpan is correct for a precedence-significant parenthesized " +
        "condition, while condition.span (the Expression AST's own span) is incomplete for the same fixture",
      () => {
        const source = ["@scene s", "@choice", "- Go -> north if (has_key || flag) && !done", "@end", "@scene north"].join(
          "\n"
        );
        const item = firstItem(source);
        const expected = "(has_key || flag) && !done";

        expect(slice(source, item.conditionSourceSpan!)).toBe(expected);
        // condition.span silently drops the opening "(" here, because the
        // expression parser returns the inner node directly for a
        // parenthesized sub-expression without widening its span — this is
        // the exact bug conditionSourceSpan exists to work around.
        expect(slice(source, item.condition!.span)).not.toBe(expected);
        expect(slice(source, item.condition!.span)).toBe("has_key || flag) && !done");
      }
    );

    it("also demonstrates the condition.span discrepancy for a leading-parenthesized arithmetic sub-term", () => {
      const source = ["@scene s", "@choice", "- Go -> north if (a + b) * c", "@end", "@scene north"].join("\n");
      const item = firstItem(source);
      expect(slice(source, item.conditionSourceSpan!)).toBe("(a + b) * c");
      expect(slice(source, item.condition!.span)).toBe("a + b) * c");
    });

    it("is undefined for an unconditional item", () => {
      const source = ["@scene s", "@choice", "- Go -> north", "@end", "@scene north"].join("\n");
      const item = firstItem(source);
      expect(item.condition).toBeUndefined();
      expect(item.conditionSourceSpan).toBeUndefined();
    });

    it("remains populated as a source fact even when the condition expression itself fails to parse", () => {
      const source = ["@scene s", "@choice", "- Go -> north if 1 +", "@end", "@scene north"].join("\n");
      const result = compile(source);
      expect(codesOf(result.diagnostics)).toContain("AT2001");

      const block = result.document.scenes[0]!.blocks[0]!;
      if (block.type !== "Choice") throw new Error("expected Choice");
      const item = block.items[0]!;

      expect(item.condition).toBeUndefined();
      expect(item.conditionSourceSpan).toBeDefined();
      expect(slice(source, item.conditionSourceSpan!)).toBe("1 +");
    });
  });
});
