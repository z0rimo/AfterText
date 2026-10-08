// Runs with Node's built-in runner: `npm run test:api`.
import assert from "node:assert/strict";
import test from "node:test";
import { parsePackInfo } from "./pack-json.mjs";

const entry = { name: "@aftertext/compiler", filename: "aftertext-compiler-0.1.1.tgz", files: [{ path: "package.json" }] };
const parse = (value, name = "@aftertext/compiler") => parsePackInfo(JSON.stringify(value), name);

test("npm 10/11 array output", () => {
  assert.deepEqual(parse([entry]), entry);
});

test("npm 12 object output keyed by package name", () => {
  assert.deepEqual(parse({ "@aftertext/compiler": entry }), entry);
});

test("rejects unexpected structures instead of guessing", () => {
  assert.throws(() => parse([]), /unexpected `npm pack --json` output/);
  assert.throws(() => parse([entry, entry]), /unexpected/);
  assert.throws(() => parse({ "@aftertext/runtime": entry }), /unexpected/);
  assert.throws(() => parse({}), /unexpected/);
  assert.throws(() => parse(null), /unexpected/);
  assert.throws(() => parse("text"), /unexpected/);
  assert.throws(() => parse([{ ...entry, files: undefined }]), /unexpected/);
  assert.throws(() => parse({ "@aftertext/compiler": { ...entry, filename: undefined } }), /unexpected/);
});
