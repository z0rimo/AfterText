// Tests for the public API baseline (scripts/api-surface.mjs).
// Runs with Node's built-in runner: `npm run test:api` (needs `npm run build`).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PACKAGES,
  diffSurfaces,
  extractSurface,
  findDeclarationRuntimeMismatches,
  formatDiff,
  isEmptyDiff,
  packageDir,
  readBaseline,
  toBaseline
} from "./api-surface.mjs";

// ---------------------------------------------------------------------------
// 1. The real packages: one independent check per published package.
// ---------------------------------------------------------------------------

for (const name of PACKAGES) {
  test(`@aftertext/${name}: public API matches the reviewed baseline`, async () => {
    const actual = await extractSurface(name);
    const diff = diffSurfaces(readBaseline(name), actual);
    assert.ok(isEmptyDiff(diff), formatDiff(name, diff));
  });

  test(`@aftertext/${name}: declarations and runtime exports agree`, async () => {
    const mismatches = findDeclarationRuntimeMismatches(await extractSurface(name));
    assert.deepEqual(mismatches, { missingAtRuntime: [], undeclaredAtRuntime: [] });
  });

  test(`@aftertext/${name}: baseline is sensitive to removal, addition, kind, shape and subpath changes`, async () => {
    const actual = await extractSurface(name);
    const baseline = toBaseline(actual);
    const names = Object.keys(baseline.exports);
    assert.ok(names.length > 0, "baseline must not be empty");
    const target = names[0];

    const removed = diffSurfaces({ ...baseline, exports: { ...baseline.exports, __Gone: { kind: "function", members: [] } } }, actual);
    assert.deepEqual(removed.removed, ["__Gone"]);

    const { [target]: _omitted, ...rest } = baseline.exports;
    assert.deepEqual(diffSurfaces({ ...baseline, exports: rest }, actual).added, [target]);

    const reshaped = { ...baseline.exports[target], members: [...baseline.exports[target].members, "property __old: string"] };
    const altered = diffSurfaces({ ...baseline, exports: { ...baseline.exports, [target]: reshaped } }, actual);
    assert.deepEqual(altered.changed.map((c) => c.name), [target]);
    assert.deepEqual(altered.changed[0].removedMembers, ["property __old: string"]);

    const subpath = diffSurfaces({ ...baseline, packageExports: { ...baseline.packageExports, "./extra": {} } }, actual);
    assert.equal(subpath.packageExportsChanged, true);
  });
}

test("type-only exports and their shapes are part of the baseline (compiler AST types)", async () => {
  const { exports } = toBaseline(await extractSurface("compiler"));
  assert.equal(exports.StoryDocument.kind, "interface");
  assert.ok(exports.StoryDocument.members.includes("readonly property scenes: readonly SceneNode[]"));
  assert.equal(exports.StoryBlock.kind, "type");
  assert.ok(exports.StoryBlock.members.includes("union GotoNode"));
  assert.equal(exports.compile.kind, "function");
});

test("transitive non-exported runtime types are tracked as referenced types", async () => {
  const { referencedTypes } = toBaseline(await extractSurface("runtime"));
  assert.ok("CursorFrame" in referencedTypes, "CursorFrame is reachable from the exported ExecutionCursor");
});

test("compiler tooling helpers remain public root exports (0.1.0 API)", async () => {
  const { exports, runtimeKeys } = await extractSurface("compiler");
  for (const helper of ["isChoiceTargetBoundarySafe", "isPresentationNamedArgumentValueBoundarySafe"]) {
    assert.deepEqual(exports[helper], { kind: "function", members: ["signature (string) => boolean"] });
    assert.ok(runtimeKeys.includes(helper));
  }
});

test("a package's check does not depend on another package's baseline", async () => {
  const runtime = await extractSurface("runtime");
  assert.ok(!isEmptyDiff(diffSurfaces(readBaseline("compiler"), runtime)), "different packages must not compare equal");
});

// ---------------------------------------------------------------------------
// 2. Type-shape mutations against a temporary copy of the real compiler dist.
//    The real dist is never modified.
// ---------------------------------------------------------------------------

