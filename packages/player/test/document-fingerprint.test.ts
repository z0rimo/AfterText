import { describe, expect, it } from "vitest";
import { compile } from "@aftertext/compiler";
import type { StoryDocument } from "@aftertext/compiler";
import { computeDocumentFingerprint } from "../src/document-fingerprint.js";

/**
 * Document fingerprint (docs/CORE_SPEC.md Section 33.5): a deterministic,
 * browser-portable mismatch detector over every execution/rendering-
 * relevant authored semantic value. Equivalence tests prove formatting/
 * span-only/metadata-only/key-order differences never change it;
 * mutation tests prove every semantically meaningful change does.
 */

function compileDoc(source: string): StoryDocument {
  const result = compile(source);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  return result.document;
}

describe("document fingerprint — equivalence", () => {
  const SOURCE = ["@scene s", "Hello there.", "", "@scene t", "Goodbye."].join("\n");

  it("is deterministic across a fresh identical compile", () => {
    expect(computeDocumentFingerprint(compileDoc(SOURCE))).toBe(computeDocumentFingerprint(compileDoc(SOURCE)));
  });

  it("is unaffected by a formatting/whitespace-only change that compiles identically", () => {
    const spaced = ["@scene s", "", "Hello there.", "", "@scene t", "", "Goodbye."].join("\n");
    expect(computeDocumentFingerprint(compileDoc(spaced))).toBe(computeDocumentFingerprint(compileDoc(SOURCE)));
  });

  it("is unaffected by initialState authored key order", () => {
    const abSource = ["---", "state:", "  a: 1", "  b: 2", "---", "@scene s", "Hi."].join("\n");
    const baSource = ["---", "state:", "  b: 2", "  a: 1", "---", "@scene s", "Hi."].join("\n");
    expect(computeDocumentFingerprint(compileDoc(abSource))).toBe(computeDocumentFingerprint(compileDoc(baSource)));
  });

  it("is unaffected by metadata.title alone", () => {
    const base = compileDoc(SOURCE);
    const titled: StoryDocument = { ...base, metadata: { ...base.metadata, title: "A Different Title" } };
    expect(computeDocumentFingerprint(titled)).toBe(computeDocumentFingerprint(base));
  });

  it("is unaffected by metadata.entry when entryScene itself is unchanged", () => {
    const base = compileDoc(SOURCE);
    // Construct directly rather than through source: authoring a different
    // `entry:` would also legitimately change `entryScene`, which is the
    // one field this test must hold constant.
    const differentEntryMetadata: StoryDocument = { ...base, metadata: { ...base.metadata, entry: "t" } };
    expect(computeDocumentFingerprint(differentEntryMetadata)).toBe(computeDocumentFingerprint(base));
  });
});

describe("document fingerprint — mutation", () => {
  function expectDifferentFingerprint(a: string, b: string): void {
    expect(computeDocumentFingerprint(compileDoc(a))).not.toBe(computeDocumentFingerprint(compileDoc(b)));
  }

  it("changes when entryScene changes", () => {
    const base = compileDoc(["@scene s", "Hi.", "", "@scene t", "Hi."].join("\n"));
    const differentEntry: StoryDocument = { ...base, entryScene: "t" };
    expect(computeDocumentFingerprint(differentEntry)).not.toBe(computeDocumentFingerprint(base));
  });

  it("changes when an initialState value changes", () => {
    expectDifferentFingerprint(
      ["---", "state:", "  a: 1", "---", "@scene s", "Hi."].join("\n"),
      ["---", "state:", "  a: 2", "---", "@scene s", "Hi."].join("\n")
    );
  });

  it("changes when scene order changes", () => {
    expectDifferentFingerprint(
      ["@scene s", "Hi.", "", "@scene t", "Bye."].join("\n"),
      ["@scene t", "Bye.", "", "@scene s", "Hi."].join("\n")
    );
  });

  it("changes when block order changes", () => {
    expectDifferentFingerprint(["@scene s", "First.", "", "Second."].join("\n"), ["@scene s", "Second.", "", "First."].join("\n"));
  });

  it("changes when Dialogue text changes", () => {
    expectDifferentFingerprint(
      "@scene s\n@say speaker=Alice\nHello.\n",
      "@scene s\n@say speaker=Alice\nGoodbye.\n"
    );
  });

  it("changes when a Choice target changes", () => {
    expectDifferentFingerprint(
      ["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A.", "@scene b", "B."].join("\n"),
      ["@scene s", "@choice", "- Go -> b", "@end", "@scene a", "A.", "@scene b", "B."].join("\n")
    );
  });

  it("changes when a @set expression changes", () => {
    expectDifferentFingerprint(["@scene s", "@set a = 1", "Hi."].join("\n"), ["@scene s", "@set a = 2", "Hi."].join("\n"));
  });

  it("changes when a Presentation authored value changes", () => {
    expectDifferentFingerprint(["@scene s", "@background room.jpg", "Hi."].join("\n"), ["@scene s", "@background hall.jpg", "Hi."].join("\n"));
  });

  it("changes when a Conditional condition changes", () => {
    expectDifferentFingerprint(
      ["@scene s", "@set a = 1", "@if a == 1", "Hi.", "@end"].join("\n"),
      ["@scene s", "@set a = 1", "@if a == 2", "Hi.", "@end"].join("\n")
    );
  });

  it("changes when Conditional branch order changes", () => {
    expectDifferentFingerprint(
      ["@scene s", "@set a = 1", "@if a == 1", "One.", "@elseif a == 2", "Two.", "@end"].join("\n"),
      ["@scene s", "@set a = 1", "@if a == 2", "Two.", "@elseif a == 1", "One.", "@end"].join("\n")
    );
  });

  it("changes when a Variant id changes", () => {
    expectDifferentFingerprint(
      ["@scene s", "@variant mood", "@when true", "Hi.", "@end"].join("\n"),
      ["@scene s", "@variant tone", "@when true", "Hi.", "@end"].join("\n")
    );
  });

  it("changes when Variant branch order changes", () => {
    expectDifferentFingerprint(
      ["@scene s", "@variant mood", "@when true", "Happy.", "@when false", "Sad.", "@end"].join("\n"),
      ["@scene s", "@variant mood", "@when false", "Sad.", "@when true", "Happy.", "@end"].join("\n")
    );
  });

  it("changes when a Goto target changes", () => {
    expectDifferentFingerprint(
      ["@scene s", "@goto a", "@scene a", "A.", "@scene b", "B."].join("\n"),
      ["@scene s", "@goto b", "@scene a", "A.", "@scene b", "B."].join("\n")
    );
  });
});
