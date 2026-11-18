# `@aftertext/web-renderer`

A React renderer for playing a compiled AfterText `StoryDocument` in the
browser.

> v0.4.0: the public API and presentation feature set are early and
> may change.

## Install

```sh
npm install @aftertext/web-renderer @aftertext/compiler react react-dom
```

React 18 and 19 are supported peer ranges.

## Usage

```tsx
import { compile } from "@aftertext/compiler";
import { AfterTextPlayer } from "@aftertext/web-renderer";

const { document } = compile("@scene start\n\nHello.\n");

export function Story() {
  return (
    <AfterTextPlayer
      document={document}
      resolveAsset={(ref) => `/assets/${ref}`}
    />
  );
}
```

The renderer owns presentation only. Compilation and diagnostics remain the
host application's responsibility.

## Save and restore

`AfterTextPlayer` is ref-capable: pass a ref typed as `AfterTextPlayerHandle`
to get `getSnapshot()`/`restoreSnapshot()`.

```tsx
import { useRef } from "react";
import { AfterTextPlayer, type AfterTextPlayerHandle } from "@aftertext/web-renderer";

export function Story() {
  const ref = useRef<AfterTextPlayerHandle>(null);

  return (
    <AfterTextPlayer
      ref={ref}
      document={document}
      resolveAsset={(asset) => `/assets/${asset}`}
    />
  );
}
```

```ts
const snapshot = ref.current?.getSnapshot();
// snapshot is a plain, JSON-compatible AfterTextPlayerSnapshot — store it
// wherever the host chooses, e.g. JSON.stringify(snapshot).

const result = ref.current?.restoreSnapshot(parsedSnapshot);
if (result && !result.ok) {
  console.error(result.error);
}
```

- An `AfterTextPlayerSnapshot` combines a Player snapshot (narrative
  position) with a Presentation snapshot (background, layer, camera,
  music, sprites). Both are plain, JSON-compatible data.
- `restoreSnapshot` accepts `snapshot: unknown` and is synchronous; it
  validates its input and never throws — an ordinary malformed or
  mismatched snapshot comes back as `{ ok: false, error }`, not an
  exception.
- Timers, audio playback objects, and focus refs are not persisted:
  restoring a snapshot re-establishes the described Presentation state
  from scratch rather than resuming elapsed timer time or audio playback
  position.
- As with `@aftertext/player`, storage is entirely host-owned, and
  `formatVersion` is validated but does not guarantee compatibility with
  snapshots taken by a different package version.

**Compatibility note:** in v0.4.0, `AfterTextPlayer` is implemented with
`React.forwardRef` so the same ref-capable API works on both React 18 and
19. Ordinary `<AfterTextPlayer ... />` JSX usage is unaffected. Calling
`AfterTextPlayer(props)` directly as a function is not supported.

## Demo

```sh
cd packages/web-renderer
npm run dev
```

Opens a local Vite dev server running a small sample story that exercises
every implemented Presentation feature — Background, Layer, Camera, Music,
Sfx, Pause, Choice, Sprite Stage, and Dialogue — through the real compiler and
`AfterTextPlayer`.

## License

MIT
