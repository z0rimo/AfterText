import { describe, expect, it } from "vitest";
import type { PresentationNode, StoryBlock } from "../src/index.js";
import { compile } from "../src/index.js";
import { codesOf, compileOk } from "./helpers.js";

/**
 * docs/CORE_SPEC.md Section 14, "Quoted Presentation positional
 * arguments" — double-quoted syntax for Presentation POSITIONAL argument
 * tokens (Background.image/Layer.image/Music.track/Sfx.clip), scoped
 * entirely to `tokenizePresentationArgs`. These tests prove: (1) the
 * decoded semantic AST value excludes quote delimiters/escapes; (2) the
 * raw source-tooling spans (`positionalValueSpan`/`contiguousPositionalSpan`)
 * include the full authored lexical token, quotes included; (3) every
 * existing unquoted/named-parameter/numeric/expression/Conditional/Variant
 * behavior is completely unaffected.
 */

function presentation(block: StoryBlock): PresentationNode {
  if (block.type !== "Presentation") throw new Error(`expected Presentation, got ${block.type}`);
  return block;
}

function raw(source: string, span: { start: { offset: number }; end: { offset: number } }): string {
  return source.slice(span.start.offset, span.end.offset);
}

describe("basic quoted strings", () => {
  it("Background: quoted path with spaces decodes without quotes", () => {
    const source = '@scene s\n@background "background images/night city.png"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Background") throw new Error("expected Background");
    expect(node.command.image).toBe("background images/night city.png");
  });

  it("Layer: quoted path with spaces decodes without quotes", () => {
    const source = '@scene s\n@layer "characters/alice happy.png"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Layer") throw new Error("expected Layer");
    expect(node.command.image).toBe("characters/alice happy.png");
  });

  it("Music: quoted track with spaces decodes without quotes", () => {
    const source = '@scene s\n@music "audio/theme song.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("audio/theme song.mp3");
  });

  it("Sfx: quoted clip with spaces decodes without quotes", () => {
    const source = '@scene s\n@sfx "sounds/door knock.wav"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Sfx") throw new Error("expected Sfx");
    expect(node.command.clip).toBe("sounds/door knock.wav");
  });

  it("preserves repeated internal spaces exactly (no collapsing inside quotes)", () => {
    const source = '@scene s\n@music "theme   song.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("theme   song.mp3");
  });

  it("preserves an internal tab exactly (no collapsing inside quotes)", () => {
    const source = '@scene s\n@music "theme\tsong.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("theme\tsong.mp3");
  });

  it("an empty quoted value decodes to an empty string (rejected only by existing required-value validation)", () => {
    const result = compile('@scene s\n@music ""\n');
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.diagnostics[0]!.message).toContain("requires a file path");
  });

  it("a whitespace-only quoted value is accepted (not trimmed, not treated as empty)", () => {
    const source = '@scene s\n@sfx "   "\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Sfx") throw new Error("expected Sfx");
    expect(node.command.clip).toBe("   ");
  });
});

describe("classification: quoted positional grouping happens before named-parameter classification", () => {
  it('"foo=bar.mp3" is positional, never a named parameter', () => {
    const source = '@scene s\n@music "foo=bar.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("foo=bar.mp3");
  });

  it('"config=default.json" is positional (the identifier-prefixed key=value ambiguity is now avoidable via quoting)', () => {
    const source = '@scene s\n@background "config=default.json"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Background") throw new Error("expected Background");
    expect(node.command.image).toBe("config=default.json");
  });

  it("a quoted URL containing = decodes as one positional value", () => {
    const source = '@scene s\n@music "https://example.test/file?id=123"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("https://example.test/file?id=123");
  });

  it("an ordinary unquoted URL containing = remains unaffected (existing behavior)", () => {
    const source = "@scene s\n@music https://example.test/file?id=123\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("https://example.test/file?id=123");
  });

  it("an existing named argument after a quoted positional value still works", () => {
    const source = '@scene s\n@music "theme song.mp3" volume=0.5\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("theme song.mp3");
    expect(node.command.volume).toBe(0.5);
  });

  it("existing duplicate-named-parameter behavior (last occurrence wins) is unchanged", () => {
    const source = "@scene s\n@camera zoom to=1.20 to=1.40\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Camera") throw new Error("expected Camera");
    expect(node.command.to).toBe(1.4);
  });

  it("existing unknown-named-parameter behavior (silently ignored, no diagnostic) is unchanged", () => {
    const result = compile("@scene s\n@background asset=dark room.png\n");
    expect(result.hasErrors).toBe(false);
    const node = presentation(result.document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Background") throw new Error("expected Background");
    expect(node.command.image).toBe("room.png");
  });
});

