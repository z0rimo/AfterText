import { describe, expect, it } from "vitest";
import { compile, type Diagnostic } from "../src/index.js";
import type { SetNode } from "../src/ast/story.js";
import { compileOk } from "./helpers.js";

const BODY = "@scene s\nHello.\n";

function withState(stateLines: string[], eol = "\n"): string {
  return ["---", "state:", ...stateLines, "---", BODY].join(eol);
}

function errorsOf(source: string): Diagnostic[] {
  return compile(source).diagnostics.filter((d) => d.severity === "error");
}

function sliceOf(source: string, d: Diagnostic): string {
  return source.slice(d.span.start.offset, d.span.end.offset);
}

describe("frontmatter state keys: accepted names", () => {
  it("keeps every valid identifier-shaped key, including names that merely resemble reserved words", () => {
    const source = withState([
      "  score: 1",
      "  _score: 2",
      "  score2: 3",
      "  TRUE: 4",
      '  "True": 5',
      "  trueValue: 6",
      "  visited: 7",
      "  falseValue: 8",
      "  nullValue: 9",
      "  true_: 10",
      "  nullable: 11"
    ]);
    const { document } = compileOk(source);
    expect(document.initialState).toEqual({
      score: 1,
      _score: 2,
      score2: 3,
      TRUE: 4,
      True: 5,
      trueValue: 6,
      visited: 7,
      falseValue: 8,
      nullValue: 9,
      true_: 10,
      nullable: 11
    });
  });

  it("stores unquoted TRUE/True/NULL exactly as written (YAML would otherwise read them as true/null)", () => {
    for (const name of ["TRUE", "True", "FALSE", "False", "NULL", "Null"]) {
      expect(compileOk(withState([`  ${name}: 1`])).document.initialState).toEqual({ [name]: 1 });
    }
  });

  it("still reports YAML's own duplicate-key error when unquoted TRUE and True are both declared", () => {
    // YAML resolves both plain scalars to the boolean `true`, so the map has a
    // duplicate key. This is existing YAML-layer behavior (AT1202), not B1.
    const result = compile(withState(["  TRUE: 1", "  True: 2"]));
    expect(result.diagnostics.map((d) => d.code)).toEqual(["AT1202"]);
  });

  it("keeps existing value handling unchanged (string, number, boolean, null)", () => {
    const { document } = compileOk(withState(["  a: text", "  b: 2.5", "  c: false", "  d: null"]));
    expect(document.initialState).toEqual({ a: "text", b: 2.5, c: false, d: null });
  });

  it("treats an absent or null `state:` as empty, as before", () => {
    expect(compileOk("---\nstate:\n---\n" + BODY).document.initialState).toEqual({});
    expect(compileOk("---\nstate: null\n---\n" + BODY).document.initialState).toEqual({});
  });
});

describe("frontmatter state keys: reserved literals", () => {
  for (const name of ["true", "false", "null"]) {
    it(`rejects \`${name}\` with AT1201 on the key and does not add it to initialState`, () => {
      const source = withState([`  ${name}: 1`, "  ok: 2"]);
      const result = compile(source);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe("AT1201");
      expect(errors[0]!.message).toBe(
        `Unsupported initial state key "${name}": "${name}" is a reserved literal and cannot be a state variable name.`
      );
      expect(sliceOf(source, errors[0]!)).toBe(name);
      expect(errors[0]!.span.start).toEqual({ line: 3, column: 3, offset: source.indexOf(`  ${name}:`) + 2 });
      expect(result.hasErrors).toBe(true);
      expect(result.document.initialState).toEqual({ ok: 2 });
    });
  }

  it("rejects the quoted forms too, because the stored key is the same string", () => {
    const source = withState(['  "true": 1', "  'null': 2", '  "false": 3']);
    const errors = errorsOf(source);
    expect(errors.map((d) => d.code)).toEqual(["AT1201", "AT1201", "AT1201"]);
    expect(errors.map((d) => sliceOf(source, d))).toEqual(['"true"', "'null'", '"false"']);
    expect(compile(source).document.initialState).toEqual({});
  });

  it("rejects the YAML null key `~` as a non-identifier (the key is what was written)", () => {
    const source = withState(["  ~: 1"]);
    const errors = errorsOf(source);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('Unsupported initial state key "~"');
    expect(errors[0]!.message).toContain("state keys must match");
    expect(sliceOf(source, errors[0]!)).toBe("~");
  });
});

