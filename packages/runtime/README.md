# `@aftertext/runtime`

Pure narrative execution for compiled AfterText `StoryDocument` values,
including story state, reader memory, choices, variants, and navigation.

> v0.1 foundation: the public API is early and may change.

## Install

```sh
npm install @aftertext/runtime @aftertext/compiler
```

## Usage

```ts
import { compile } from "@aftertext/compiler";
import { advance, createRuntimeState, INITIAL_CURSOR } from "@aftertext/runtime";

const { document } = compile("@scene start\n\nHello.\n");
const state = createRuntimeState(document);
const step = advance(document, state, INITIAL_CURSOR);

console.log(step.result);
```

Runtime transitions are synchronous and non-mutating. The runtime consumes the
compiler-owned AST and does not parse AfterText source.

## License

MIT
