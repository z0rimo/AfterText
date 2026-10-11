import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

const INHERITED = ["constructor", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "__proto__"];

describe("Reader Memory builtin registry is own-key only", () => {
  it.each(INHERITED)("%s(...) is an unknown builtin, not a builtin call", (name) => {
    const result = compile(`@scene a\n@variant v\n@when true\nX\n@end\n@if ${name}("v")\nHi.\n@end\n`);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["AT2002"]);
  });

  it("still accepts exactly the four declared builtins", () => {
    const source = [
      "@scene a",
      "@variant v",
      "@when true",
      "X",
      "@end",
      '@if visited("a") && visit_count("a") > 0 && seen_variant("v") && last_seen_variant_branch("v") == "x"',
      "Hi.",
      "@end"
    ].join("\n");
    expect(compile(source).diagnostics).toEqual([]);
  });
});

describe("presentation named arguments with prototype-sensitive keys", () => {
  it.each(["constructor", "toString", "__proto__"])("%s=... keeps its value and removal spans", (key) => {
    const result = compile(`@scene a\n@music song.mp3 ${key}=5 volume=0.5\nHi.\n`);
    expect(result.diagnostics).toEqual([]);
    const node = result.document.scenes[0]!.blocks[0] as {
      parameterValueSpans?: Record<string, unknown>;
      parameterRemovalSpans?: Record<string, unknown>;
    };
    expect(Object.keys(node.parameterValueSpans ?? {})).toEqual([key, "volume"]);
    expect(Object.keys(node.parameterRemovalSpans ?? {})).toEqual([key, "volume"]);
    expect(Object.getPrototypeOf(node.parameterValueSpans)).toBe(Object.prototype);
  });

  it("does not pollute Object.prototype", () => {
    compile("@scene a\n@music song.mp3 __proto__=5 constructor=6\nHi.\n");
    expect(Object.keys(Object.prototype)).toEqual([]);
    expect(({} as Record<string, unknown>)["start"]).toBeUndefined();
  });
});
