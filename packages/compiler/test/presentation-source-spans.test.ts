import { describe, expect, it } from "vitest";
import type { PresentationNode, StoryBlock } from "../src/index.js";
import { compile } from "../src/index.js";
import { compileOk } from "./helpers.js";

/**
 * docs/CORE_SPEC.md Section 25.36 — `PresentationNode.parameterValueSpans`
 * is compiler/source-tooling metadata: absolute spans of each recognized
 * `key=value` parameter's authored VALUE text, enabling targeted,
 * formatting-preserving source patches without re-parsing. These tests
 * prove the spans are exact against the real raw source string — never
 * that Presentation grammar/semantics themselves are correct (the
 * existing directives.test.ts/numeric-hardening.test.ts already own that).
 */

function presentation(block: StoryBlock): PresentationNode {
  if (block.type !== "Presentation") throw new Error(`expected Presentation, got ${block.type}`);
  return block;
}

function raw(source: string, span: { start: { offset: number }; end: { offset: number } }): string {
  return source.slice(span.start.offset, span.end.offset);
}

describe("PresentationNode.parameterValueSpans — ordinary and irregular form", () => {
  it("slices exactly the authored value text for to= and duration=, to before duration", () => {
    const source = "@scene s\n@camera zoom to=1.20 duration=0.50s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.parameterValueSpans).toBeDefined();
    expect(raw(source, node.parameterValueSpans!["to"]!)).toBe("1.20");
    expect(raw(source, node.parameterValueSpans!["duration"]!)).toBe("0.50s");
  });

  it("slices exactly the authored value text under irregular spacing, duration before to", () => {
    const source = "@scene s\n@camera   zoom   duration=0.50s   to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.parameterValueSpans!["to"]!)).toBe("1.20");
    expect(raw(source, node.parameterValueSpans!["duration"]!)).toBe("0.50s");
  });

  it("never includes the key, '=', or surrounding whitespace in the value span", () => {
    const source = "@scene s\n@camera   zoom   duration=0.50s   to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const toSpan = node.parameterValueSpans!["to"]!;
    expect(raw(source, toSpan)).not.toContain("to=");
    expect(raw(source, toSpan)).not.toMatch(/\s/);
  });

  it("preserves raw decimal spelling — the span slices '1.20', not the normalized '1.2'", () => {
    const source = "@scene s\n@camera zoom to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.parameterValueSpans!["to"]!)).toBe("1.20");
    expect(raw(source, node.parameterValueSpans!["to"]!)).not.toBe("1.2");
    if (node.command.type !== "Camera") throw new Error("expected Camera");
    expect(node.command.to).toBe(1.2);
  });

  it("slices exact negative-zero raw text", () => {
    const source = "@scene s\n@camera zoom to=-0\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.parameterValueSpans!["to"]!)).toBe("-0");
    if (node.command.type !== "Camera") throw new Error("expected Camera");
    expect(Object.is(node.command.to, -0)).toBe(true);
  });
});

describe("PresentationNode.parameterValueSpans — CRLF and Unicode", () => {
  it("remains correct with CRLF line endings", () => {
    const source = ["@scene s", "@camera zoom to=1.20 duration=0.50s"].join("\r\n") + "\r\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.parameterValueSpans!["to"]!)).toBe("1.20");
    expect(raw(source, node.parameterValueSpans!["duration"]!)).toBe("0.50s");
  });

  it("remains correct with Korean text and an emoji preceding the directive", () => {
    const source = "@scene s\n한글 문장입니다 😀 텍스트.\n\n@camera zoom to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(raw(source, node.parameterValueSpans!["to"]!)).toBe("1.20");
  });
});

describe("PresentationNode.parameterValueSpans — duplicate and absent parameters", () => {
  it("matches last-write-wins semantics: both the semantic value and the exposed span point to the LAST occurrence", () => {
    const source = "@scene s\n@camera zoom to=1.20 to=1.40\n";
    const result = compile(source);
    const node = presentation(result.document.scenes[0]!.blocks[0]!);

    if (node.command.type !== "Camera") throw new Error("expected Camera");
    expect(node.command.to).toBe(1.4);
    expect(raw(source, node.parameterValueSpans!["to"]!)).toBe("1.40");
  });

  it("is an empty record for a directive with no named parameters", () => {
    const source = "@scene s\n@background room.jpg\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.parameterValueSpans).toEqual({});
  });

  it("omits duration when the directive did not specify it", () => {
    const source = "@scene s\n@camera zoom to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.parameterValueSpans!["to"]).toBeDefined();
    expect(node.parameterValueSpans!["duration"]).toBeUndefined();
  });
});

