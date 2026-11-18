// Public API surface for the Web Renderer Core (docs/CORE_SPEC.md
// Section 19, 33.10-33.11). No internal result-view components, no
// internal `PresentationState`/`snapshotPresentation`/`restorePresentation`/
// `RendererSession`, no broad re-export of @aftertext/compiler/runtime/player.

export type { AfterTextPlayerProps } from "./after-text-player.js";
export { AfterTextPlayer } from "./after-text-player.js";

export type {
  AfterTextPlayerHandle,
  AfterTextPlayerRestoreError,
  AfterTextPlayerRestoreResult,
  AfterTextPlayerSnapshot,
  PresentationRestoreError,
  PresentationSnapshot
} from "./snapshot-types.js";