describe("frontmatter state keys: identifier grammar", () => {
  it("rejects keys that do not match [A-Za-z_][A-Za-z0-9_]*", () => {
    const source = withState(["  1score: 1", '  "my var": 2', "  a-b: 3", "  a.b: 4", '  "": 5', '  "é": 6']);
    const result = compile(source);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors.map((d) => d.code)).toEqual(Array(6).fill("AT1201"));
    expect(errors.map((d) => sliceOf(source, d))).toEqual(["1score", '"my var"', "a-b", "a.b", '""', '"é"']);
    for (const error of errors) {
      expect(error.message).toContain("state keys must match [A-Za-z_][A-Za-z0-9_]*.");
    }
    expect(result.document.initialState).toEqual({});
  });

  it("rejects non-scalar (complex) keys without throwing", () => {
    const source = withState(["  ? [a, b]", "  : 1", "  ? {x: 1}", "  : 2", "  ok: 3"]);
    const result = compile(source);
    expect(result.diagnostics.filter((d) => d.code === "AT1201")).toHaveLength(2);
    expect(result.document.initialState).toEqual({ ok: 3 });
  });

  it("numeric YAML keys are rejected (they are stored as digit-leading strings)", () => {
    const errors = errorsOf(withState(["  1: a", "  1.5: b", "  0x10: c"]));
    expect(errors.map((d) => d.code)).toEqual(["AT1201", "AT1201", "AT1201"]);
  });
});