async function compilerDiffAfter(mutations) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aftertext-api-"));
  try {
    const target = path.join(root, "packages", "compiler");
    fs.mkdirSync(target, { recursive: true });
    fs.copyFileSync(path.join(packageDir("compiler"), "package.json"), path.join(target, "package.json"));
    fs.cpSync(path.join(packageDir("compiler"), "dist"), path.join(target, "dist"), { recursive: true });
    // The copied dist imports its dependencies (e.g. `yaml`) at runtime.
    fs.symlinkSync(path.join(packageDir("compiler"), "..", "..", "node_modules"), path.join(root, "node_modules"), "dir");
    for (const [file, from, to] of mutations) {
      const full = path.join(target, "dist", file);
      const text = fs.readFileSync(full, "utf8");
      assert.equal(text.split(from).length - 1, 1, `mutation anchor must occur exactly once in ${file}: ${from}`);
      fs.writeFileSync(full, text.replace(from, to));
    }
    return diffSurfaces(readBaseline("compiler"), await extractSurface("compiler", root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const only = (diff, name) => {
  assert.deepEqual(
    diff.changed.map((c) => c.name),
    [name],
    formatDiff("compiler", diff)
  );
  return diff.changed[0];
};

test("mutation: interface property added", async () => {
  const change = only(
    await compilerDiffAfter([["ast/story.d.ts", 'readonly type: "StoryDocument";', 'readonly type: "StoryDocument";\n    readonly version: number;']]),
    "StoryDocument"
  );
  assert.deepEqual(change.addedMembers, ["readonly property version: number"]);
});

test("mutation: interface property removed", async () => {
  const change = only(await compilerDiffAfter([["ast/story.d.ts", "readonly metadata: StoryMetadata;\n    readonly initialState", "readonly initialState"]]), "StoryDocument");
  assert.deepEqual(change.removedMembers, ["readonly property metadata: StoryMetadata"]);
});

test("mutation: property type changed", async () => {
  const change = only(await compilerDiffAfter([["ast/story.d.ts", 'readonly type: "StoryDocument";', 'readonly type: "StoryDocumentV2";']]), "StoryDocument");
  assert.equal(change.addedMembers.length, 1);
  assert.match(change.addedMembers[0], /StoryDocumentV2/);
});

test("mutation: property optionality changed", async () => {
  const change = only(
    await compilerDiffAfter([["ast/story.d.ts", "readonly positionalValueSpan?: SourceSpan;", "readonly positionalValueSpan: SourceSpan;"]]),
    "PresentationNode"
  );
  assert.deepEqual(change.removedMembers, ["readonly property positionalValueSpan?: SourceSpan"]);
  assert.deepEqual(change.addedMembers, ["readonly property positionalValueSpan: SourceSpan"]);
});

test("mutation: readonly modifier removed", async () => {
  const change = only(await compilerDiffAfter([["ast/span.d.ts", "readonly start: SourcePosition;", "start: SourcePosition;"]]), "SourceSpan");
  assert.deepEqual(change.removedMembers, ["readonly property start: SourcePosition"]);
  assert.deepEqual(change.addedMembers, ["property start: SourcePosition"]);
});

test("mutation: union member added and removed", async () => {
  const anchor = "| ChoiceNode | ConditionalNode | VariantNode;";
  const added = only(await compilerDiffAfter([["ast/story.d.ts", anchor, "| ChoiceNode | ConditionalNode | VariantNode | SourceSpan;"]]), "StoryBlock");
  assert.deepEqual(added.addedMembers, ["union SourceSpan"]);
  const removed = only(await compilerDiffAfter([["ast/story.d.ts", anchor, "| ChoiceNode | ConditionalNode;"]]), "StoryBlock");
  assert.deepEqual(removed.removedMembers, ["union VariantNode"]);
});

test("mutation: nested public referenced type changed", async () => {
  // SourceSpan.start is a SourcePosition; changing SourcePosition's shape is a
  // public change that must be reported on SourcePosition itself.
  const diff = await compilerDiffAfter([["ast/span.d.ts", "readonly line: number;", "readonly line: string;"]]);
  const change = only(diff, "SourcePosition");
  assert.deepEqual(change.removedMembers, ["readonly property line: number"]);
});

// ---------------------------------------------------------------------------
// 3. Synthetic fixture package: class, enum, generics, index signatures,
//    tuples, intersections, and non-exported (transitive) types.
// ---------------------------------------------------------------------------

const FIXTURE = `
interface Hidden { id: string; nested: Deeper }
interface Deeper { flag: boolean }
export interface Holder {
  readonly item: Hidden;
  list?: Hidden[];
  run(x: number): void;
  [key: string]: unknown;
}
export type Pair = [string, number];
export type Both = { a: string } & { b: number };
export type Mode = "a" | "b";
export type Box<T extends string = "x"> = { value: T };
export declare class Counter<T> {
  constructor(start: number);
  readonly count: number;
  private secret;
  protected prot: string;
  next(by?: number): number;
  static create(): Counter<number>;
}
export declare enum Color { Red = 0, Green = 1 }
export declare function make(): Holder;
export {};
`;

async function fixtureSurface(declarations) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aftertext-api-fx-"));
  try {
    const dir = path.join(root, "packages", "fx");
    fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "@fx/fx", type: "module", exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } } }));
    fs.writeFileSync(path.join(dir, "dist", "index.d.ts"), declarations);
    fs.writeFileSync(path.join(dir, "dist", "index.js"), "export class Counter {}\nexport var Color = {};\nexport function make() {}\n");
    return await extractSurface("fx", root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function fixtureDiff(from, to) {
  const before = await fixtureSurface(FIXTURE);
  const after = await fixtureSurface(FIXTURE.replace(from, to));
  assert.notEqual(FIXTURE.replace(from, to), FIXTURE, `fixture anchor not found: ${from}`);
  return diffSurfaces(toBaseline(before), after);
}

test("fixture: interface, alias, class and enum shapes are canonicalised", async () => {
  const { exports, referencedTypes } = await fixtureSurface(FIXTURE);
  assert.deepEqual(exports.Holder.members, [
    "index [string]: unknown",
    "method run: (number) => void",
    "property list?: Hidden[]",
    "readonly property item: Hidden"
  ]);
  assert.deepEqual(exports.Pair.members, ["type [string, number]"]);
  assert.equal(exports.Both.members.length, 2);
  assert.deepEqual(exports.Mode.members, ['union "a"', 'union "b"']);
  assert.ok(exports.Box.members.includes('typeParam T extends string = "x"'));
  assert.equal(exports.Counter.kind, "class");
  assert.ok(exports.Counter.members.includes("constructor <T>(number) => Counter<T>"));
  assert.ok(exports.Counter.members.includes("instance readonly property count: number"));
  assert.ok(exports.Counter.members.includes("instance method next: (number?) => number"));
  assert.ok(exports.Counter.members.includes("static method create: () => Counter<number>"));
  assert.ok(!exports.Counter.members.some((line) => /secret|prot/.test(line)), "private/protected members are excluded");
  assert.deepEqual(exports.Color.members, ["member Green = 1", "member Red = 0"]);
  assert.deepEqual(Object.keys(referencedTypes), ["Deeper", "Hidden"], "non-exported types reachable from exports are tracked, transitively");
});

test("fixture: a change inside a non-exported referenced type is detected", async () => {
  const diff = await fixtureDiff("interface Deeper { flag: boolean }", "interface Deeper { flag: string }");
  assert.deepEqual(diff.changed.map((c) => c.name), ["(referenced) Deeper"]);
});

test("fixture: removing every path to a non-exported type is reported", async () => {
  const before = await fixtureSurface(FIXTURE);
  const after = await fixtureSurface(FIXTURE.replace("readonly item: Hidden;", "readonly item: string;").replace("list?: Hidden[];", "list?: string[];"));
  const diff = diffSurfaces(toBaseline(before), after);
  assert.ok(diff.changed.some((c) => c.name === "Holder"));
  assert.deepEqual(diff.removed, ["(referenced) Deeper", "(referenced) Hidden"]);
});

for (const [label, from, to, expectedName] of [
  ["index signature changed", "[key: string]: unknown;", "[key: string]: number;", "Holder"],
  ["method signature changed", "run(x: number): void;", "run(x: string): void;", "Holder"],
  ["tuple changed", "[string, number]", "[string, number, boolean]", "Pair"],
  ["intersection changed", "{ b: number }", "{ b: string }", "Both"],
  ["literal union changed", '"a" | "b"', '"a" | "b" | "c"', "Mode"],
  ["generic constraint changed", 'T extends string = "x"', "T extends string | number = 1", "Box"],
  ["enum member value changed", "Green = 1", "Green = 2", "Color"],
  ["enum member removed", "Red = 0, Green = 1", "Red = 0", "Color"],
  ["class constructor changed", "constructor(start: number);", "constructor(start: string);", "Counter"],
  ["class method changed", "next(by?: number): number;", "next(by: number): number;", "Counter"],
  ["class static member changed", "static create(): Counter<number>;", "static create(n: number): Counter<number>;", "Counter"]
]) {
  test(`fixture mutation: ${label}`, async () => {
    const diff = await fixtureDiff(from, to);
    assert.deepEqual(diff.changed.map((c) => c.name), [expectedName], formatDiff("fx", diff));
  });
}

test("fixture: private/protected class members are not part of the baseline", async () => {
  const diff = await fixtureDiff("private secret;", "private secret: number;");
  assert.ok(isEmptyDiff(diff));
});

// ---------------------------------------------------------------------------
// 4. Pure diff behaviour.
// ---------------------------------------------------------------------------

test("diffSurfaces flags a type-only export becoming a value, and the reverse", () => {
  const typeOnly = { package: "x", packageExports: null, exports: { Thing: { kind: "interface", members: [] } } };
  const value = { package: "x", packageExports: null, exports: { Thing: { kind: "const", members: ["type number"] } } };
  assert.deepEqual(diffSurfaces(typeOnly, value).changed.map((c) => c.name), ["Thing"]);
  assert.deepEqual(diffSurfaces(value, typeOnly).changed.map((c) => c.name), ["Thing"]);
});

test("diffSurfaces reports nothing for identical surfaces", () => {
  const surface = {
    package: "x",
    packageExports: { ".": {} },
    exports: { a: { kind: "function", members: ["signature () => void"] }, T: { kind: "interface", members: [] } },
    referencedTypes: {}
  };
  assert.ok(isEmptyDiff(diffSurfaces(surface, surface)));
});
