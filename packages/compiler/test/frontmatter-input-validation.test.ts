import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

/** Adds `by` to every `offset` field, the only thing a leading BOM changes. */
function shiftOffsets<T>(value: T, by: number): T {
  return JSON.parse(JSON.stringify(value), (key, v: unknown) =>
    key === "offset" && typeof v === "number" ? v + by : v
  ) as T;
}

const BOM = "﻿";

describe("UTF-8 byte-order mark", () => {
  const sources: Record<string, string> = {
    "frontmatter + scene (LF)": "---\ntitle: T\nentry: start\nstate:\n  n: 1\n---\n@scene start\nHello *you*.\n@goto other\n@scene other\nBye.\n",
    "frontmatter + scene (CRLF)": "---\r\ntitle: T\r\nentry: start\r\n---\r\n@scene start\r\nHello.\r\n@scene b\r\nBye.\r\n",
    "first line is a directive": "@scene start\nHello.\n@set x = 1\n",
    "first line is a heading": "# Title\n\nBody.\n",
    "first line is a presentation command": "@background room.jpg\nHello.\n",
    "diagnostics": "@scene start\n@set = 1\n@goto nowhere\n"
  };

  for (const [name, source] of Object.entries(sources)) {
    it(`${name}: compiles as the BOM-less source, with offsets in the original text`, () => {
      const plain = compile(source);
      const withBom = compile(BOM + source);

      expect(withBom.diagnostics).toEqual(shiftOffsets(plain.diagnostics, 1));
      expect(withBom.document).toEqual(shiftOffsets(plain.document, 1));
    });
  }

  it("recognizes a scene on the first line and slices to the right text", () => {
    const source = BOM + "@scene start\nHello.\n";
    const { document } = compile(source);

    expect(document.scenes.map((s) => s.id)).toEqual(["start"]);
    const span = document.scenes[0]!.span;
    expect(span.start).toEqual({ line: 1, column: 1, offset: 1 });
    expect(source.slice(span.start.offset, span.end.offset)).toBe("@scene start\nHello.");
  });

  it("skips exactly one leading BOM and nothing else", () => {
    const doubled = compile(BOM + BOM + "@scene a\nHi.\n");
    expect(doubled.document.scenes.map((s) => s.id)).toEqual(["main"]); // the second BOM is ordinary text, so line 1 is prose

    const midFile = compile("@scene a\nHi.\n" + BOM + "@scene b\n");
    expect(midFile.document.scenes.map((s) => s.id)).toEqual(["a"]);

    const indented = compile(BOM + " @scene a\nHi.\n");
    expect(indented.document).toEqual(shiftOffsets(compile(" @scene a\nHi.\n").document, 1));
  });

  it("an empty or BOM-only document is the synthetic main scene", () => {
    expect(compile(BOM).document.scenes.map((s) => s.id)).toEqual(["main"]);
    expect(compile(BOM + "\r\n").diagnostics).toEqual([]);
  });
});

describe("frontmatter state: non-finite numbers", () => {
  it.each([".inf", "-.inf", ".nan", ".Inf", ".NaN", "1e999", "-1e999"])("%s is reported and dropped", (literal) => {
    const result = compile(`---\nstate:\n  bad: ${literal}\n  good: 2\n---\n@scene a\nHi.\n`);

    expect(result.diagnostics.map((d) => d.code)).toEqual(["AT1201"]);
    expect(result.diagnostics[0]!.span.start).toMatchObject({ line: 3, column: 8 });
    expect(result.document.initialState).toEqual({ good: 2 });
    expect(JSON.parse(JSON.stringify(result.document.initialState))).toEqual({ good: 2 });
  });

  it("finite numbers, including large and hexadecimal, are unchanged", () => {
    const result = compile("---\nstate:\n  a: 0\n  b: -1.5\n  c: 1e300\n  d: 0x1F\n---\n@scene a\nHi.\n");
    expect(result.diagnostics).toEqual([]);
    expect(result.document.initialState).toEqual({ a: 0, b: -1.5, c: 1e300, d: 31 });
  });
});

describe("frontmatter title and entry types", () => {
  const body = "@scene a\nHi.\n@scene b\nYo.\n";

  it.each([
    ["title: 123", "title"],
    ["title: true", "title"],
    ["entry: 123", "entry"],
    ["entry: false", "entry"],
    ["title:\n  nested: object", "title"],
    ["entry:\n  - list", "entry"]
  ])("`%s` is reported and not used", (yaml, key) => {
    const result = compile(`---\n${yaml}\n---\n${body}`);

    expect(result.diagnostics.map((d) => d.code)).toEqual(["AT1202"]);
    expect(result.diagnostics[0]!.message).toContain(`"${key}" must be a string`);
    // On the value itself (a collection's first entry may be on a later line).
    expect(result.diagnostics[0]!.span.start.line).toBeGreaterThanOrEqual(2);
    expect(result.document.metadata[key as "title" | "entry"]).toBeUndefined();
    expect(result.document.entryScene).toBe("a");
  });

  it("strings are used unchanged, including quoted numbers and booleans", () => {
    const result = compile(`---\ntitle: "123"\nentry: "b"\n---\n${body}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document.metadata).toMatchObject({ title: "123", entry: "b" });
    expect(result.document.entryScene).toBe("b");
  });

  it("an absent or null value stays unset without a diagnostic", () => {
    for (const yaml of ["", "title:\nentry:", "title: null\nentry: ~"]) {
      const result = compile(`---\n${yaml}\n---\n${body}`);
      expect(result.diagnostics).toEqual([]);
      expect(result.document.metadata.title).toBeUndefined();
      expect(result.document.metadata.entry).toBeUndefined();
    }
  });

  it("a YAML syntax error does not add type diagnostics on top of AT1202", () => {
    const result = compile(`---\ntitle: [unclosed\nentry: 5\n---\n${body}`);
    expect(new Set(result.diagnostics.map((d) => d.code))).toEqual(new Set(["AT1202"]));
  });
});