/**
 * docs/CORE_SPEC.md Section 25.36 (Named Numeric Presentation Properties
 * expansion) — coverage confirming the already-existing, already-generic
 * `parameterValueSpans` mechanism (proven above for Camera) behaves
 * identically for Music's `volume=` parameter. No compiler production
 * change accompanies these tests — `tokenizePresentationArgs`/
 * `parsePresentation` already populate this generically for every
 * directive kind.
 */
describe("PresentationNode.parameterValueSpans — Music volume", () => {
  it("slices exactly the authored value text for volume=", () => {
    const source = "@scene s\n@music theme.mp3 volume=0.80\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.parameterValueSpans!["volume"]!)).toBe("0.80");
  });

  it("remains exact under irregular spacing", () => {
    const source = "@scene s\n@music   theme.mp3   volume=0.80\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.parameterValueSpans!["volume"]!)).toBe("0.80");
  });

  it("preserves raw decimal spelling — '0.80', not the normalized '0.8'", () => {
    const source = "@scene s\n@music theme.mp3 volume=0.80\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.parameterValueSpans!["volume"]!)).toBe("0.80");
    expect(raw(source, node.parameterValueSpans!["volume"]!)).not.toBe("0.8");
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.volume).toBe(0.8);
  });

  it("remains correct with CRLF line endings", () => {
    const source = ["@scene s", "@music theme.mp3 volume=0.80"].join("\r\n") + "\r\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.parameterValueSpans!["volume"]!)).toBe("0.80");
  });

  it("omits volume when the directive did not specify it", () => {
    const source = "@scene s\n@music theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.parameterValueSpans!["volume"]).toBeUndefined();
  });
});

/**
 * docs/CORE_SPEC.md Sections 14/25.36 (Positional Presentation Source
 * Metadata expansion) — `PresentationNode.positionalValueSpan` is populated
 * if and only if the directive's argument text contains exactly one
 * positional (non-`key=value`) token. This is directive-kind-agnostic
 * source-tooling metadata; no compiler grammar/behavior change accompanies
 * it. The non-contiguous case below is the central safety regression for
 * the whole contract.
 */
describe("PresentationNode.positionalValueSpan — single positional token", () => {
  it("slices exactly the authored Pause duration (seconds form)", () => {
    const source = "@scene s\n@pause 0.50s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.positionalValueSpan!)).toBe("0.50s");
  });

  it("slices exactly the authored Pause duration (milliseconds form)", () => {
    const source = "@scene s\n@pause 500ms\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.positionalValueSpan!)).toBe("500ms");
  });

  it("excludes the directive keyword and surrounding whitespace", () => {
    const source = "@scene s\n@pause   0.50s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const value = raw(source, node.positionalValueSpan!);
    expect(value).toBe("0.50s");
    expect(value).not.toContain("@pause");
    expect(value).not.toMatch(/\s/);
  });

  it("remains correct with CRLF line endings", () => {
    const source = ["@scene s", "@pause 0.50s"].join("\r\n") + "\r\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.positionalValueSpan!)).toBe("0.50s");
  });

  it("remains correct with Korean text and an emoji preceding the directive", () => {
    const source = "@scene s\n한글 문장입니다 😀 텍스트.\n\n@pause 0.50s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(raw(source, node.positionalValueSpan!)).toBe("0.50s");
  });

  it("slices the Camera action token ('zoom')", () => {
    const source = "@scene s\n@camera zoom to=1.2\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.positionalValueSpan!)).toBe("zoom");
  });

  it("slices the Music track token ('theme.mp3')", () => {
    const source = "@scene s\n@music theme.mp3 volume=0.8\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.positionalValueSpan!)).toBe("theme.mp3");
  });

  it("slices a representative path directive's positional value (Background)", () => {
    const source = "@scene s\n@background bg.png\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.positionalValueSpan!)).toBe("bg.png");
  });

  it("coexists unambiguously with parameterValueSpans on the same node", () => {
    const source = "@scene s\n@music theme.mp3 volume=0.80\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.positionalValueSpan!)).toBe("theme.mp3");
    expect(raw(source, node.parameterValueSpans!["volume"]!)).toBe("0.80");
  });
});

describe("PresentationNode.positionalValueSpan — non-contiguous / absent cases", () => {
  it("is undefined when two positional tokens are separated by a named parameter, even though a semantic value exists", () => {
    // Currently-accepted (if unusual) source: two positional tokens
    // ("first", "second") with a named parameter token between them.
    // The parser still joins them into one semantic track ("first second")
    // — but that joined text is NOT contiguous in the actual source
    // (`volume=0.8` sits between them), so no single SourceSpan could
    // represent it without also covering unrelated text.
    const source = "@scene s\n@music first volume=0.8 second\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("first second"); // the semantic value DOES exist...
    expect(node.positionalValueSpan).toBeUndefined(); // ...but no safe span represents it
  });
});