describe("frontmatter state keys: __proto__", () => {
  for (const [label, line] of [
    ["unquoted", "  __proto__: 1"],
    ["double-quoted", '  "__proto__": 1'],
    ["single-quoted", "  '__proto__': 1"],
    ["with a null value", "  __proto__: null"]
  ] as const) {
    it(`rejects ${label} __proto__ and leaves initialState a plain object without it`, () => {
      const source = withState([line, "  ok: 2"]);
      const result = compile(source);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe("AT1201");
      expect(errors[0]!.message).toBe('Unsupported initial state key "__proto__": "__proto__" is not allowed as a state key.');
      expect(sliceOf(source, errors[0]!).replace(/["']/g, "")).toBe("__proto__");
      const state = result.document.initialState;
      expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(state, "__proto__")).toBe(false);
      expect(state).toEqual({ ok: 2 });
    });
  }

  it("does not change `@set __proto__`: only frontmatter state is restricted", () => {
    const set = compileOk("@scene s\n@set __proto__ = 1\n").document.scenes[0]!.blocks[0] as SetNode;
    expect(set.type).toBe("Set");
    expect(set.name).toBe("__proto__");
  });

  it("does not extend the restriction to `constructor`, `prototype`, or `toString`", () => {
    const { document } = compileOk(withState(["  constructor: 1", "  prototype: 2", "  toString: 3"]));
    expect(document.initialState).toEqual({ constructor: 1, prototype: 2, toString: 3 });
  });
});

describe("frontmatter state keys: diagnostics shape", () => {
  it("reports exact positions with CRLF line endings", () => {
    const source = withState(["  ok: 1", "  my var: 2", "  true: 3"], "\r\n");
    const errors = errorsOf(source);
    expect(errors).toHaveLength(2);
    expect(sliceOf(source, errors[0]!)).toBe("my var");
    expect(errors[0]!.span.start).toEqual({ line: 4, column: 3, offset: source.indexOf("my var") });
    expect(errors[0]!.span.end).toEqual({ line: 4, column: 9, offset: source.indexOf("my var") + 6 });
    expect(sliceOf(source, errors[1]!)).toBe("true");
    expect(errors[1]!.span.start.line).toBe(5);
    expect(errors[1]!.span.start.column).toBe(3);
  });

  it("covers the quotes of a quoted key and handles deeper indentation", () => {
    const source = withState(['      "my var": 2']);
    const [error] = errorsOf(source);
    expect(sliceOf(source, error!)).toBe('"my var"');
    expect(error!.span.start.column).toBe(7);
  });

  it("points at a key inside a flow-style state map", () => {
    const source = '---\nstate: {a: 1, "b c": 2}\n---\n' + BODY;
    const result = compile(source);
    const errors = result.diagnostics.filter((d) => d.code === "AT1201");
    expect(errors).toHaveLength(1);
    expect(sliceOf(source, errors[0]!)).toBe('"b c"');
    expect(result.document.initialState).toEqual({ a: 1 });
  });

  it("reports one diagnostic per bad entry, even when the value is also unsupported", () => {
    const source = withState(["  my var:", "    - 1", "  ok: 1"]);
    const errors = errorsOf(source);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("Unsupported initial state key");
    expect(compile(source).document.initialState).toEqual({ ok: 1 });
  });

  it("keeps the existing value diagnostic for a valid key with an unsupported value", () => {
    const source = withState(["  tags:", "    - a", "  my var: 1"]);
    const errors = errorsOf(source);
    expect(errors.map((d) => d.message.split(":")[0])).toEqual([
      'Unsupported initial state value for "tags"',
      'Unsupported initial state key "my var"'
    ]);
  });

  it("reports many invalid keys together and keeps the valid ones in mixed state", () => {
    const source = withState(["  a: 1", "  true: 2", "  b-c: 3", "  d: 4", "  __proto__: 5", "  e: 6"]);
    const result = compile(source);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(3);
    expect(result.document.initialState).toEqual({ a: 1, d: 4, e: 6 });
    expect(Object.keys(result.document.initialState)).toEqual(["a", "d", "e"]);
  });

  it("stays quiet about keys when the YAML itself has a syntax error (only AT1202)", () => {
    const result = compile(withState(["  my var: [1", "  true: 2"]));
    expect(new Set(result.diagnostics.map((d) => d.code))).toEqual(new Set(["AT1202"]));
  });

  it("leaves duplicate-key handling unchanged (AT1202, no state validation cascade)", () => {
    const result = compile(withState(["  a: 1", "  a: 2", "  true: 3"]));
    expect(new Set(result.diagnostics.map((d) => d.code))).toEqual(new Set(["AT1202"]));
  });
});

describe("frontmatter state keys: body compilation is unaffected", () => {
  it("compiles the story body, entry scene, and its positions exactly as before", () => {
    const source = "---\ntitle: T\nentry: s\nstate:\n  true: 1\n  ok: 2\n---\n@scene s\nHello.\n@goto s\n";
    const result = compile(source);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["AT1201"]);
    expect(result.document.metadata.title).toBe("T");
    expect(result.document.entryScene).toBe("s");
    expect(result.document.scenes.map((s) => s.id)).toEqual(["s"]);
    expect(result.document.scenes[0]!.blocks.map((b) => b.type)).toEqual(["Paragraph", "Goto"]);
    expect(result.document.scenes[0]!.span.start.line).toBe(8);
  });

  it("still reports body diagnostics at the right lines when the frontmatter has a bad key", () => {
    const source = "---\nstate:\n  my var: 1\n---\n@scene s\n@goto nowhere\n";
    const errors = errorsOf(source);
    expect(errors.map((d) => [d.code, d.span.start.line])).toEqual([
      ["AT1201", 3],
      ["AT1004", 6]
    ]);
  });
});

describe("policy parity with `@set` names", () => {
  // The frontmatter key rule and the `@set` name rule must agree for every
  // name except the documented `__proto__` asymmetry.
  const NAMES = [
    "score", "_score", "score2", "TRUE", "True", "trueValue", "nullable", "visited", "true_",
    "true", "false", "null", "1score", "a-b", "a.b", "my var", "é"
  ];
  for (const name of NAMES) {
    it(`"${name}" is accepted or rejected the same way by frontmatter state and @set`, () => {
      const quoted = JSON.stringify(name);
      const frontmatterAccepts =
        compile(`---\nstate:\n  ${quoted}: 1\n---\n${BODY}`).diagnostics.filter((d) => d.severity === "error").length === 0;
      const setNode = compile(`@scene s\n@set ${name} = 1\n`).document.scenes[0]!.blocks.find((b) => b.type === "Set");
      expect(frontmatterAccepts).toBe(setNode !== undefined);
    });
  }
});
