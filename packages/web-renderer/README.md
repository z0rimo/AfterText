# `@aftertext/web-renderer`

A React renderer for playing a compiled AfterText `StoryDocument` in the
browser.

> v0.1 foundation: the public API and presentation feature set are early and
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

## License

MIT
