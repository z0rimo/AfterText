import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { compile } from "@aftertext/compiler";
import { AfterTextPlayer } from "../src/index.js";
import sampleSource from "./sample.at?raw";
import stoneRoomUrl from "./assets/stone-room.svg";
import hallwayUrl from "./assets/hallway.svg";
import brassKeyUrl from "./assets/brass-key.svg";
import "./demo.css";

// Compiling AfterText source belongs to this demo application, never to
// the reusable <AfterTextPlayer> component itself (docs/CORE_SPEC.md
// Section 19.3/19.22).
const result = compile(sampleSource);

// Tiny (a few KB), demo-only, embedded WAV fixtures for manual Music/Sfx
// playback verification (docs/CORE_SPEC.md Section 23.33) — no binary
// audio asset is added to the repository; these are plain text `data:
// audio/wav` string constants, kept out of the published package output
// exactly like the rest of demo/. Silent-ish low tones only, not intended
// to be pleasant — just real, valid, audible-if-you-listen-closely audio.
const HALLWAY_THEME_WAV =
  "data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUAGAACAh46UmZ6ipaeoqKajn5qVj4iBenRtZ2JeW1lYWFpcYGVqcHd9hIuSmJ2hpKeoqKekoZyXkYuEfXZwamRgXFpYWFlbX2NobnR7gomPlZugo6aoqKelop6Zk42Gf3lybGZhXVpZWFlaXWFmbHJ5f4aNk5meoqWnqKimo6CblY+Jgnt0bmhjX1tZWFhaXGBkanB2fYSLkZecoaSnqKinpKGdmJKLhH13cGplYFxaWFhZW15iZ210eoGIj5Wan6OmqKinpaKemZSOh4B5cmxnYl5bWVhYWl1hZmtxeH+GjJOZnqKlp6iopqSgm5aQiYN8dW5oY19cWVhYWVxfZGlvdXyDipCWnKCkpqiop6WhnZiSjIV+d3FrZWBdWlhYWVteYmdtc3qBh46Ump+jpqeop6ajn5qUjoeBenNtZ2JeW1lYWFpdYGVrcXd+hYySmJ2hpaeoqKakoJyWkIqDfHVvaWRfXFlYWFlcX2NobnV8g4mQlpugpKaoqKelop6Zk4yGf3hxa2ZhXVpYWFlbXmJnbHJ5gIeOlJmeoqWnqKimo5+alY+IgXp0bWdiXltZWFhaXGBlanB3fYSLkpidoaSnqKinpKGcl5GLhH12cGpkYFxaWFhZW19jaG50e4KJj5WboKOmqKinpaKemZONhn95cmxmYV1aWVhZWl1hZmxyeX+GjZOZnqKlp6iopqOgm5WPiYJ7dG5oY19bWVhYWlxgZGpwdn2Ei5GXnKGkp6iop6ShnZiSi4R9d3BqZWBcWlhYWVteYmdtdHqBiI+Vmp+jpqiop6WinpmUjoeAeXJsZ2JeW1lYWFpdYWZrcXh/hoyTmZ6ipaeoqKakoJuWkImDfHVuaGNfXFlYWFlcX2Rpb3V8g4qQlpygpKaoqKeloZ2YkoyFfndxa2VgXVpYWFlbXmJnbXN6gYeOlJqfo6anqKemo5+alI6HgXpzbWdiXltZWFhaXWBla3F3foWMkpidoaWnqKimpKCclpCKg3x1b2lkX1xZWFhZXF9jaG51fIOJkJaboKSmqKinpaKemZOMhn94cWtmYV1aWFhZW15iZ2xyeYCHjpSZnqKlp6iopqOfmpWPiIF6dG1nYl5bWVhYWlxgZWpwd32Ei5KYnaGkp6iop6ShnJeRi4R9dnBqZGBcWlhYWVtfY2hudHuCiY+Vm6Cjpqiop6WinpmTjYZ/eXJsZmFdWllYWVpdYWZscnl/ho2TmZ6ipaeoqKajoJuVj4mCe3RuaGNfW1lYWFpcYGRqcHZ9hIuRl5yhpKeoqKekoZ2YkouEfXdwamVgXFpYWFlbXmJnbXR6gYiPlZqfo6aoqKelop6ZlI6HgHlybGdiXltZWFhaXWFma3F4f4aMk5meoqWnqKimpKCblpCJg3x1bmhjX1xZWFhZXF9kaW91fIOKkJacoKSmqKinpaGdmJKMhX53cWtlYF1aWFhZW15iZ21zeoGHjpSan6Omp6inpqOfmpSOh4F6c21nYl5bWVhYWl1gZWtxd36FjJKYnaGlp6iopqSgnJaQioN8dW9pZF9cWVhYWVxfY2hudXyDiZCWm6Ckpqiop6WinpmTjIZ/eHFrZmFdWlhYWVteYmdscnmAh46UmZ6ipaeoqKajn5qVj4iBenRtZ2JeW1lYWFpcYGVqcHd9hIuSmJ2hpKeoqKekoZyXkYuEfXZwamRgXFpYWFlbX2NobnR7gomPlZugo6aoqKelop6Zk42Gf3lybGZhXVpZWFlaXWFmbHJ5f4aNk5meoqWnqKimo6CblY+Jgnt0bmhjX1tZWFhaXGBkanB2fYSLkZecoaSnqKinpKGdmJKLhH13cGplYFxaWFhZW15iZ210eoGIj5Wan6OmqKinpaKemZSOh4B5cmxnYl5bWVhYWl1hZmtxeH+GjJOZnqKlp6iopqSgm5aQiYN8dW5oY19cWVhYWVxfZGlvdXyDipCWnKCkpqiop6WhnZiSjIV+d3FrZWBdWlhYWVteYmdtc3qBh46Ump+jpqeop6ajn5qUjoeBenNtZ2JeW1lYWFpdYGVrcXd+hYySmJ2hpaeoqKakoJyWkIqDfHVvaWRfXFlYWFlcX2NobnV8g4mQlpugpKaoqKelop6Zk4yGf3hxa2ZhXVpYWFlbXmJnbHJ5";
