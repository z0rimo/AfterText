import type { ReaderState } from "../state/reader-state.js";

/** How many times the reader has entered a given scene. */
export interface SceneVisitMemory {
  readonly visitCount: number;
}

/**
 * Records a visit to `sceneId`, returning a new `ReaderState` with that
 * scene's visit count incremented. Pure — `reader` is never mutated.
 */
export function recordSceneVisit(reader: ReaderState, sceneId: string): ReaderState {
  const previousCount = reader.visitedScenes[sceneId]?.visitCount ?? 0;
  return {
    ...reader,
    visitedScenes: {
      ...reader.visitedScenes,
      [sceneId]: { visitCount: previousCount + 1 }
    }
  };
}

/** Whether the reader has entered `sceneId` at least once. */
export function hasVisitedScene(reader: ReaderState, sceneId: string): boolean {
  return reader.visitedScenes[sceneId] !== undefined;
}

/** How many times the reader has entered `sceneId` (0 if never). */
export function getSceneVisitCount(reader: ReaderState, sceneId: string): number {
  return reader.visitedScenes[sceneId]?.visitCount ?? 0;
}
