# Contributing to AfterText

Thanks for your interest. AfterText is an early (v0.1.x) foundation, and the language, APIs, and feature set will change. Contributions are welcome. This page explains how to get set up and how changes get in.

## Quick map

| I want to... | Do this |
| --- | --- |
| Fix a typo, improve a doc, add a test, or fix a small and obvious bug | Open a pull request directly |
| Report a bug | [Open a bug report](https://github.com/z0rimo/AfterText/issues/new?template=bug.yml) |
| Suggest a feature | [Open a feature request](https://github.com/z0rimo/AfterText/issues/new?template=feature.yml) |
| Propose a change to the language, AST, API, or runtime behavior | [Open a design proposal](https://github.com/z0rimo/AfterText/issues/new?template=design.yml) first |
| Ask a question | Use [Discussions](https://github.com/z0rimo/AfterText/discussions) |
| Report a security problem | See [`SECURITY.md`](SECURITY.md); do not open a public issue |

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## When to open an issue first

Small, self-contained changes can go straight to a pull request:

- typos and small documentation fixes
- additional test coverage
- an obvious bug fix with a small scope
- CI or documentation maintenance

Non-trivial changes should be discussed and accepted before implementation, so nobody spends time on something that cannot be merged. Please open an issue (a design proposal is the best fit) before working on:

- DSL syntax additions or changes
- AST changes
- public API changes
- runtime semantics, player contract, or renderer presentation semantics changes
- new presentation commands
- package boundary changes
- anything that could affect compatibility
- large refactors

If you are unsure which group a change belongs to, open an issue or a draft pull request and ask; that is always fine. A pull request for a non-trivial change should link the issue or discussion where it was accepted.

## Branches and releases

`main` is the default branch and the next-release line. It is always kept green and is changed only through pull requests.

```text
main
 ├─ feat/*      new behavior
 ├─ fix/*       bug fixes
 ├─ docs/*      documentation
 ├─ test/*      tests only
 ├─ refactor/*  behavior-preserving restructuring
 └─ chore/*     tooling, CI, dependencies
```

Branch from `main` using one of these prefixes. There is no `develop` branch. A stable release is a version tag on `main` (`v0.x.y`), which publishes a GitHub Release and the npm packages. If several maintenance lines ever need to be supported at once, `release/x.y` branches will be introduced then.

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

## Changing the public API or language semantics

When a change affects the DSL, the AST, exported types or functions, or runtime/player/renderer behavior, the order is:

1. an accepted issue or design discussion;
2. the implementation;
3. tests;
4. review of the public API baseline diff;
5. an update to [`docs/CORE_SPEC.md`](docs/CORE_SPEC.md) when public semantics change (it is canonical, section numbers are stable, and sections marked `LOCKED` are not changed without agreement first);
6. a note for the release notes when consumers are affected.

Each package's exports and their structural shape are recorded in `packages/<name>/api-baseline.json` and compared by `npm run test:api` (part of `npm test`). A baseline difference is a prompt to review, not something to refresh automatically. If the API change is intentional:

1. build, then run `npm run api:update`;
2. review the baseline diff in the pull request and explain it in the description.

Do not refresh a baseline to silence an unexplained difference. Types, interfaces, signatures, and reachable declaration types are tracked; parameter names, JSDoc, and private members are not.

## Pull requests

- Branch from `main`; keep pull requests focused on one problem.
- Use conventional-commit style for commit messages and PR titles: `type(scope): lowercase description` (`feat(compiler): ...`, `fix(runtime): ...`, `docs: ...`, `test: ...`, `refactor: ...`, `ci: ...`, `chore: ...`).
- Fill in the pull request template: what changed, how you validated it, and any compatibility impact.
- Include tests, update the specification when a contract changes, and run `build`, `test`, `typecheck`, and (when package behavior changes) `verify:pack`.
- CI must pass on Node 20.19.0, 22, and 24, and review conversations must be resolved before merging.
- Pull requests are merged with a merge commit.

## License

By contributing you agree that your contributions are licensed under the project's MIT license.