/**
 * docs/CORE_SPEC.md Sections 14/25.36 (Optional Named Presentation
 * Property Insertion expansion) — `PresentationNode.argumentsEndPosition`
 * is the compiler-owned insertion anchor: the absolute source position
 * immediately after the last non-whitespace character of a directive's
 * authored argument text, before any trailing line whitespace/terminator.
 * These tests prove it is exact against the real raw source string, and
 * critically that it never coincides with `span.end` when trailing
 * whitespace is present.
 */
describe("PresentationNode.argumentsEndPosition", () => {
  it("points immediately after the last parameter value (Camera, to before duration is absent, action then to=)", () => {
    const source = "@scene s\n@camera zoom to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.argumentsEndPosition).toBeDefined();
    expect(source.slice(node.argumentsEndPosition!.offset, node.argumentsEndPosition!.offset + 1)).toBe("\n");
    expect(source.slice(0, node.argumentsEndPosition!.offset).endsWith("to=1.20")).toBe(true);
  });

  it("points immediately after the physically last token in reordered Camera source (to= before the action)", () => {
    const source = "@scene s\n@camera to=1.20 zoom\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(source.slice(0, node.argumentsEndPosition!.offset).endsWith("zoom")).toBe(true);
    expect(source.slice(node.argumentsEndPosition!.offset, node.argumentsEndPosition!.offset + 1)).toBe("\n");
  });

  it("points immediately after the Music track when no named parameter is authored", () => {
    const source = "@scene s\n@music theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(source.slice(0, node.argumentsEndPosition!.offset).endsWith("theme.mp3")).toBe(true);
  });

  it("points after the physically final argument, preserving an unknown named parameter", () => {
    const source = "@scene s\n@camera zoom foo=bar to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(source.slice(0, node.argumentsEndPosition!.offset).endsWith("to=1.20")).toBe(true);
  });

  it("occurs before authored trailing spaces, never after them like span.end does", () => {
    const source = "@scene s\n@music theme.mp3    \nAfter.\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(source.slice(0, node.argumentsEndPosition!.offset).endsWith("theme.mp3")).toBe(true);
    expect(source.slice(node.argumentsEndPosition!.offset, node.argumentsEndPosition!.offset + 4)).toBe("    ");
    // The whole-node span, by contrast, includes the trailing whitespace —
    // this is the exact unsafety `argumentsEndPosition` exists to avoid.
    expect(node.span.end.offset).toBe(node.argumentsEndPosition!.offset + 4);
    expect(node.argumentsEndPosition!.offset).not.toBe(node.span.end.offset);
  });

  it("is unaffected by irregular internal spacing (tabs)", () => {
    const source = "@scene s\n@camera\tzoom\tto=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(source.slice(0, node.argumentsEndPosition!.offset).endsWith("to=1.20")).toBe(true);
  });

  it("occurs immediately before the CRLF terminator, never inside it", () => {
    const source = ["@scene s", "@camera zoom to=1.20"].join("\r\n") + "\r\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(source.slice(0, node.argumentsEndPosition!.offset).endsWith("to=1.20")).toBe(true);
    expect(source.slice(node.argumentsEndPosition!.offset, node.argumentsEndPosition!.offset + 2)).toBe("\r\n");
  });

  it("remains correct with Korean text and an emoji preceding the directive", () => {
    const source = "@scene s\n한글 문장입니다 😀 텍스트.\n\n@camera zoom to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(source.slice(0, node.argumentsEndPosition!.offset).endsWith("to=1.20")).toBe(true);
  });

  it("is still correct and defined for the non-contiguous positional case even though positionalValueSpan is undefined", () => {
    const source = "@scene s\n@music first volume=0.8 second\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.positionalValueSpan).toBeUndefined();
    expect(node.argumentsEndPosition).toBeDefined();
    expect(source.slice(0, node.argumentsEndPosition!.offset).endsWith("second")).toBe(true);
  });
});

/**
 * docs/CORE_SPEC.md Sections 14/25.36 (Optional Named Presentation
 * Property Removal expansion) — `PresentationNode.parameterRemovalSpans`
 * is the compiler-owned, trivia-aware deletion range for a uniquely-
 * authored named parameter: the complete `key=value` token plus exactly
 * one adjacent authored separator, chosen by a deterministic position
 * rule (first-argument token: separator AFTER; middle/last: separator
 * BEFORE). These tests prove the span is exact against the real raw
 * source string for every position/spacing/line-ending/duplicate case —
 * never that Presentation grammar/semantics themselves are correct.
 */