describe("escapes", () => {
  it('decodes \\" to a literal quote character', () => {
    const source = '@scene s\n@music "a\\"b.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe('a"b.mp3');
  });

  it("decodes \\\\ to one literal backslash", () => {
    const source = '@scene s\n@music "foo\\\\bar.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("foo\\bar.mp3");
  });

  it("preserves an ordinary Windows path with unescaped backslashes verbatim", () => {
    const source = '@scene s\n@music "C:\\Users\\alice\\music.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("C:\\Users\\alice\\music.mp3");
  });

  it("an unrecognized escape preserves both the backslash and the following character", () => {
    const source = '@scene s\n@music "C:\\Uabc.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("C:\\Uabc.mp3");
  });

  it("\\n inside a quoted value remains the two literal characters backslash and n (not a newline)", () => {
    const source = '@scene s\n@music "line1\\nline2.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("line1\\nline2.mp3");
  });

  it("\\t inside a quoted value remains the two literal characters backslash and t (not a tab)", () => {
    const source = '@scene s\n@music "a\\tb.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("a\\tb.mp3");
  });

  it("a terminal backslash immediately before the closing quote is an escaped-quote pair, not a terminator", () => {
    // `"foo\"` — the backslash escapes the quote, so the string is NOT
    // closed there; scanning continues and the whole argument becomes
    // unterminated (no further closing quote exists).
    const result = compile('@scene s\n@music "foo\\"\n');
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.diagnostics[0]!.message).toContain("unterminated quoted argument");
  });

  it("an escaped closing quote followed by real content and a real closing quote decodes correctly", () => {
    const source = '@scene s\n@music "foo\\"bar"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe('foo"bar');
  });

  it("multiple escape/backslash parity: \\\\\\\" decodes left to right as one backslash then a closing quote", () => {
    // Raw authored text inside the quotes is: \ \ "  (three characters).
    // Left-to-right: the first two backslashes form the recognized `\\`
    // escape (one literal backslash); the third character is then an
    // UNESCAPED quote, which closes the string.
    const source = '@scene s\n@music "foo\\\\"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("foo\\");
  });

  it("preserves literal Korean text and an emoji inside a quoted value unchanged", () => {
    const source = '@scene s\n@music "한글 노래 😀.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("한글 노래 😀.mp3");
  });
});

describe("unterminated quoted argument", () => {
  it("reports AT1301 with a reason mentioning an unterminated quoted argument", () => {
    const result = compile('@scene s\n@music "theme song.mp3\n');
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.diagnostics[0]!.message).toContain("unterminated quoted argument");
  });

  it("the diagnostic span runs from the opening quote to the end of that physical line", () => {
    const source = '@scene s\n@music "theme song.mp3\n';
    const result = compile(source);
    const diagnostic = result.diagnostics.find((d) => d.code === "AT1301")!;
    // Line 2 is `@music "theme song.mp3`; the opening quote is at column 8
    // (offset 9 + 7 = the `"` right after "@music "); the span should run
    // through the end of that line's content (before its own `\n`).
    const lineStart = source.indexOf('@music "theme song.mp3');
    const openQuoteOffset = source.indexOf('"', lineStart);
    const lineEndOffset = source.indexOf("\n", lineStart);
    expect(diagnostic.span.start.offset).toBe(openQuoteOffset);
    expect(diagnostic.span.end.offset).toBe(lineEndOffset);
  });

  it("produces no PresentationNode for the malformed line", () => {
    const result = compile('@scene s\n@music "theme song.mp3\n');
    expect(result.document.scenes[0]!.blocks.filter((b) => b.type === "Presentation")).toHaveLength(0);
  });

  it("the following physical line still parses successfully (no cross-line recovery corruption)", () => {
    const result = compile('@scene s\n@music "theme song.mp3\n@pause 1s\n');
    const node = presentation(result.document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Pause") throw new Error("expected Pause");
    expect(node.command.durationMs).toBe(1000);
  });

  it("an unterminated quote never consumes the next physical line's content as string data", () => {
    const result = compile('@scene s\n@music "theme song.mp3\nNot part of the string.\n');
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    // The prose line becomes ordinary Markdown content, not swallowed
    // string data — confirmed by it compiling into a Paragraph block.
    expect(result.document.scenes[0]!.blocks.some((b) => b.type === "Paragraph")).toBe(true);
  });
});