const KEY_PICKUP_WAV =
  "data:audio/wav;base64,UklGRmQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUABAACAmaejj3ReWGV9mKekkXZgWGN7laalk3lhWGF5k6WmlXtjWGB2kaSnmH1lWF50j6OnmYBnWV1xjKKom4NoWVxviqConYVrWltth5+on4dtW1prhZ2ooIpvXFlog5uoooxxXVlngJmno490XlhlfZinpJF2YFhje5WmpZN5YVhheZOlppV7Y1hgdpGkp5h9ZVhedI+jp5mAZ1ldcYyiqJuDaFlcb4qgqJ2Fa1pbbYefqJ+HbVtaa4WdqKCKb1xZaIObqKKMcV1ZZ4CZp6OPdF5YZX2Yp6SRdmBYY3uVpqWTeWFYYXmTpaaVe2NYYHaRpKeYfWVYXnSPo6eZgGdZXXGMoqibg2hZXG+KoKidhWtaW22Hn6ifh21bWmuFnaigim9cWWiDm6iijHFdWWeAmaejj3ReWGV9mKekkXZgWGN7lQ==";

// Mapping opaque story `@background`/`@layer`/`@music`/`@sfx` references
// to real, Vite-resolved/embedded asset URLs is a demo-application
// concern (docs/CORE_SPEC.md Section 20.11/20.26/23.20) — the reusable
// <AfterTextPlayer> component itself never becomes Vite-aware.
const assets: Record<string, string> = {
  "stone-room.svg": stoneRoomUrl,
  "hallway.svg": hallwayUrl,
  "brass-key.svg": brassKeyUrl,
  "hallway-theme.mp3": HALLWAY_THEME_WAV,
  "key-pickup.wav": KEY_PICKUP_WAV
};

function resolveAsset(ref: string): string | null {
  return assets[ref] ?? null;
}

const root = document.getElementById("root");
if (!root) throw new Error("expected a #root element in demo/index.html");

createRoot(root).render(
  <StrictMode>
    {result.hasErrors ? (
      <pre className="demo-compile-errors">{JSON.stringify(result.diagnostics, null, 2)}</pre>
    ) : (
      <main className="demo-viewport">
        <AfterTextPlayer document={result.document} resolveAsset={resolveAsset} />
      </main>
    )}
  </StrictMode>
);
