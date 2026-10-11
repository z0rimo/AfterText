import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

// A prose run was appended with `blocks.push(...run)`, which passes one call
// argument per block and throws `RangeError` once a run is long enough
// (about 125,000 paragraphs on Node's default stack). Reproducing that size
// takes seconds and gigabytes, so the regression is expressed on the cause:
// compiling a long run must never make a variadic `Array#push` call.

// More paragraphs than the Markdown library's own 10,000-element chunked push.
const PARAGRAPHS = 12_000;

describe("large prose runs", () => {
  it("keeps every paragraph, in source order, with no diagnostics", () => {
    const source = "@scene s\n" + Array.from({ length: PARAGRAPHS }, (_, i) => `Paragraph ${i}.`).join("\n\n") + "\n";
    const result = compile(source);

    expect(result.diagnostics).toEqual([]);
    const blocks = result.document.scenes[0]!.blocks;
    expect(blocks).toHaveLength(PARAGRAPHS);
    expect(blocks.every((b) => b.type === "Paragraph")).toBe(true);
    expect(blocks[0]).toMatchObject({ children: [{ value: "Paragraph 0." }] });
    expect(blocks[PARAGRAPHS - 1]).toMatchObject({ children: [{ value: `Paragraph ${PARAGRAPHS - 1}.` }] });
  });

  it("does not pass a whole prose run as call arguments", () => {
    const nativePush = Array.prototype.push;
    let widest = 0;
    // Swapped by hand rather than `vi.spyOn`: the test runner itself pushes
    // onto arrays, which a spy would recurse into.
    Array.prototype.push = function (this: unknown[], ...items: unknown[]): number {
      if (items.length > widest) widest = items.length;
      return nativePush.apply(this, items);
    };
    try {
      const source = "@scene s\n" + Array.from({ length: PARAGRAPHS }, (_, i) => `Paragraph ${i}.`).join("\n\n") + "\n";
      compile(source);
    } finally {
      Array.prototype.push = nativePush;
    }

    // micromark appends in deliberate chunks of 10,000; anything wider is ours.
    expect(widest).toBeLessThanOrEqual(10_000);
  });
});
