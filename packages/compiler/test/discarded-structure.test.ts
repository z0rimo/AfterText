import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

/** Structural shape of a document: every source-position field removed. */
function shape(source: string): unknown {
  return JSON.parse(
    JSON.stringify(compile(source).document.scenes, (key, value) =>
      key === "span" || key.endsWith("SourceSpan") || key === "followingLineEnding" ? undefined : value
    )
  );
}

function codes(source: string): string[] {
  return compile(source).diagnostics.map((d) => d.code);
}

describe("AT1009: known directive outside the construct where it is valid", () => {
  // The tree must equal the one for the same source with the offending line
  // blanked: recovery drops the line (it still separates paragraphs), never
  // reinterprets it. Only the diagnostic is new.
  const cases: ReadonlyArray<{ name: string; source: string; line: number; text: string }> = [
    { name: "top-level @else", source: "A.\n@else\nB.", line: 2, text: "@else" },
    { name: "top-level @elseif", source: "A.\n@elseif x\nB.", line: 2, text: "@elseif x" },
    { name: "top-level @when", source: "A.\n@when x\nB.", line: 2, text: "@when x" },
    { name: "top-level @otherwise", source: "A.\n@otherwise\nB.", line: 2, text: "@otherwise" },
    { name: "top-level @end", source: "A.\n@end\nB.", line: 2, text: "@end" },
    {
      name: "extra @end after a closed construct",
      source: "@if true\nA.\n@end\n@end",
      line: 4,
      text: "@end"
    },
    {
      name: "@else inside @variant",
      source: "@variant v\n@when true\nA.\n@else\nB.\n@end",
      line: 4,
      text: "@else"
    },
    {
      name: "@elseif inside @variant",
      source: "@variant v\n@when true\nA.\n@elseif true\nB.\n@end",
      line: 4,
      text: "@elseif true"
    },
    {
      name: "@when inside @if",
      source: "@if true\nA.\n@when x\nB.\n@end",
      line: 3,
      text: "@when x"
    },
    {
      name: "@otherwise inside @if",
      source: "@if true\nA.\n@otherwise\nB.\n@end",
      line: 3,
      text: "@otherwise"
    },
    {
      name: "@set inside @choice",
      source: "@choice\n@set x = 1\n- A -> a\n@end\n@scene a\nx",
      line: 2,
      text: "@set x = 1"
    },
    {
      name: "@goto inside @choice",
      source: "@choice\n@goto a\n- A -> a\n@end\n@scene a\nx",
      line: 2,
      text: "@goto a"
    },
    {
      name: "@if inside @choice",
      source: "@choice\n@if true\n- A -> a\n@end\n@scene a\nx",
      line: 2,
      text: "@if true"
    },
    {
      name: "presentation directive inside @choice",
      source: "@choice\n@background hall.png\n- A -> a\n@end\n@scene a\nx",
      line: 2,
      text: "@background hall.png"
    }
  ];

  it.each(cases)("$name: one AT1009 on the directive line, recovery tree unchanged", (c) => {
    const result = compile(c.source);
    const found = result.diagnostics.filter((d) => d.code === "AT1009");
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe("error");
    expect(found[0]!.span.start).toMatchObject({ line: c.line, column: 1 });
    expect(found[0]!.span.end).toMatchObject({ line: c.line, column: c.text.length + 1 });
    expect(result.hasErrors).toBe(true);
    const blanked = c.source
      .split("\n")
      .map((l, i) => (i === c.line - 1 ? "" : l))
      .join("\n");
    expect(shape(c.source)).toEqual(shape(blanked));
  });

  it("an extra @end after nesting is reported once per extra line", () => {
    expect(codes("@if true\nA.\n@end\n@end\n@end")).toEqual(["AT1009", "AT1009"]);
  });

  it("ordinary narrative inside @choice stays a silent skip", () => {
    const source = "@choice\nNarrative line.\n- A -> a\n@end\n@scene a\nx";
    expect(codes(source)).toEqual([]);
  });

  it("reports an unknown directive inside @choice as AT1001, not AT1009", () => {
    expect(codes("@choice\n@bogus\n- A -> a\n@end\n@scene a\nx")).toEqual(["AT1001"]);
  });

  it("does not report correctly placed branches", () => {
    expect(codes("@if true\nA.\n@elseif false\nB.\n@else\nC.\n@end")).toEqual([]);
    expect(codes("@variant v\n@when true\nA.\n@otherwise\nB.\n@end")).toEqual([]);
  });
});

describe("AT1105: content before a variant's first branch", () => {
  it("diagnoses prose and keeps the existing Variant tree", () => {
    const source = "@variant v\nLost prose.\n@when true\nA.\n@end";
    const result = compile(source);
    const found = result.diagnostics.filter((d) => d.code === "AT1105");
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe("error");
    expect(shape(source)).toEqual(shape("@variant v\n\n@when true\nA.\n@end"));
  });

  it("diagnoses a heading", () => {
    expect(codes("@variant v\n# Title\n@when true\nA.\n@end")).toEqual(["AT1105"]);
  });

  it("diagnoses a presentation block", () => {
    expect(codes("@variant v\n@background hall.png\n@when true\nA.\n@end")).toEqual(["AT1105"]);
  });

  it("does not diagnose a variant that starts with @when", () => {
    expect(codes("@variant v\n@when true\nA.\n@end")).toEqual([]);
    expect(codes("@variant v\n\n@when true\nA.\n@end")).toEqual([]);
  });

  it("spans from the first to the last discarded block", () => {
    const source = "@variant v\nFirst.\n\nSecond.\n@when true\nA.\n@end";
    const d = compile(source).diagnostics.find((x) => x.code === "AT1105")!;
    expect(d.span.start).toEqual({ line: 2, column: 1, offset: 11 });
    expect(d.span.end).toEqual({ line: 4, column: 8, offset: 26 });
    expect(source.slice(d.span.start.offset, d.span.end.offset)).toBe("First.\n\nSecond.");
  });

  it("has exact offsets with CRLF line endings", () => {
    const source = "@variant v\r\nFirst.\r\n\r\nSecond.\r\n@when true\r\nA.\r\n@end";
    const d = compile(source).diagnostics.find((x) => x.code === "AT1105")!;
    expect(source.slice(d.span.start.offset, d.span.end.offset)).toBe("First.\r\n\r\nSecond.");
    expect(d.span.start).toMatchObject({ line: 2, column: 1 });
    expect(d.span.end).toMatchObject({ line: 4, column: 8 });
  });
});
