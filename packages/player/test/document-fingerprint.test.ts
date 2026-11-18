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
    { name: "an initialState value", a: "---\nstate:\n  a: 1\n---\n@scene s\nHi.", b: "---\nstate:\n  a: 2\n---\n@scene s\nHi." },
    { name: "scene order", a: "@scene s\nHi.\n\n@scene t\nBye.", b: "@scene t\nBye.\n\n@scene s\nHi." },
    { name: "block order", a: "@scene s\nFirst.\n\nSecond.", b: "@scene s\nSecond.\n\nFirst." },
    { name: "Dialogue text", a: "@scene s\n@say speaker=Alice\nHello.\n", b: "@scene s\n@say speaker=Alice\nGoodbye.\n" },
    {
      name: "a Choice target",
      a: "@scene s\n@choice\n- Go -> a\n@end\n@scene a\nA.\n@scene b\nB.",
      b: "@scene s\n@choice\n- Go -> b\n@end\n@scene a\nA.\n@scene b\nB."
    },
    { name: "a @set expression", a: "@scene s\n@set a = 1\nHi.", b: "@scene s\n@set a = 2\nHi." },
    { name: "a Presentation authored value", a: "@scene s\n@background room.jpg\nHi.", b: "@scene s\n@background hall.jpg\nHi." },
    {
      name: "a Conditional condition",
      a: "@scene s\n@set a = 1\n@if a == 1\nHi.\n@end",
      b: "@scene s\n@set a = 1\n@if a == 2\nHi.\n@end"
    },
    {
      name: "Conditional branch order",
      a: "@scene s\n@set a = 1\n@if a == 1\nOne.\n@elseif a == 2\nTwo.\n@end",
      b: "@scene s\n@set a = 1\n@if a == 2\nTwo.\n@elseif a == 1\nOne.\n@end"
    },
    {
      name: "a Variant id",
      a: "@scene s\n@variant mood\n@when true\nHi.\n@end",
      b: "@scene s\n@variant tone\n@when true\nHi.\n@end"
    },
    {
      name: "Variant branch order",
      a: "@scene s\n@variant mood\n@when true\nHappy.\n@when false\nSad.\n@end",
      b: "@scene s\n@variant mood\n@when false\nSad.\n@when true\nHappy.\n@end"
    },
    {
      name: "a Goto target",
      a: "@scene s\n@goto a\n@scene a\nA.\n@scene b\nB.",
      b: "@scene s\n@goto b\n@scene a\nA.\n@scene b\nB."
    }
  ];

  it.each(MUTATION_CASES)("changes when $name changes", ({ a, b }) => {
    expectDifferentFingerprint(a, b);
  });
});
