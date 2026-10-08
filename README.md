# AfterText

A web-native, prose-first engine and toolchain for interactive stories and visual novels.

[![npm](https://img.shields.io/npm/v/@aftertext/compiler?label=npm)](https://www.npmjs.com/package/@aftertext/compiler)
[![CI](https://github.com/z0rimo/AfterText/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/z0rimo/AfterText/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/z0rimo/AfterText)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19-339933)](CONTRIBUTING.md)

> **v0.1.1 — foundation release.** The core pipeline works end to end, but the project is early: the language, APIs, and feature set are small and will change. It is not production-ready.

You write a story as ordinary prose and add a few declarative directives (`@scene`, `@choice`, `@set`, `@background`, ...). The story is meant to stay readable as prose even without the presentation directives. AfterText compiles it into a validated, typed story document, runs it with a pure headless runtime, and can play it in the browser with a React component. Story logic is declarative: `.at` files cannot execute arbitrary JavaScript.

The format is specified in [`docs/CORE_SPEC.md`](docs/CORE_SPEC.md).

## How it fits together

```text
.at source ──▶ compiler ──▶ runtime ──▶ player ──▶ web-renderer
               parse and    pure        thin        React
               validate     execution   session     component
```

- **compiler** turns source into a typed `StoryDocument` plus diagnostics. It reports author mistakes as diagnostics instead of throwing.
- **runtime** executes a `StoryDocument` as pure step functions (state, choices, variants, navigation). It never re-parses source.
- **player** is a thin session layer over the runtime, one step per call.
- **web-renderer** shows what the player produces. It owns presentation only, not narrative semantics.

## Example

```at
---
title: The Lighthouse Key
state:
  has_key: false
---

@scene shore

You reach the shore at dusk. A lighthouse looms above you.

@choice
- Search the driftwood -> driftwood
- Climb the stairs -> door
@end

@scene driftwood

@set has_key = true

You find a rusted key among the driftwood.

@goto door

@scene door

@if has_key
The key turns. The door swings open.
@else
The door is locked tight.
@end
```

## Install

```bash
npm install @aftertext/compiler @aftertext/player
npm install @aftertext/web-renderer react react-dom   # browser rendering (React 18 or 19)
```

Requires Node.js 20.19 or newer for the toolchain.

## Quick start

**Headless** (compiler + player; `@aftertext/runtime` is used by the player):

```ts
import { readFileSync } from "node:fs";
import { compile } from "@aftertext/compiler";
import { advancePlayer, createPlayer, selectPlayerChoice } from "@aftertext/player";

const source = readFileSync("story.at", "utf8");
const { document, diagnostics, hasErrors } = compile(source);
if (hasErrors) throw new Error(diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));

let player = createPlayer(document);
for (;;) {
  player = advancePlayer(document, player); // one step per call
  const step = player.current;
  if (step === null || step.type === "completed" || step.type === "error") break;
  if (step.type === "content") {
    console.log(step.block.children.map((n) => (n.type === "Text" ? n.value : "")).join(""));
  } else if (step.type === "choice") {
    console.log(step.items.map((item) => `- ${item.text}`).join("\n"));
    player = selectPlayerChoice(document, player, 0); // pick the first choice
  }
}
```

**React:**

```tsx
import { compile } from "@aftertext/compiler";
import { AfterTextPlayer } from "@aftertext/web-renderer";

const { document } = compile(source);

export function App() {
  return <AfterTextPlayer document={document} resolveAsset={(ref) => `/assets/${ref}`} />;
}
```

`resolveAsset` maps the opaque asset references used by `@background`, `@layer`, `@music`, and `@sfx` to URLs; by default a reference is used as-is.

## What works today

- Prose / Markdown-derived content and frontmatter (`title`, `entry`, initial `state`)
- Story state with `@set`, plus conditionals (`@if` / `@elseif` / `@else`) and variants
- Scenes, `@goto`, and `@choice` (with conditional choice items)
- Presentation: `@background`, `@layer`, `@camera zoom`, `@music`, `@sfx`, `@pause`
- Headless runtime and player (pure, step-by-step)
- React web renderer
- Exact source locations (spans) in the AST, for tools that edit `.at` source

## Not yet

Not implemented, planned for later releases: dialogue / character model, multiple sprites with show/hide and positioning, visual transitions, save/load, history/backlog, auto and skip, voice, multi-file projects, and editor/tooling integrations.

## Packages

| Package | Description |
| --- | --- |
| [`@aftertext/compiler`](packages/compiler) | Parses AfterText source into a validated story AST with diagnostics |
| [`@aftertext/runtime`](packages/runtime) | Runtime state and pure execution over a compiled document |
| [`@aftertext/player`](packages/player) | Headless player core |
| [`@aftertext/web-renderer`](packages/web-renderer) | React component (`react` and `react-dom` 18 or 19 as peer dependencies) |

## Specification and contributing

- [`docs/CORE_SPEC.md`](docs/CORE_SPEC.md) — the canonical specification (language, AST, diagnostics, runtime, player, renderer). Section numbers are stable.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, commands, tests, the public API baseline, and pull request conventions.
- [`SECURITY.md`](SECURITY.md) — reporting security problems.

```bash
npm ci
npm run build
npm test
npm run typecheck
npm run verify:pack   # packs the packages and checks them from an external consumer project
```

## License

[MIT](LICENSE)
