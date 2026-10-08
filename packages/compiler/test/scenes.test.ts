import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { codesOf, compileOk } from "./helpers.js";

describe("scenes", () => {
  it("splits content at each @scene directive", () => {
    const source = [
      "@scene intro",
      "Intro text.",
      "",
      "@scene middle",
      "Middle text.",
      "",
      "@scene ending",
      "Ending text."
    ].join("\n");

    const { document } = compileOk(source);
    expect(document.scenes.map((s) => s.id)).toEqual(["intro", "middle", "ending"]);
    for (const scene of document.scenes) {
      expect(scene.blocks).toHaveLength(1);
    }
  });

  it("reports AT1003 for duplicate scene ids", () => {
    const source = ["@scene intro", "First.", "", "@scene intro", "Second."].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1003");
  });

  it("reports AT1004 for @goto targeting an unknown scene", () => {
    const source = ["@scene intro", "@goto nowhere"].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).toContain("AT1004");
  });

  it("does not report AT1004 for a valid @goto target", () => {
    const source = ["@scene intro", "@goto next", "", "@scene next", "Done."].join("\n");
    const result = compile(source);
    expect(codesOf(result.diagnostics)).not.toContain("AT1004");
  });
});

/**
 * docs/CORE_SPEC.md Section 25.35 (Presentation Command Insertion
 * expansion) — `SceneNode.span.end` itself is unchanged (verified below,
 * not merely asserted); `SceneNode.followingLineEnding` is new, purely
 * additive source-tooling metadata reporting the exact line-terminator
 * bytes immediately following it. These tests prove it exact for every
 * populated/empty/EOF/CRLF/blank-line/frontmatter/synthetic-scene case a
 * Scene-end command-insertion feature must reason about.
 */
describe("SceneNode.followingLineEnding", () => {
  it("is \"\\n\" for a populated Scene followed by another Scene", () => {
    const source = "@scene a\n@music theme.mp3\n@scene b\nHello.\n";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.span.end.offset).toBe(25);
    expect(source.slice(0, 25)).toBe("@scene a\n@music theme.mp3");
    expect(document.scenes[0]!.followingLineEnding).toBe("\n");
  });

  it("is \"\\n\" for an empty explicit Scene followed by another Scene", () => {
    const source = "@scene a\n@scene b\nHello.\n";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.blocks).toHaveLength(0);
    expect(document.scenes[0]!.span.end.offset).toBe(8);
    expect(document.scenes[0]!.followingLineEnding).toBe("\n");
  });

  it("is \"\\n\" for a populated final Scene with a trailing newline", () => {
    const source = "@scene a\n@music theme.mp3\n";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.followingLineEnding).toBe("\n");
  });

  it("is \"\" for a populated final Scene with no trailing newline (true EOF)", () => {
    const source = "@scene a\n@music theme.mp3";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.span.end.offset).toBe(source.length);
    expect(document.scenes[0]!.followingLineEnding).toBe("");
  });

  it("is \"\\n\" for an empty final Scene with a trailing newline", () => {
    const source = "@scene a\n";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.followingLineEnding).toBe("\n");
  });

  it("is \"\" for an empty final Scene with no trailing newline (true EOF)", () => {
    const source = "@scene a";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.span.end.offset).toBe(source.length);
    expect(document.scenes[0]!.followingLineEnding).toBe("");
  });

  it("is \"\\r\\n\" at a CRLF Scene-to-Scene boundary", () => {
    const source = "@scene a\r\n@music theme.mp3\r\n@scene b\r\nHi.\r\n";
    const { document } = compileOk(source);

    expect(source[document.scenes[0]!.span.end.offset]).toBe("\r");
    expect(document.scenes[0]!.followingLineEnding).toBe("\r\n");
  });

  it("reports only the immediate terminator when blank lines separate Scenes, leaving them outside the span", () => {
    const source = "@scene a\n@music theme.mp3\n\n\n@scene b\nHi.\n";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.followingLineEnding).toBe("\n");
    expect(source.slice(document.scenes[0]!.span.end.offset)).toBe("\n\n\n@scene b\nHi.\n");
  });

  it("computes correctly when a Scene follows YAML frontmatter", () => {
    const source = "---\ntitle: Test\n---\n@scene a\n@music theme.mp3\n";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.span.start.offset).toBe(20);
    expect(document.scenes[0]!.followingLineEnding).toBe("\n");
  });

  it("remains correct with Korean text and an emoji preceding the directive", () => {
    const source = "@scene a\n한글 문장입니다 😀 텍스트.\n\n@scene b\nHi.\n";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.followingLineEnding).toBe("\n");
  });

  it("computes correctly for a synthetic leading Scene", () => {
    const source = "Leading prose.\n\n@music theme.mp3\n\n@scene a\nHi.\n";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.id).toBe("main");
    expect(document.scenes[0]!.followingLineEnding).toBe("\n");
  });

  it("is \"\" for the fully empty document's synthetic Scene", () => {
    const { document } = compileOk("");

    expect(document.scenes).toHaveLength(1);
    expect(document.scenes[0]!.span.start.offset).toBe(0);
    expect(document.scenes[0]!.span.end.offset).toBe(0);
    expect(document.scenes[0]!.followingLineEnding).toBe("");
  });

  it("does not change Scene.span or block spans (purely additive)", () => {
    const source = "@scene a\n@music theme.mp3\n@scene b\nHello.\n";
    const { document } = compileOk(source);

    expect(document.scenes[0]!.span).toEqual({
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 2, column: 17, offset: 25 }
    });
    expect(document.scenes[0]!.blocks[0]!.span.end).toEqual({ line: 2, column: 17, offset: 25 });
  });
});
