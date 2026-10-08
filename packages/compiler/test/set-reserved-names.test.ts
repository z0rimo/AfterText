import { describe, expect, it } from "vitest";
import { compile, type Diagnostic } from "../src/index.js";
import type { SetNode, StoryBlock } from "../src/ast/story.js";
import { compileOk } from "./helpers.js";

function errorsOf(source: string): Diagnostic[] {
  return compile(source).diagnostics.filter((d) => d.severity === "error");
}

function setsIn(blocks: readonly StoryBlock[]): SetNode[] {
  return blocks.flatMap((block): SetNode[] => {
    if (block.type === "Set") return [block];
    if (block.type === "Conditional" || block.type === "Variant") {
      return block.branches.flatMap((branch) => setsIn(branch.blocks));
    }
    return [];
  });
}

const RESERVED = ["true", "false", "null"] as const;

describe("reserved Set variable names", () => {
  for (const name of RESERVED) {
    it(`rejects \`@set ${name} = 1\` with AT2001 on the name and emits no SetNode`, () => {
      const source = `@scene s\n@set ${name} = 1\n`;
      const result = compile(source);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe("AT2001");
      expect(errors[0]!.message).toBe(
        `Malformed expression: "${name}" is a reserved word and cannot be a variable name`
      );
      expect(errors[0]!.span.start).toEqual({ line: 2, column: 6, offset: 14 });
      expect(errors[0]!.span.end).toEqual({ line: 2, column: 6 + name.length, offset: 14 + name.length });
      expect(source.slice(errors[0]!.span.start.offset, errors[0]!.span.end.offset)).toBe(name);
      expect(setsIn(result.document.scenes[0]!.blocks)).toHaveLength(0);
    });
  }

  it("does not silently accept the real defect: `@set true = 123` then `@set result = true`", () => {
    const source = "@scene s\n@set true = 123\n@set result = true\n";
    const errors = errorsOf(source);
    expect(errors.map((d) => d.code)).toEqual(["AT2001"]);
    expect(errors[0]!.message).toContain('"true" is a reserved word');
  });

  it("rejects a reserved name nested inside a Conditional branch, keeping the valid sibling", () => {
    const source = "@scene s\n@if true\n@set null = 1\n@set ok = 2\n@end\n";
    const result = compile(source);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["AT2001"]);
    const conditional = result.document.scenes[0]!.blocks[0]!;
    expect(conditional.type).toBe("Conditional");
    const names = setsIn([conditional]).map((s) => s.name);
    expect(names).toEqual(["ok"]);
  });
});

describe("reserved Set name diagnostics: spans, source forms, and no duplicates", () => {
  it("reports exact CRLF offsets and line/column on the name", () => {
    const source = "@scene s\r\n@set true = 1\r\n";
    const [error] = errorsOf(source);
    expect(error!.code).toBe("AT2001");
    expect(error!.span.start).toEqual({ line: 2, column: 6, offset: 15 });
    expect(error!.span.end).toEqual({ line: 2, column: 10, offset: 19 });
    expect(source.slice(error!.span.start.offset, error!.span.end.offset)).toBe("true");
  });

  it("points at the name, not the directive, when separators are wider than one space", () => {
    const source = "@scene s\n@set   false   = 1\n";
    const [error] = errorsOf(source);
    expect(error!.span.start).toEqual({ line: 2, column: 8, offset: 16 });
    expect(source.slice(error!.span.start.offset, error!.span.end.offset)).toBe("false");
  });

  it("reports one diagnostic per reserved Set and keeps valid Sets", () => {
    const result = compile("@scene s\n@set true = 1\n@set false = 2\n@set ok = 3\n");
    expect(result.diagnostics.map((d) => [d.code, d.span.start.line])).toEqual([
      ["AT2001", 2],
      ["AT2001", 3]
    ]);
    expect(setsIn(result.document.scenes[0]!.blocks).map((s) => s.name)).toEqual(["ok"]);
  });

  it("rejects reserved names inside Variant and @else branches", () => {
    const variant = "@scene s\n@variant v\n@when true\n@set null = 1\nx\n@otherwise\n@set false = 2\n@end\n";
    expect(errorsOf(variant).map((d) => [d.code, d.span.start.line])).toEqual([
      ["AT2001", 4],
      ["AT2001", 7]
    ]);
    const otherwise = "@scene s\n@if true\nx\n@else\n@set true = 1\n@end\n";
    expect(errorsOf(otherwise).map((d) => [d.code, d.span.start.line])).toEqual([["AT2001", 5]]);
  });

  it("does not stack a second diagnostic on the same malformed `@set`", () => {
    // The name is rejected before the right-hand side is parsed, so a bad
    // expression is not reported on top of the reserved-name error.
    const reservedAndMalformed = errorsOf("@scene s\n@set true = 1 +\n");
    expect(reservedAndMalformed).toHaveLength(1);
    expect(reservedAndMalformed[0]!.message).toContain("reserved word");
  });

  it("uses the generic form diagnostic, not the reserved-name one, when `=` or the expression is missing", () => {
    for (const source of ["@scene s\n@set true\n", "@scene s\n@set true =\n"]) {
      const errors = errorsOf(source);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe('Malformed expression: expected "name = expression"');
    }
  });

  it("does not reject names that only start with a reserved word", () => {
    const names = setsIn(compileOk("@scene s\n@set true_ = 1\n@set nullable = 2\n@set falsey = 3\n").document.scenes[0]!.blocks).map((s) => s.name);
    expect(names).toEqual(["true_", "nullable", "falsey"]);
  });
});

describe("ordinary Set names remain valid", () => {
  const VALID = [
    "visited",
    "if",
    "else",
    "elseif",
    "and",
    "or",
    "not",
    "undefined",
    "trueValue",
    "falseCount",
    "nullish",
    "TRUE",
    "True",
    "NULL",
    "other"
  ];

  for (const name of VALID) {
    it(`accepts \`@set ${name} = 3\``, () => {
      const document = compileOk(`@scene s\n@set ${name} = 3\n`).document;
      const sets = setsIn(document.scenes[0]!.blocks);
      expect(sets).toHaveLength(1);
      expect(sets[0]!.name).toBe(name);
    });
  }

  it("accepts a valid nested name inside a Conditional branch", () => {
    const document = compileOk("@scene s\n@if true\n@set visited = 1\n@end\n").document;
    const names = setsIn(document.scenes[0]!.blocks).map((s) => s.name);
    expect(names).toEqual(["visited"]);
  });
});

describe("expression literals and calls are unchanged", () => {
  it("still parses `true` as a boolean literal in an expression", () => {
    const document = compileOk("@scene s\n@set x = true\n").document;
    const [set] = setsIn(document.scenes[0]!.blocks);
    expect(set!.expression).toMatchObject({ type: "Literal", value: true });
  });

  it("still parses `null` as a null literal in an expression", () => {
    const document = compileOk("@scene s\n@set x = null\n").document;
    const [set] = setsIn(document.scenes[0]!.blocks);
    expect(set!.expression).toMatchObject({ type: "Literal", value: null });
  });

  it("still accepts the visited() call form", () => {
    compileOk('@scene s\n@set x = visited("s")\n');
  });
});