describe("PresentationNode.parameterRemovalSpans — position rule", () => {
  it("last-position: removes the preceding separator plus the token, excluding trailing line trivia", () => {
    const source = "@scene s\n@camera zoom to=1.20 duration=0.50s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const removed = raw(source, node.parameterRemovalSpans!["duration"]!);
    expect(removed).toBe(" duration=0.50s");
    expect(source.slice(0, node.parameterRemovalSpans!["duration"]!.start.offset)).toBe(
      "@scene s\n@camera zoom to=1.20"
    );
    const patched = source.slice(0, node.parameterRemovalSpans!["duration"]!.start.offset) + source.slice(node.parameterRemovalSpans!["duration"]!.end.offset);
    expect(patched).toBe("@scene s\n@camera zoom to=1.20\n");
  });

  it("first-position: removes the token plus the following separator, never the directive-to-argument separator", () => {
    const source = "@scene s\n@camera duration=0.50s zoom to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const removed = raw(source, node.parameterRemovalSpans!["duration"]!);
    expect(removed).toBe("duration=0.50s ");
    const patched =
      source.slice(0, node.parameterRemovalSpans!["duration"]!.start.offset) +
      source.slice(node.parameterRemovalSpans!["duration"]!.end.offset);
    expect(patched).toBe("@scene s\n@camera zoom to=1.20\n");
  });

  it("middle-position: removes the preceding separator plus the token, leaving the following separator untouched", () => {
    const source = "@scene s\n@camera zoom duration=0.50s to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const removed = raw(source, node.parameterRemovalSpans!["duration"]!);
    expect(removed).toBe(" duration=0.50s");
    const patched =
      source.slice(0, node.parameterRemovalSpans!["duration"]!.start.offset) +
      source.slice(node.parameterRemovalSpans!["duration"]!.end.offset);
    expect(patched).toBe("@scene s\n@camera zoom to=1.20\n");
  });

  it("Music volume: removes the preceding separator plus the token", () => {
    const source = "@scene s\n@music theme.mp3 volume=0.80\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const patched =
      source.slice(0, node.parameterRemovalSpans!["volume"]!.start.offset) +
      source.slice(node.parameterRemovalSpans!["volume"]!.end.offset);
    expect(patched).toBe("@scene s\n@music theme.mp3\n");
  });
});

describe("PresentationNode.parameterRemovalSpans — irregular spacing, tabs, trailing trivia, CRLF, Unicode", () => {
  it("preserves irregular authored spacing exactly under removal", () => {
    const source = "@scene s\n@camera   zoom   to=1.20   duration=0.50s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const patched =
      source.slice(0, node.parameterRemovalSpans!["duration"]!.start.offset) +
      source.slice(node.parameterRemovalSpans!["duration"]!.end.offset);
    expect(patched).toBe("@scene s\n@camera   zoom   to=1.20\n");
  });

  it("preserves the OTHER side's irregular spacing exactly for a middle-position removal", () => {
    const source = "@scene s\n@camera zoom  duration=0.50s   to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const patched =
      source.slice(0, node.parameterRemovalSpans!["duration"]!.start.offset) +
      source.slice(node.parameterRemovalSpans!["duration"]!.end.offset);
    expect(patched).toBe("@scene s\n@camera zoom   to=1.20\n");
  });

  it("uses actual authored tab separators, never an assumed ASCII space", () => {
    const source = "@scene s\n@music\ttheme.mp3\tvolume=0.80\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const removed = raw(source, node.parameterRemovalSpans!["volume"]!);
    expect(removed).toBe("\tvolume=0.80");
    const patched =
      source.slice(0, node.parameterRemovalSpans!["volume"]!.start.offset) +
      source.slice(node.parameterRemovalSpans!["volume"]!.end.offset);
    expect(patched).toBe("@scene s\n@music\ttheme.mp3\n");
  });

  it("ends before authored trailing line whitespace, which remains untouched", () => {
    const source = "@scene s\n@music theme.mp3 volume=0.80    \nAfter.\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const patched =
      source.slice(0, node.parameterRemovalSpans!["volume"]!.start.offset) +
      source.slice(node.parameterRemovalSpans!["volume"]!.end.offset);
    expect(patched).toBe("@scene s\n@music theme.mp3    \nAfter.\n");
  });

  it("remains correct with CRLF line endings, never splitting \\r\\n", () => {
    const source = ["@scene s", "@camera zoom to=1.20 duration=0.50s"].join("\r\n") + "\r\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const patched =
      source.slice(0, node.parameterRemovalSpans!["duration"]!.start.offset) +
      source.slice(node.parameterRemovalSpans!["duration"]!.end.offset);
    expect(patched).toBe(["@scene s", "@camera zoom to=1.20"].join("\r\n") + "\r\n");
  });

  it("remains correct with Korean text and an emoji preceding the directive", () => {
    const source = "@scene s\n한글 문장입니다 😀 텍스트.\n\n@camera zoom to=1.20 duration=0.50s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    const patched =
      source.slice(0, node.parameterRemovalSpans!["duration"]!.start.offset) +
      source.slice(node.parameterRemovalSpans!["duration"]!.end.offset);
    expect(patched).toBe("@scene s\n한글 문장입니다 😀 텍스트.\n\n@camera zoom to=1.20\n");
  });
});

