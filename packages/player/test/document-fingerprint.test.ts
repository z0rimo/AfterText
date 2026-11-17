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

  const MUTATION_CASES: readonly { readonly name: string; readonly a: string; readonly b: string }[] = [
    {
      name: "an initialState value",
      a: ["---", "state:", "  a: 1", "---", "@scene s", "Hi."].join("\n"),
      b: ["---", "state:", "  a: 2", "---", "@scene s", "Hi."].join("\n")
    },
    {
      name: "scene order",
      a: ["@scene s", "Hi.", "", "@scene t", "Bye."].join("\n"),
      b: ["@scene t", "Bye.", "", "@scene s", "Hi."].join("\n")
    },
    {
      name: "block order",
      a: ["@scene s", "First.", "", "Second."].join("\n"),
      b: ["@scene s", "Second.", "", "First."].join("\n")
    },
    {
      name: "Dialogue text",
      a: "@scene s\n@say speaker=Alice\nHello.\n",
      b: "@scene s\n@say speaker=Alice\nGoodbye.\n"
    },
    {
      name: "a Choice target",
      a: ["@scene s", "@choice", "- Go -> a", "@end", "@scene a", "A.", "@scene b", "B."].join("\n"),
      b: ["@scene s", "@choice", "- Go -> b", "@end", "@scene a", "A.", "@scene b", "B."].join("\n")
    },
    {
      name: "a @set expression",
      a: ["@scene s", "@set a = 1", "Hi."].join("\n"),
      b: ["@scene s", "@set a = 2", "Hi."].join("\n")
    },
    {
      name: "a Presentation authored value",
      a: ["@scene s", "@background room.jpg", "Hi."].join("\n"),
      b: ["@scene s", "@background hall.jpg", "Hi."].join("\n")
    },
    {
      name: "a Conditional condition",
      a: ["@scene s", "@set a = 1", "@if a == 1", "Hi.", "@end"].join("\n"),
      b: ["@scene s", "@set a = 1", "@if a == 2", "Hi.", "@end"].join("\n")
    },
    {
      name: "Conditional branch order",
      a: ["@scene s", "@set a = 1", "@if a == 1", "One.", "@elseif a == 2", "Two.", "@end"].join("\n"),
      b: ["@scene s", "@set a = 1", "@if a == 2", "Two.", "@elseif a == 1", "One.", "@end"].join("\n")
    },
    {
      name: "a Variant id",
      a: ["@scene s", "@variant mood", "@when true", "Hi.", "@end"].join("\n"),
      b: ["@scene s", "@variant tone", "@when true", "Hi.", "@end"].join("\n")
    },
    {
      name: "Variant branch order",
      a: ["@scene s", "@variant mood", "@when true", "Happy.", "@when false", "Sad.", "@end"].join("\n"),
      b: ["@scene s", "@variant mood", "@when false", "Sad.", "@when true", "Happy.", "@end"].join("\n")
    },
    {
      name: "a Goto target",
      a: ["@scene s", "@goto a", "@scene a", "A.", "@scene b", "B."].join("\n"),
      b: ["@scene s", "@goto b", "@scene a", "A.", "@scene b", "B."].join("\n")
    }
  ];

  it.each(MUTATION_CASES)("changes when $name changes", ({ a, b }) => {
    expectDifferentFingerprint(a, b);
  });
});
