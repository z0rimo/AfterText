import { describe, expect, it } from "vitest";
import { isSafeAssetUrl, isSafeAudioUrl } from "../src/asset-safety.js";

describe("isSafeAssetUrl", () => {
  it.each([
    ["https://example.com/bg.jpg", true],
    ["http://example.com/bg.jpg", true],
    ["blob:https://example.com/9f2b1c-uuid", true],
    ["relative/bg.jpg", true],
    ["/absolute/path/bg.jpg", true],
    ["data:image/png;base64,iVBORw0KGgo=", true],
    ["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", true],
    ["javascript:alert(1)", false],
    ["JavaScript:alert(1)", false],
    ["data:text/html,<script>alert(1)</script>", false],
    ["data:application/octet-stream;base64,AAAA", false],
    ["mailto:reader@example.com", false],
    ["", false],
    // Image safety must remain unweakened by the audio generalization
    // (docs/CORE_SPEC.md Section 23.22): audio-flavored data: is still rejected for images.
    ["data:audio/mpeg;base64,AAAA", false]
  ])("%s -> %s", (url, expected) => {
    expect(isSafeAssetUrl(url)).toBe(expected);
  });
});

describe("isSafeAudioUrl", () => {
  it.each([
    ["https://example.com/theme.mp3", true],
    ["http://example.com/theme.mp3", true],
    ["blob:https://example.com/9f2b1c-uuid", true],
    ["relative/theme.mp3", true],
    ["/absolute/path/theme.mp3", true],
    ["data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAA", true],
    ["data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEA", true],
    ["javascript:alert(1)", false],
    ["JavaScript:alert(1)", false],
    ["data:text/html,<script>alert(1)</script>", false],
    ["data:application/octet-stream;base64,AAAA", false],
    ["mailto:reader@example.com", false],
    ["", false],
    // The audio allowlist must not accept image-flavored data:, either.
    ["data:image/png;base64,iVBORw0KGgo=", false]
  ])("%s -> %s", (url, expected) => {
    expect(isSafeAudioUrl(url)).toBe(expected);
  });
});
