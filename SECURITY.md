# Security Policy

## Supported versions

AfterText is an early (v0.1.x) foundation. Security fixes are made for the **latest published release** of the four packages (`@aftertext/compiler`, `@aftertext/runtime`, `@aftertext/player`, `@aftertext/web-renderer`). Older versions are not patched; please upgrade to the latest release. This policy will be revisited when the project reaches 1.0.

| Version | Supported |
| --- | --- |
| latest `0.1.x` | yes |
| anything older | no |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public issues, discussions, or pull requests.**

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**, or go directly to <https://github.com/z0rimo/AfterText/security/advisories/new>. Include the affected package and version, a description of the impact, and a minimal reproduction if you have one. Only the maintainers can see the report.

Reports are handled on a best-effort basis by the project maintainer. We will acknowledge a report as soon as reasonably possible, keep you updated, and credit you in the advisory if you wish.

## Scope notes

- `.at` story source is declarative and cannot execute arbitrary JavaScript.
- The web renderer treats asset references (`@background`, `@layer`, `@music`, `@sfx`) as opaque strings and resolves them only through the `resolveAsset` function supplied by the host application; the host decides what URLs are loaded.
- Reports about vulnerabilities in development-only dependencies (test and build tooling that is not part of the published packages) are welcome but are usually lower priority.
