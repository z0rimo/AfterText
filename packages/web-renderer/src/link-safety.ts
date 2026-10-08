const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/** Any absolute base is fine here — only used to resolve relative/fragment URLs so `URL` can report their protocol. */
const RESOLUTION_BASE = "https://after-text-link-safety.invalid/";

/**
 * Whether `url` is safe to render as an active, navigable `<a href>`
 * (docs/CORE_SPEC.md Section 19.9). Ordinary browser destinations —
 * `http:`/`https:`/`mailto:`, relative paths, and fragment/hash URLs —
 * are allowed. A clearly executable/dangerous scheme (e.g. `javascript:`)
 * is rejected; the caller must still render the link's own text, just not
 * as a navigable anchor.
 *
 * Uses the platform `URL` parser rather than string/prefix matching: the
 * WHATWG URL spec strips embedded tab/newline characters before
 * identifying a scheme specifically to defeat `java\tscript:`-style
 * obfuscation, which a naive regex would not.
 */
export function isSafeLinkUrl(url: string): boolean {
  if (url.trim().length === 0) return false;
  try {
    return SAFE_SCHEMES.has(new URL(url, RESOLUTION_BASE).protocol);
  } catch {
    return false;
  }
}
