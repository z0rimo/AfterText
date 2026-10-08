# `@aftertext/player`

A small headless player layer that threads an active AfterText runtime session
one observable step at a time.

> v0.1 foundation: the public API is early and may change.

## Install

```sh
npm install @aftertext/player @aftertext/compiler
```

## Usage

```ts
import { compile } from "@aftertext/compiler";
import { advancePlayer, createPlayer } from "@aftertext/player";

const { document } = compile("@scene start\n\nHello.\n");
let player = createPlayer(document);
player = advancePlayer(document, player);

console.log(player.current);
```

The player delegates narrative semantics to `@aftertext/runtime`; it does not
skip content, navigation, choices, or presentation results.

## License

MIT
