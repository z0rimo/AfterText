# Security Policy

AfterText is an early (v0.1.x) foundation. If you believe you have found a security problem in a published package, please report it privately through GitHub's "Report a vulnerability" feature on this repository (Security tab) rather than a public issue. Include the package, version, and a minimal reproduction.

Story source (`.at`) is declarative and cannot execute arbitrary JavaScript; the web renderer treats asset references as opaque strings resolved by the host application.