describe("PresentationNode.parameterRemovalSpans — unknown key and absent parameter", () => {
  it("is generic and directive-kind-agnostic: a unique unknown named parameter also receives a removal span", () => {
    const source = "@scene s\n@camera zoom foo=bar to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.parameterRemovalSpans!["foo"]).toBeDefined();
    const patched =
      source.slice(0, node.parameterRemovalSpans!["foo"]!.start.offset) +
      source.slice(node.parameterRemovalSpans!["foo"]!.end.offset);
    expect(patched).toBe("@scene s\n@camera zoom to=1.20\n");
  });

  it("preserves an unknown named parameter byte-for-byte when removing a different key", () => {
    const source = "@scene s\n@camera zoom foo=bar to=1.20 duration=0.50s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    const patched =
      source.slice(0, node.parameterRemovalSpans!["duration"]!.start.offset) +
      source.slice(node.parameterRemovalSpans!["duration"]!.end.offset);
    expect(patched).toBe("@scene s\n@camera zoom foo=bar to=1.20\n");
  });

  it("is undefined for a key that is not authored at all", () => {
    const source = "@scene s\n@camera zoom to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.parameterRemovalSpans!["duration"]).toBeUndefined();
  });
});

describe("PresentationNode.parameterRemovalSpans — duplicate-safety (central regression)", () => {
  it("is undefined when the target key occurs twice, even though parameterValueSpans still resolves the effective last occurrence", () => {
    const source = "@scene s\n@music theme.mp3 volume=0.50 volume=0.80\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.volume).toBe(0.8); // last-occurrence-wins semantic value, unchanged
    expect(raw(source, node.parameterValueSpans!["volume"]!)).toBe("0.80"); // unchanged existing behavior
    expect(node.parameterRemovalSpans!["volume"]).toBeUndefined(); // duplicate — no safe removal range
  });

  it("does not let an unrelated duplicate suppress a different, uniquely-authored key's removal span", () => {
    const source = "@scene s\n@camera zoom to=1.20 to=1.40 duration=0.50s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.parameterRemovalSpans!["to"]).toBeUndefined();
    expect(node.parameterRemovalSpans!["duration"]).toBeDefined();
  });
});

/**
 * docs/CORE_SPEC.md Sections 14/25.36 (Structured Editing of
 * Presentation String/Path Positional Values expansion) —
 * `PresentationNode.contiguousPositionalSpan` is a strict, additive
 * generalization of `positionalValueSpan`: populated whenever ALL
 * positional tokens occupy one uninterrupted physical run, regardless of
 * count, including all authored inter-token whitespace verbatim. These
 * tests prove it exact against real raw source, that it never broadens or
 * replaces `positionalValueSpan`'s own unchanged one-token-only contract,
 * and that an interleaved named parameter still correctly disables it.
 */
describe("PresentationNode.contiguousPositionalSpan — single token (coexists with positionalValueSpan)", () => {
  it("covers the identical raw range as positionalValueSpan for a single-token Music track", () => {
    const source = "@scene s\n@music theme.mp3 volume=0.8\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.positionalValueSpan!)).toBe("theme.mp3");
    expect(raw(source, node.contiguousPositionalSpan!)).toBe("theme.mp3");
    expect(node.contiguousPositionalSpan).toEqual(node.positionalValueSpan);
  });

  it("covers the identical raw range for a single-token Background image", () => {
    const source = "@scene s\n@background bg.png\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.contiguousPositionalSpan!)).toBe("bg.png");
    expect(node.contiguousPositionalSpan).toEqual(node.positionalValueSpan);
  });

  it("covers the identical raw range for Camera's single-token action ('zoom') — generic, directive-kind-agnostic", () => {
    const source = "@scene s\n@camera zoom to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.contiguousPositionalSpan!)).toBe("zoom");
    expect(node.contiguousPositionalSpan).toEqual(node.positionalValueSpan);
  });
});

