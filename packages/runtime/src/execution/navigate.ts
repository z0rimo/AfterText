import type { StoryDocument } from "@aftertext/compiler";
import type { RuntimeState } from "../state/runtime-state.js";
import { INITIAL_CURSOR, type ExecutionCursor } from "./cursor.js";
import { RuntimeErrors } from "./errors.js";
import type { ExecutionStep } from "./result.js";

/**
 * Shared internal navigation operation used identically by `GotoNode`
 * handling and by a resolved Choice selection (docs/CORE_SPEC.md
 * Section 17.7: "share one navigation rule"). Not part of the public
 * barrel.
 *
 * The returned `RuntimeState` already reflects the target scene; the
 * target scene's own blocks are not walked here — execution suspends
 * immediately with a `navigation` result, and the next `advance()` begins
 * the walk. Never touches `ReaderState.visitedScenes`
 * (`navigated != experienced`).
 *
 * On an invalid target, `runtimeState`/`cursor` are echoed back exactly as
 * given — execution is progressive, not transactional (17.11): any
 * automatic work already completed earlier in the same call is preserved
 * in what the caller passes in here.
 */
export function navigateTo(
  document: StoryDocument,
  runtimeState: RuntimeState,
  cursor: ExecutionCursor,
  target: string
): ExecutionStep {
  const targetScene = document.scenes.find((scene) => scene.id === target);
  if (!targetScene) {
    return { runtimeState, cursor, result: { type: "error", error: RuntimeErrors.invalidSceneTarget(target) } };
  }

  const from = runtimeState.navigation.sceneId;
  return {
    runtimeState: { ...runtimeState, navigation: { sceneId: target } },
    cursor: INITIAL_CURSOR,
    result: { type: "navigation", from, to: target }
  };
}
