import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import type { CallExpression, ExpressionNode } from "../src/index.js";
import { codesOf, compileOk } from "./helpers.js";

/**
 * Extracts the parsed expression from `@set x = <exprSource>`, ignoring
 * any semantic-validation diagnostics — used for pure parsing/structure
 * assertions where the argument's semantic validity is not the point.
 */
function parseSetExpression(exprSource: string): ExpressionNode {
  const { document } = compile(`@scene s\n@set x = ${exprSource}\n`);
  const block = document.scenes[0]!.blocks[0]!;
  if (block.type !== "Set") throw new Error("expected Set");
  return block.expression;
}

describe("CallExpression — parsing", () => {
  it("parses a single string-literal argument", () => {
    const node = parseSetExpression('visited("intro")');
    expect(node).toMatchObject({
      type: "Call",
      callee: "visited",
      args: [{ type: "Literal", value: "intro" }]
    });
  });

  it("parses zero arguments", () => {
    const node = parseSetExpression("foo()") as CallExpression;
    expect(node.type).toBe("Call");
    expect(node.callee).toBe("foo");
    expect(node.args).toHaveLength(0);
  });

  it("parses multiple comma-separated arguments (structurally, regardless of builtin semantics)", () => {
    const node = parseSetExpression('foo("a", "b")') as CallExpression;
    expect(node.args).toHaveLength(2);
    expect(node.args[0]).toMatchObject({ type: "Literal", value: "a" });
    expect(node.args[1]).toMatchObject({ type: "Literal", value: "b" });
  });

  it("parses a non-literal (identifier) argument structurally", () => {
    const node = parseSetExpression("foo(flag)") as CallExpression;
    expect(node.args).toHaveLength(1);
    expect(node.args[0]).toMatchObject({ type: "Identifier", name: "flag" });
  });

  it("composes with existing operators", () => {
    const node = parseSetExpression('visited("intro") && flag');
    expect(node).toMatchObject({
      type: "Binary",
      operator: "&&",
      left: { type: "Call", callee: "visited" },
      right: { type: "Identifier", name: "flag" }
    });
  });

  it("reports AT2001 for an unclosed call", () => {
    const result = compile('@scene s\n@set x = visited("intro"\n');
    expect(codesOf(result.diagnostics)).toContain("AT2001");
  });
});

describe("CallExpression — namespace separation from StoryState identifiers", () => {
  it("a bare identifier named after a builtin remains an ordinary StoryState identifier", () => {
    const source = ["@scene s", "@set visited = true", "@if visited", "Hi.", "@end"].join("\n");
    const { document } = compileOk(source);
    const conditional = document.scenes[0]!.blocks[1]!;
    if (conditional.type !== "Conditional") throw new Error("expected Conditional");
    expect(conditional.branches[0]!.condition).toMatchObject({ type: "Identifier", name: "visited" });
  });

  it("the same name immediately followed by a call is a Call, not an Identifier", () => {
    const source = ["@scene s", "@set visited = true", '@if visited("s")', "Hi.", "@end"].join("\n");
    const { document } = compileOk(source);
    const conditional = document.scenes[0]!.blocks[1]!;
    if (conditional.type !== "Conditional") throw new Error("expected Conditional");
    expect(conditional.branches[0]!.condition).toMatchObject({ type: "Call", callee: "visited" });
  });
});

describe("CallExpression — Reader Memory semantic validation", () => {
  it("accepts a known builtin with a valid scene reference", () => {
    const source = ["@scene s", '@if visited("s")', "Hi.", "@end"].join("\n");
    const result = compile(source);
    expect(result.hasErrors).toBe(false);
  });

  it("reports AT2002 for an unknown builtin name", () => {
    const result = compile('@scene s\n@set x = frobnicate("s")\n');
    expect(codesOf(result.diagnostics)).toContain("AT2002");
  });

  it("reports AT2003 for the wrong argument count", () => {
    const zero = compile("@scene s\n@set x = visited()\n");
    expect(codesOf(zero.diagnostics)).toContain("AT2003");

    const two = compile('@scene s\n@set x = visited("a", "b")\n');
    expect(codesOf(two.diagnostics)).toContain("AT2003");
  });

  it("reports AT2004 for a non-string-literal argument", () => {
    const identifierArg = compile("@scene s\n@set flag = true\n@set x = visited(flag)\n");
    expect(codesOf(identifierArg.diagnostics)).toContain("AT2004");

    const computedArg = compile('@scene s\n@set x = visited("a" + "b")\n');
    expect(codesOf(computedArg.diagnostics)).toContain("AT2004");
  });

  it("reports AT1004 (reused) for an unknown scene reference", () => {
    const result = compile('@scene s\n@set x = visited("nowhere")\n');
    expect(codesOf(result.diagnostics)).toContain("AT1004");
  });

  it("accepts a forward scene reference", () => {
    const source = ['@scene s', '@if visited("later")', "Hi.", "@end", "", "@scene later", "Later."].join("\n");
    const result = compile(source);
    expect(result.hasErrors).toBe(false);
  });

  it("reports AT1103 for an unknown Variant reference", () => {
    const result = compile('@scene s\n@set x = seen_variant("nowhere")\n');
    expect(codesOf(result.diagnostics)).toContain("AT1103");
  });

  it("accepts a forward Variant reference", () => {
    const source = [
      "@scene s",
      '@if seen_variant("mood")',
      "Hi.",
      "@end",
      "@variant mood",
      "@when true",
      "Text.",
      "@end"
    ].join("\n");
    const result = compile(source);
    expect(result.hasErrors).toBe(false);
  });

  it("validates last_seen_variant_branch the same way as seen_variant", () => {
    const valid = compile(
      ["@scene s", "@variant mood", "@when true", "Text.", "@end", '@if last_seen_variant_branch("mood") == "mood:0"', "Hi.", "@end"].join(
        "\n"
      )
    );
    expect(valid.hasErrors).toBe(false);

    const invalid = compile('@scene s\n@set x = last_seen_variant_branch("nowhere")\n');
    expect(codesOf(invalid.diagnostics)).toContain("AT1103");
  });

  it("validates visit_count the same way as visited", () => {
    const valid = compile('@scene s\n@if visit_count("s") >= 1\nHi.\n@end\n');
    expect(valid.hasErrors).toBe(false);

    const invalid = compile('@scene s\n@set x = visit_count("nowhere")\n');
    expect(codesOf(invalid.diagnostics)).toContain("AT1004");
  });

  it("validates a Reader Memory call nested inside a Choice item condition", () => {
    const source = ["@scene s", "@choice", '- Go -> s if visited("nowhere")', "@end"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1004");
  });

  it("validates a Reader Memory call nested inside a Variant @when condition", () => {
    const source = ["@scene s", "@variant mood", '@when visited("nowhere")', "Text.", "@end"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1004");
  });
});