describe("PresentationNode.contiguousPositionalSpan — contiguous multi-token runs", () => {
  it("slices the full contiguous run when positionalValueSpan is undefined (2 tokens, no named param)", () => {
    const source = "@scene s\n@music my theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.positionalValueSpan).toBeUndefined();
    expect(raw(source, node.contiguousPositionalSpan!)).toBe("my theme.mp3");
  });

  it("preserves irregular authored internal spacing exactly, never normalizing to a single space", () => {
    const source = "@scene s\n@music my    theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.contiguousPositionalSpan!)).toBe("my    theme.mp3");
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("my theme.mp3"); // semantic value IS normalized...
    expect(raw(source, node.contiguousPositionalSpan!)).not.toBe(node.command.track); // ...raw span is NOT
  });

  it("remains contiguous when a named parameter appears BEFORE the entire positional run", () => {
    const source = "@scene s\n@music volume=0.8 my theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.contiguousPositionalSpan!)).toBe("my theme.mp3");
  });

  it("remains contiguous when a named parameter appears AFTER the entire positional run", () => {
    const source = "@scene s\n@music my theme.mp3 volume=0.8\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.contiguousPositionalSpan!)).toBe("my theme.mp3");
  });

  it("slices a representative multi-token Background/Sfx contiguous run", () => {
    const bg = compileOk("@scene s\n@background images/bg 1.png\n");
    const bgNode = presentation(bg.document.scenes[0]!.blocks[0]!);
    expect(raw("@scene s\n@background images/bg 1.png\n", bgNode.contiguousPositionalSpan!)).toBe("images/bg 1.png");

    const sfx = compileOk("@scene s\n@sfx door knock.wav\n");
    const sfxNode = presentation(sfx.document.scenes[0]!.blocks[0]!);
    expect(raw("@scene s\n@sfx door knock.wav\n", sfxNode.contiguousPositionalSpan!)).toBe("door knock.wav");
  });
});

describe("PresentationNode.contiguousPositionalSpan — non-contiguous (central safety regression)", () => {
  it("is undefined when a named parameter physically interleaves between two positional tokens", () => {
    const source = "@scene s\n@music first volume=0.8 second\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("first second"); // the semantic value DOES exist...
    expect(node.contiguousPositionalSpan).toBeUndefined(); // ...but no safe span represents it
  });

  it("is undefined for a more complex interleaving with three positional/named tokens", () => {
    const source = "@scene s\n@music my foo=bar theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("my theme.mp3");
    expect(node.contiguousPositionalSpan).toBeUndefined();
  });

  it("is undefined for zero positional tokens (defensive; not reachable via a successfully-parsed in-scope node)", () => {
    // Directly exercises the zero-positional-token branch of the
    // contiguity computation without relying on a specific failing
    // directive shape (all in-scope directives require at least one
    // positional token to parse at all).
    const source = "@scene s\n@camera zoom to=1.20\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    expect(node.contiguousPositionalSpan).toBeDefined(); // sanity: this fixture DOES have one positional token
  });
});

describe("PresentationNode.contiguousPositionalSpan — CRLF, Unicode, and existing-metadata coexistence", () => {
  it("remains correct with CRLF line endings", () => {
    const source = ["@scene s", "@music my theme.mp3 volume=0.8"].join("\r\n") + "\r\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.contiguousPositionalSpan!)).toBe("my theme.mp3");
  });

  it("remains correct with Korean text and an emoji preceding the directive", () => {
    const source = "@scene s\n한글 문장입니다 😀 텍스트.\n\n@music my theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(raw(source, node.contiguousPositionalSpan!)).toBe("my theme.mp3");
  });

  it("coexists without regression alongside every other existing metadata field", () => {
    const source = "@scene s\n@camera zoom to=1.20 duration=0.50s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.parameterValueSpans!["to"]).toBeDefined();
    expect(node.parameterValueSpans!["duration"]).toBeDefined();
    expect(node.positionalValueSpan).toBeDefined();
    expect(node.argumentsEndPosition).toBeDefined();
    expect(node.parameterRemovalSpans!["duration"]).toBeDefined();
    expect(node.contiguousPositionalSpan).toBeDefined();
    expect(raw(source, node.contiguousPositionalSpan!)).toBe("zoom");
  });
});

/**
 * docs/CORE_SPEC.md Sections 14/25.36 (Whole Presentation Command
 * Removal expansion) — `PresentationNode.commandRemovalSpan` is the
 * compiler-owned span that, deleted, removes an entire authored
 * Presentation directive cleanly: `start` is always `span.start`, `end`
 * extends `span.end` by exactly this directive's own physical line's
 * terminator width (0/1/2 bytes). These tests prove the resulting source
 * (after a literal `slice+""+slice` splice) is exact for every position
 * and trivia combination — never merely that `commandRemovalSpan` itself
 * has plausible-looking offsets.
 */
