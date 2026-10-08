# AfterText

AfterText is a web-native, prose-first engine/toolchain for interactive stories and visual novels.

> **Status: v0.1 foundation.** The core pipeline works end to end, but the project is early: the language, APIs, and feature set are small and will change. It is not a production-ready engine.

## What is AfterText?

You write a story as ordinary prose with a few directives (`@scene`, `@choice`, `@background`, ...). AfterText compiles it into a validated story document, runs it through a headless runtime, and can play it in the browser with a React component.

Story logic is declarative. `.at` files cannot execute arbitrary JavaScript.

## Example

```at
---
title: Example
state:
  has_key: false
---

@scene start

@background room.jpg
@music theme.mp3

You wake up in an unfamiliar room.

@choice
- Open the door -> hallway
- Stay here -> wait
@end

@scene hallway

The hallway is empty.

@scene wait

You wait. Nothing happens.
```

```ts
import { compile } from "@aftertext/compiler";
import { createPlayer, advancePlayer } from "@aftertext/player";

const { document, diagnostics, hasErrors } = compile(source);
let player = createPlayer(document);
player = advancePlayer(document, player); // one step per call
```

In React, pass the compiled document to the renderer:

```tsx
import { AfterTextPlayer } from "@aftertext/web-renderer";

<AfterTextPlayer document={document} resolveAsset={(ref) => `/assets/${ref}`} />
```

## Install

```bash
npm install @aftertext/compiler @aftertext/runtime @aftertext/player
npm install @aftertext/web-renderer react react-dom   # browser rendering (React 18 or 19)
```

Requires Node.js 20.19 or newer for the toolchain.

## Current capabilities

- Prose / Markdown-derived content and frontmatter (`title`, `entry`, initial `state`)
- Story state with `@set`
- `Conditional` (`@if`/`@elseif`/`@else`) and `Variant` content
- `@scene`, `@goto`, `@choice`
- Presentation: `@background`, `@layer`, `@camera zoom`, `@music`, `@sfx`, `@pause`
- Headless runtime and player (pure, step-by-step)
- React web renderer
- Source-location metadata (exact spans) in the AST for source-editing tools

Anything not listed above is not supported yet. In particular, not implemented yet: multiple sprites and show/hide, character positioning, dialogue, image transitions, save/load, history, auto/skip, voice, and multi-file projects.

## Architecture

```text
.at source
   |  @aftertext/compiler      parse + validate -> StoryDocument + diagnostics
   v
StoryDocument
   |  @aftertext/runtime       pure execution: state, choices, variants, navigation
   v
   |  @aftertext/player        thin headless session layer over the runtime
   v
   |  @aftertext/web-renderer  React component; presentation only
```

The runtime never re-parses source, and the renderer implements no narrative semantics.

## Packages

| Package | Description |
| --- | --- |
| `@aftertext/compiler` | Parses AfterText source into a validated story AST with diagnostics |
| `@aftertext/runtime` | Runtime state and pure execution over a compiled document |
| `@aftertext/player` | Headless player core |
| `@aftertext/web-renderer` | React component (`react` and `react-dom` 18 or 19 as peer dependencies) |

## Development

Requires Node.js 20.19 or newer.

```bash
npm ci
npm run build
npm test
npm run typecheck
npm run verify:pack   # packs the packages and checks them from an external consumer project
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The specification is [`docs/CORE_SPEC.md`](docs/CORE_SPEC.md). Security reports: [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE)