describe("source-tooling metadata", () => {
  it("positionalValueSpan slices the full quoted token including both delimiters", () => {
    const source = '@scene s\n@music "theme song.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    expect(raw(source, node.positionalValueSpan!)).toBe('"theme song.mp3"');
  });

  it("contiguousPositionalSpan slices the full quoted token including both delimiters", () => {
    const source = '@scene s\n@music "theme song.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    expect(raw(source, node.contiguousPositionalSpan!)).toBe('"theme song.mp3"');
  });

  it("internal quoted spaces do not split the token into multiple positional entries", () => {
    const source = '@scene s\n@music "theme   song.mp3" volume=0.5\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    expect(raw(source, node.positionalValueSpan!)).toBe('"theme   song.mp3"');
  });

  it("internal quoted tabs do not split the token into multiple positional entries", () => {
    const source = '@scene s\n@music "theme\tsong.mp3" volume=0.5\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    expect(raw(source, node.positionalValueSpan!)).toBe('"theme\tsong.mp3"');
  });

  it("argumentsEndPosition lands immediately after the closing quote", () => {
    const source = '@scene s\n@music "theme song.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    const expectedOffset = source.indexOf('"theme song.mp3"') + '"theme song.mp3"'.length;
    expect(node.argumentsEndPosition!.offset).toBe(expectedOffset);
  });

  it("parameterRemovalSpans for a named parameter following a quoted positional value is unaffected", () => {
    const source = '@scene s\n@music "theme song.mp3" volume=0.5\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    expect(raw(source, node.parameterRemovalSpans!.volume!)).toBe(" volume=0.5");
  });

  it("commandRemovalSpan is unaffected by quoted argument content (physical-line-based)", () => {
    const source = '@music "theme song.mp3"\n@pause 1s\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    expect(raw(source, node.commandRemovalSpan!)).toBe('@music "theme song.mp3"\n');
  });

  it("PresentationNode.span is unaffected in contract (includes the full quoted argument text)", () => {
    const source = '@scene s\n@music "theme song.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    expect(raw(source, node.span)).toBe('@music "theme song.mp3"');
  });

  it("computes correct offsets with CRLF line endings", () => {
    const source = ["@scene s", '@music "theme song.mp3"'].join("\r\n") + "\r\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("theme song.mp3");
    expect(raw(source, node.positionalValueSpan!)).toBe('"theme song.mp3"');
  });

  it("computes correct offsets when the directive follows YAML frontmatter", () => {
    const source = '---\ntitle: Test\n---\n@scene s\n@music "theme song.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("theme song.mp3");
    expect(raw(source, node.positionalValueSpan!)).toBe('"theme song.mp3"');
  });

  it("computes correct UTF-16 offsets with Korean text and an emoji inside the quoted value", () => {
    const source = '@scene s\n@music "한글 노래 😀.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    expect(raw(source, node.positionalValueSpan!)).toBe('"한글 노래 😀.mp3"');
  });
});

