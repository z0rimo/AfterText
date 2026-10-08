# AfterText Agent Instructions

These instructions apply to coding agents working in this repository.

## Required reading

Before substantial work, read:

1. `docs/CORE_SPEC.md` (the sections relevant to the task; section numbers are stable and referenced from source comments)
2. the existing implementation relevant to the task

Do not infer architecture solely from the current code when the specification explicitly defines the intended contract.

## Source of truth

`docs/CORE_SPEC.md` is the canonical specification of the language and of the compiler, runtime, player, and web-renderer contracts.

## Design discipline

Do not silently change a decision marked `LOCKED`.

If implementation exposes a problem with a locked decision:

1. identify the conflict;
2. explain why the existing decision is insufficient;
3. propose the smallest viable change;
4. do not perform a broad redesign without explicit maintainer approval.

Avoid speculative abstractions. Do not add infrastructure for hypothetical future features.

## Compatibility

The public API of the four packages is recorded in `packages/*/api-baseline.json` and checked by `npm test`.

Do not change compiler syntax, public AST contracts, or diagnostic semantics as part of unrelated runtime or renderer work. Compiler changes require a concrete language requirement, a compiler regression, or an explicitly accepted design change. Do not change contracts merely to make downstream code more convenient.

If a public API change is intentional, review the baseline diff and refresh it with `npm run api:update`. Never refresh a baseline to silence an unexplained difference.

## Architectural boundaries

Keep these responsibilities separate:

```text
compiler
runtime
player
web renderer
```

Compiler code must not depend on runtime or browser behavior.

Runtime code must not parse source-language syntax.

Renderer code must not become the owner of narrative semantics.

Tools built on these packages must consume them instead of duplicating their behavior.

## AfterText-specific invariants

Preserve:

```text
prose-first authoring
StoryState != ReaderState
first-class Variant identity
AfterText-owned public AST
typed presentation commands
best-effort compiler diagnostics
```

Do not turn AfterText into a general-purpose scripting language.

## Dependency policy

Prefer existing dependencies. A new dependency should solve a concrete problem and should not duplicate a small capability that can reasonably remain internal. Do not introduce frameworks merely for convenience.

## Testing policy

Every behavior change requires focused regression coverage. Prefer deterministic tests.

For compiler work preserve, where applicable:

```text
SourceSpan accuracy
CRLF behavior
diagnostic stability
expression precedence
best-effort compilation
public AST isolation
```

## Verification

After substantial TypeScript changes, run:

```bash
npm run build
npm test
npm run typecheck
npm run verify:pack
git diff --check
```

## Git

Make focused commits. Use conventional commit style (`type(scope): lowercase description`, for example `fix(compiler): validate frontmatter state keys`) for commits and pull request titles. Do not rewrite shared history. See `CONTRIBUTING.md` for the pull request workflow.