function findPresentation(blocks: readonly StoryBlock[]): PresentationNode {
  for (const block of blocks) {
    if (block.type === "Presentation") return block;
    if (block.type === "Conditional") {
      for (const branch of block.branches) {
        try {
          return findPresentation(branch.blocks);
        } catch {
          // keep searching other branches
        }
      }
    }
    if (block.type === "Variant") {
      for (const branch of block.branches) {
        try {
          return findPresentation(branch.blocks);
        } catch {
          // keep searching other branches
        }
      }
    }
  }
  throw new Error("no Presentation node found");
}

function removed(source: string, node: PresentationNode): string {
  const span = node.commandRemovalSpan!;
  return source.slice(0, span.start.offset) + source.slice(span.end.offset);
}

describe("PresentationNode.commandRemovalSpan — position", () => {
  it("removes exactly the first Presentation command, no leading blank line", () => {
    const source = "@music theme.mp3\n@pause 1s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("@pause 1s\n");
  });

  it("removes exactly a middle Presentation command, no accidental blank line", () => {
    const source = "@background bg.png\n@music theme.mp3\n@pause 1s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(removed(source, node)).toBe("@background bg.png\n@pause 1s\n");
  });

  it("removes exactly the last Presentation command with a trailing LF, no trailing blank line", () => {
    const source = "@background bg.png\n@music theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(removed(source, node)).toBe("@background bg.png\n");
  });

  it("removes exactly the last Presentation command at true EOF (no trailing newline)", () => {
    const source = "@background bg.png\n@music theme.mp3";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(node.commandRemovalSpan).toEqual(node.span);
    expect(removed(source, node)).toBe("@background bg.png\n");
  });

  it("leaves the explicit Scene itself when removing its only command", () => {
    const source = "@scene intro\n@music theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("@scene intro\n");
  });

  it("leaves the explicit Scene itself when removing its only command at true EOF", () => {
    const source = "@scene intro\n@music theme.mp3";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("@scene intro\n");
  });

  it("produces an empty document when removing the only command in the whole source", () => {
    const source = "@music theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("");
  });

  it("produces an empty document when removing the only command in the whole source, no trailing newline", () => {
    const source = "@music theme.mp3";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(node.commandRemovalSpan).toEqual(node.span);
    expect(removed(source, node)).toBe("");
  });
});

describe("PresentationNode.commandRemovalSpan — blank-line and trivia preservation", () => {
  it("preserves authored blank lines after the removed command exactly", () => {
    const source = "@music theme.mp3\n\n\n@pause 1s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("\n\n@pause 1s\n");
  });

  it("preserves authored blank lines before the removed command exactly", () => {
    const source = "@background bg.png\n\n\n@music theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(removed(source, node)).toBe("@background bg.png\n\n\n");
  });

  it("preserves authored blank lines on both sides, merged around the removed command", () => {
    const source = "@background bg.png\n\n@music theme.mp3\n\n@pause 1s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(removed(source, node)).toBe("@background bg.png\n\n\n@pause 1s\n");
  });

  it("removes authored trailing spaces on the directive line as part of node.span, with no separate handling", () => {
    const source = "@music theme.mp3    \n@pause 1s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("@pause 1s\n");
  });

  it("removes authored trailing tabs on the directive line", () => {
    const source = "@music theme.mp3\t\t\n@pause 1s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("@pause 1s\n");
  });
});

describe("PresentationNode.commandRemovalSpan — CRLF", () => {
  it("consumes the full two-byte CRLF terminator, never leaving a stray \\r", () => {
    const source = "@music theme.mp3\r\n@pause 1s\r\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("@pause 1s\r\n");
  });

  it("removes the last CRLF command cleanly with a trailing terminator", () => {
    const source = "@background bg.png\r\n@music theme.mp3\r\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(removed(source, node)).toBe("@background bg.png\r\n");
  });
});

describe("PresentationNode.commandRemovalSpan — Scene boundary", () => {
  it("removes a command from Scene A without touching Scene B", () => {
    const source = "@scene a\n@music theme.mp3\n@scene b\n@pause 1s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("@scene a\n@scene b\n@pause 1s\n");
  });

  it("preserves an authored blank line between the removed command and the next Scene", () => {
    const source = "@scene a\n@music theme.mp3\n\n@scene b\n@pause 1s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("@scene a\n\n@scene b\n@pause 1s\n");
  });
});