describe("compatibility: everything unquoted/unrelated remains exactly as before", () => {
  it("an ordinary unquoted path is unaffected", () => {
    const source = "@scene s\n@music theme.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("theme.mp3");
  });

  it("ordinary unquoted multi-token positional joining is unaffected", () => {
    const source = "@scene s\n@music theme song.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("theme song.mp3");
  });

  it("repeated unquoted whitespace still collapses to one space (unchanged)", () => {
    const source = "@scene s\n@music theme    song.mp3\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("theme song.mp3");
  });

  it("an identifier-prefixed key=value-shaped unquoted positional value is still misclassified exactly as before", () => {
    const result = compile("@scene s\n@music foo=bar.mp3\n");
    expect(codesOf(result.diagnostics)).toContain("AT1301");
    expect(result.diagnostics[0]!.message).toContain("requires a file path");
  });

  it("existing numeric Presentation parsing is unaffected", () => {
    const source = "@scene s\n@camera zoom to=1.15 duration=6s\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Camera") throw new Error("expected Camera");
    expect(node.command.to).toBe(1.15);
    expect(node.command.durationMs).toBe(6000);
  });

  it("unquoted Camera action is unaffected", () => {
    const source = "@scene s\n@camera zoom to=1.5\n";
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Camera") throw new Error("expected Camera");
    expect(node.command.action).toBe("zoom");
  });

  it('a quoted Camera action, "zoom", resolves to the same semantic action as the natural accepted consequence of positional quoting', () => {
    const source = '@scene s\n@camera "zoom" to=1.5\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Camera") throw new Error("expected Camera");
    expect(node.command.action).toBe("zoom");
    expect(node.command.to).toBe(1.5);
  });

  it("a quoted Pause duration remains rejected by existing numeric/duration parsing", () => {
    const result = compile('@scene s\n@pause "1.5"\n');
    expect(codesOf(result.diagnostics)).toContain("AT1301");
  });

  it("a quoted Camera to= value remains rejected by existing numeric parsing", () => {
    const result = compile('@scene s\n@camera zoom to="1.5"\n');
    expect(codesOf(result.diagnostics)).toContain("AT1301");
  });

  it("a quoted Music volume= value remains rejected by existing numeric parsing", () => {
    const result = compile('@scene s\n@music theme.mp3 volume="0.5"\n');
    expect(codesOf(result.diagnostics)).toContain("AT1301");
  });

  it("expression string literals (@set) are completely unaffected", () => {
    const { document } = compileOk('@scene s\n@set greeting = "hello world"\n');
    const block = document.scenes[0]!.blocks[0]!;
    if (block.type !== "Set") throw new Error("expected Set");
    expect(block.expression).toMatchObject({ type: "Literal", value: "hello world" });
  });

  it("Conditional expression parsing is completely unaffected", () => {
    const { document } = compileOk("@scene s\n@if x == 1\nA.\n@end\n");
    expect(document.scenes[0]!.blocks[0]!.type).toBe("Conditional");
  });

  it("Variant parsing is completely unaffected", () => {
    const { document } = compileOk("@scene s\n@variant v\n@when x == 1\nA.\n@end\n");
    expect(document.scenes[0]!.blocks[0]!.type).toBe("Variant");
  });

  it("Choice/navigation parsing is completely unaffected", () => {
    const source = ["@scene s", "@choice", "* Go -> next", "@end", "", "@scene next", "Done."].join("\n");
    const { document } = compileOk(source);
    expect(document.scenes[0]!.blocks[0]!.type).toBe("Choice");
  });

  it("the numeric-hardening finite-value invariant is unaffected by quoted-argument parsing", () => {
    const result = compile("@scene s\n@camera zoom to=-0\n");
    expect(result.hasErrors).toBe(false);
    const node = presentation(result.document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Camera") throw new Error("expected Camera");
    expect(Object.is(node.command.to, -0)).toBe(true);
  });
});

describe("mixed quoted/unquoted positional tokens (accepted existing grammar behavior, not a recommended style)", () => {
  it("joins a leading unquoted token with a following quoted token using the existing single-space join", () => {
    const source = '@scene s\n@music prefix "theme song.mp3"\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe("prefix theme song.mp3");
  });

  it("mid-token quote (not at a token boundary) remains ordinary literal content, unaffected", () => {
    const source = '@scene s\n@music foo"bar\n';
    const { document } = compileOk(source);
    const node = presentation(document.scenes[0]!.blocks[0]!);
    if (node.command.type !== "Music") throw new Error("expected Music");
    expect(node.command.track).toBe('foo"bar');
  });
});
