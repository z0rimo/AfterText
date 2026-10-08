# Contributing to AfterText

Thanks for your interest. AfterText is an early (v0.1.x) foundation, and the language, APIs, and feature set will change. Please open an issue to discuss a change before starting larger work.

## Environment

- Node.js 20.19 or newer (CI runs 20.19.0, 22, and 24).
- npm (workspaces). No global tools are required.

```bash
git clone https://github.com/z0rimo/AfterText.git
cd AfterText
npm ci
```

## Repository layout

```text
packages/compiler       parse + validate -> StoryDocument + diagnostics
packages/runtime        pure execution over a StoryDocument
packages/player         thin headless session layer over the runtime
packages/web-renderer   React component; presentation only
scripts/                release and API-baseline tooling
docs/CORE_SPEC.md       canonical specification (stable section numbers)
```

Dependencies point one way: `web-renderer` -> `player` -> `runtime` -> `compiler`. Compiler code must not depend on runtime or browser behavior, runtime code must not parse source-language syntax, and the renderer must not own narrative semantics.

## Commands

```bash
npm run build        # tsc -b across all packages
npm test             # builds first, runs every package's tests, then the API baseline tests
npm run typecheck    # builds first, typechecks sources and tests
npm run verify:pack  # packs the four packages and checks them from external consumer projects
npm run test:api     # public API baseline tests only (needs a prior build)
```

All of these run in CI on every pull request and on pushes to `main`.

## Tests

Every behavior change needs focused regression tests. Prefer deterministic tests. For compiler work, keep SourceSpan accuracy, CRLF behavior, diagnostic stability, expression precedence, best-effort compilation, and public-AST isolation intact.

## Public API baseline

Each package's exports and their structural shape are recorded in `packages/<name>/api-baseline.json` and compared by `npm run test:api` (part of `npm test`). If a change to the public API is intentional:

1. build, run `npm run api:update`;
2. review the baseline diff in the pull request;
3. explain the API change in the description (and in the release notes if it affects consumers).

Do not refresh a baseline to silence an unexplained difference. Types, interfaces, signatures, and reachable declaration types are tracked; parameter names, JSDoc, and private members are not.

## Specification

`docs/CORE_SPEC.md` is canonical. Do not change a section marked `LOCKED` without proposing the change first. Section numbers are stable: source comments refer to them.

## Pull requests

- Branch from `main`; keep pull requests focused.
- Use conventional-commit style for commit messages and PR titles: `type(scope): lowercase description` (`feat(compiler): ...`, `fix(runtime): ...`, `docs: ...`, `ci: ...`, `chore: ...`).
- Include tests, update the specification when a contract changes, and describe validation (`build`, `test`, `typecheck`, `verify:pack`).
- CI must pass on Node 20.19.0, 22, and 24 before merging.

## License

By contributing you agree that your contributions are licensed under the project's MIT license.