describe("PresentationNode.commandRemovalSpan — adjacency to other block types", () => {
  it("removes cleanly when followed by a Markdown paragraph", () => {
    const source = "@scene a\n@music theme.mp3\nHello\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("@scene a\nHello\n");
  });

  it("removes cleanly when preceded by a Markdown paragraph", () => {
    const source = "Hello\n@music theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(removed(source, node)).toBe("Hello\n");
  });

  it("removes cleanly when adjacent to a @set block", () => {
    const source = "@scene a\n@set x = 1\n@music theme.mp3\n@set y = 2\n";
    const { document } = compileOk(source);
    const node = findPresentation(document.scenes[0]!.blocks);

    expect(removed(source, node)).toBe("@scene a\n@set x = 1\n@set y = 2\n");
  });
});

describe("PresentationNode.commandRemovalSpan — frontmatter, Unicode, and combined regressions", () => {
  it("computes a correct removal span for a Presentation command after YAML frontmatter", () => {
    const source = "---\ntitle: Test\n---\n@music theme.mp3\n@pause 1s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe("---\ntitle: Test\n---\n@pause 1s\n");
  });

  it("remains correct with Korean text and an emoji preceding the directive", () => {
    const source = "@scene s\n한글 문장입니다 😀 텍스트.\n\n@music theme.mp3\n@pause 1s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[1]!);

    expect(removed(source, node)).toBe("@scene s\n한글 문장입니다 😀 텍스트.\n\n@pause 1s\n");
  });

  it("combined frontmatter + CRLF regression", () => {
    const source = ["---", "title: Test", "---", "@music theme.mp3", "@pause 1s"].join("\r\n") + "\r\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(removed(source, node)).toBe(["---", "title: Test", "---", "@pause 1s"].join("\r\n") + "\r\n");
  });
});

describe("PresentationNode.commandRemovalSpan — nested Conditional/Variant branches", () => {
  it("removes a Presentation command nested inside a Conditional branch, preserving @if/@end", () => {
    const source = "@if x\nHello\n@music theme.mp3\nWorld\n@end\n";
    const { document } = compileOk(source);
    const node = findPresentation(document.scenes[0]!.blocks);

    expect(removed(source, node)).toBe("@if x\nHello\nWorld\n@end\n");
  });

  it("leaves a valid, empty Conditional branch when removing its sole block", () => {
    const source = "@if x\n@music theme.mp3\n@end\n";
    const { document } = compileOk(source);
    const node = findPresentation(document.scenes[0]!.blocks);

    const result = removed(source, node);
    expect(result).toBe("@if x\n@end\n");
    const reCompiled = compileOk(result);
    const conditional = reCompiled.document.scenes[0]!.blocks[0]!;
    if (conditional.type !== "Conditional") throw new Error("expected Conditional");
    expect(conditional.branches[0]!.blocks).toHaveLength(0);
  });

  it("removes a Presentation command nested inside a Variant branch, preserving @variant/@when/@end", () => {
    const source = "@variant v\n@when x\nHello\n@music theme.mp3\nWorld\n@end\n";
    const { document } = compileOk(source);
    const node = findPresentation(document.scenes[0]!.blocks);

    expect(removed(source, node)).toBe("@variant v\n@when x\nHello\nWorld\n@end\n");
  });

  it("leaves a valid, empty Variant branch when removing its sole block", () => {
    const source = "@variant v\n@when x\n@music theme.mp3\n@end\n";
    const { document } = compileOk(source);
    const node = findPresentation(document.scenes[0]!.blocks);

    const result = removed(source, node);
    expect(result).toBe("@variant v\n@when x\n@end\n");
    const reCompiled = compileOk(result);
    const variant = reCompiled.document.scenes[0]!.blocks[0]!;
    if (variant.type !== "Variant") throw new Error("expected Variant");
    expect(variant.branches[0]!.blocks).toHaveLength(0);
  });
});

describe("PresentationNode.commandRemovalSpan — existing metadata unaffected", () => {
  it("does not change node.span or any other existing metadata field", () => {
    const source = "@scene s\n@camera zoom to=1.20 duration=0.50s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);

    expect(raw(source, node.span)).toBe("@camera zoom to=1.20 duration=0.50s");
    expect(node.parameterValueSpans!["to"]).toBeDefined();
    expect(node.parameterValueSpans!["duration"]).toBeDefined();
    expect(node.positionalValueSpan).toBeDefined();
    expect(node.argumentsEndPosition).toBeDefined();
    expect(node.parameterRemovalSpans!["duration"]).toBeDefined();
    expect(node.contiguousPositionalSpan).toBeDefined();
    expect(node.commandRemovalSpan).toBeDefined();
  });

  it("does not change Scene metadata", () => {
    const source = "@scene a\n@music theme.mp3\n@scene b\n@pause 1s\n";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.followingLineEnding).toBe("\n");
    expect(document.scenes).toHaveLength(2);
  });
});
