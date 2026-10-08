/**
 * The reader's current reading position. Neither world state
 * (`StoryState`) nor reader memory (`ReaderState`) — a third, distinct
 * domain.
 */
export interface NavigationState {
  readonly sceneId: string;
}
