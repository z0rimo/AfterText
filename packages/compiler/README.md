# `@aftertext/compiler`

Compiles prose-first AfterText source into a validated `StoryDocument`.

> v0.1 foundation: the language and public API are early and may change.

## Install

```sh
npm install @aftertext/compiler
```

## Usage

```ts
import { compile } from "@aftertext/compiler";

const result = compile(`---
title: Example
---

@scene start

Hello.
`);

if (result.hasErrors) {
  console.error(result.diagnostics);
}

console.log(result.document);
```

The compiler returns best-effort output plus structured diagnostics. AfterText
source is declarative and cannot execute arbitrary JavaScript.

## Source-generation helpers

Two small predicates are exported from the package root for tools that
**generate or edit AfterText source** (for example a structured editor or an
importer). They are source-editing/tooling helpers, not part of the narrative
runtime, and nothing in `@aftertext/runtime`, `@aftertext/player`, or
`@aftertext/web-renderer` uses them. They have been public since `0.1.0` and
remain part of the public API.

```ts
import {
  isChoiceTargetBoundarySafe,
  isPresentationNamedArgumentValueBoundarySafe
} from "@aftertext/compiler";
```

- `isChoiceTargetBoundarySafe(value: string): boolean` — `false` if `value`
  contains separator whitespace or an unescaped `->`. Interpolated into a
  `@choice` item, such a value could be re-read by the parser as an extra `if`
  condition or as a different item/target split instead of a single
  unconditional scene target.
- `isPresentationNamedArgumentValueBoundarySafe(value: string): boolean` —
  `false` if `value` contains separator whitespace. Interpolated into a named
  presentation argument (such as `volume=…`, `to=…`, or `duration=…`), such a
  value could add or truncate a parameter.

Both checks are lexical and conservative. They are not validators: a value can
pass and still be rejected by the compiler (for example a non-numeric
`volume`), and the compiler's own diagnostics remain the source of truth.

## License

MIT
