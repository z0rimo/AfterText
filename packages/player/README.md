# `@aftertext/player`

A small headless player layer that threads an active AfterText runtime session
one observable step at a time.

> v0.4.0: the public API is early and may change.

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

## Save and restore

`snapshotPlayer` creates a JSON-compatible `PlayerSnapshot` of a `PlayerState`;
`restorePlayer` validates and reconstructs one. Both are pure and synchronous.

```ts
import { restorePlayer, snapshotPlayer } from "@aftertext/player";

const snapshot = snapshotPlayer(document, player);
const serialized = JSON.stringify(snapshot);

const result = restorePlayer(document, JSON.parse(serialized));
if (result.ok) {
  player = result.state;
} else {
  console.error(result.error);
}
```

- `snapshotPlayer` produces a plain `PlayerSnapshot`; `JSON.stringify`/
  `JSON.parse` round-trip it directly, with no AfterText-specific encoding
  step.
- `restorePlayer` accepts `snapshot: unknown` — it validates its input and
  never throws, returning `{ ok: false, error }` for any malformed or
  invalid input instead (errors-as-data, not exceptions).
- A snapshot taken against one document is rejected (`documentMismatch`) if
  restored against a different, semantically changed document.
- Storage is entirely host-owned: this package has no save slots, no
  storage backend, and no autosave. Where the serialized value lives is
  the host's decision.
- A `PlayerSnapshot`'s `position`/`current` fields are public but opaque —
  store and restore them verbatim; do not depend on their internal shape,
  which is not guaranteed to stay the same across future package versions.
- `formatVersion` is used to validate a snapshot's shape, but this package
  makes no promise that a snapshot taken by one version will restore
  correctly on a later version.

## License

MIT
