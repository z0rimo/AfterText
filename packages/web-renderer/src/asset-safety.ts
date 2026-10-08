const SAFE_SCHEMES = new Set(["http:", "https:", "blob:"]);

/** Any absolute base is fine here — only used to resolve relative/absolute-path URLs so `URL` can report their protocol. */
const RESOLUTION_BASE = "https://after-text-asset-safety.invalid/";

/** The `data:` MIME-type family a media kind's URLs are allowed to carry. */
type MediaDataPrefix = "image" | "audio";

/**
 * Shared implementation behind `isSafeAssetUrl` (images) and
 * `isSafeAudioUrl` (Music/Sfx, docs/CORE_SPEC.md Section 23.22) —
 * generalized rather than duplicated, since every rule except the `data:`
 * MIME-type family is identical between the two media classes: `http:`/
 * `https:`/`blob:`, relative/absolute-path URLs, and `data:` URLs
 * *specifically carrying `dataPrefix` data* are allowed; an arbitrary
 * `data:` payload (e.g. `data:text/html,...`) and any other scheme
 * (notably `javascript:`) are rejected either way.
 *
 * Uses the platform `URL` parser — including for detecting the `data:`
 * scheme itself — rather than string/prefix matching, for the same
 * obfuscation-resistance reason already documented in `link-safety.ts`.
 */
function isSafeMediaUrl(url: string, dataPrefix: MediaDataPrefix): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed, RESOLUTION_BASE);
  } catch {
    return false;
  }

  if (parsed.protocol === "data:") {
    return parsed.pathname.toLowerCase().startsWith(`${dataPrefix}/`);
  }
  return SAFE_SCHEMES.has(parsed.protocol);
}

/**
 * Whether `url` (the value `resolveAsset` returned, or the identity
 * default) is safe to place into an `<img src>` (docs/CORE_SPEC.md
 * Section 20.14). Distinct allowlist from link safety (`link-safety.ts`).
 * Image safety is unchanged/unweakened by the Section 23.22 audio
 * generalization below: only `data:image/*` is accepted for images.
 */
export function isSafeAssetUrl(url: string): boolean {
  return isSafeMediaUrl(url, "image");
}

/**
 * Whether `url` is safe to assign to an `HTMLAudioElement`'s `src` for
 * Music/Sfx playback (docs/CORE_SPEC.md Section 23.22). Same allowlist
 * as `isSafeAssetUrl` except `data:` URLs must carry `audio/*` data
 * instead of `image/*`.
 */
export function isSafeAudioUrl(url: string): boolean {
  return isSafeMediaUrl(url, "audio");
}
