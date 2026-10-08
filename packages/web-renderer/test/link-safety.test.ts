import { describe, expect, it } from "vitest";
import { isSafeLinkUrl } from "../src/link-safety.js";

describe("isSafeLinkUrl", () => {
  it.each([
    ["https://example.com", true],
    ["http://example.com", true],
    ["mailto:reader@example.com", true],
    ["relative/page.html", true],
    ["#section", true],
    ["javascript:alert(1)", false],
    ["JavaScript:alert(1)", false],
    ["java\tscript:alert(1)", false],
    ["data:text/html,<script>alert(1)</script>", false],
    ["vbscript:msgbox(1)", false],
    ["", false]
  ])("%s -> %s", (url, expected) => {
    expect(isSafeLinkUrl(url)).toBe(expected);
  });
});
