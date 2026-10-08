import type { StoryDocument } from "@aftertext/compiler";
import { advancePlayer, createPlayer, selectPlayerChoice } from "@aftertext/player";
import type { PlayerState } from "@aftertext/player";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ChoiceView } from "./choice-view.js";
import { CompletedView } from "./completed-view.js";
import { ContentView } from "./content-view.js";
import { ErrorView } from "./error-view.js";
import { PresentationView } from "./presentation-view.js";
import { PresentationSurface } from "./presentation-surface.js";
import { acceptPlayerState, INITIAL_PRESENTATION_STATE, type PresentationState } from "./presentation-state.js";
import {
  getCurrentTimedPresentation,
  getTimedDurationMs,
  isTimedPresentationUnlocked,
  INITIAL_TIMED_GATE,
  waitUntilDeadline,
  type TimedPresentationGate
} from "./timed-presentation.js";
import {
  applyMusicIntent,
  applySfxIntent,
  getOrCreateMusicElement,
  stopAndClearSfx,
  stopMusicElement
} from "./audio-playback.js";

export interface AfterTextPlayerProps {
  readonly document: StoryDocument;
  /**
   * Resolves an opaque `@background`/`@layer`/`@music`/`@sfx` story
   * reference to a browser-loadable URL (docs/CORE_SPEC.md Section
   * 20.11, 23.20). Synchronous and deterministic — a resource-resolution
   * boundary, not an event callback. Defaults to identity (the reference
   * is used as-is), so a story already using real browser paths/URLs
   * works unconfigured. `kind` widened to include `"music"`/`"sfx"` as of
   * Section 23 — a real, additive type change (Section 23.20).
   */
  readonly resolveAsset?: (ref: string, kind: "background" | "layer" | "music" | "sfx") => string | null;
}

interface RendererSession {
  readonly activeDocument: StoryDocument;
  readonly player: PlayerState;
  readonly presentation: PresentationState;
  readonly timedGate: TimedPresentationGate;
}

function createSession(document: StoryDocument): RendererSession {
  return {
    activeDocument: document,
    player: createPlayer(document),
    presentation: INITIAL_PRESENTATION_STATE,
    timedGate: INITIAL_TIMED_GATE
  };
}

function cameraAuthoredTransitionMs(player: PlayerState): number {
  if (player.current?.type !== "presentation" || player.current.command.type !== "Camera") return 0;
  const { durationMs } = player.current.command;
  return durationMs !== undefined && durationMs > 0 ? durationMs : 0;
}

const identityResolveAsset: NonNullable<AfterTextPlayerProps["resolveAsset"]> = (ref) => ref;

/**
 * The reusable Web Renderer Core component (docs/CORE_SPEC.md Sections
 * 19–23). Owns one atomic `RendererSession` — `PlayerState`, the
 * renderer-only `PresentationState` (Background/Layer/camera zoom/Music
 * semantic state), and the renderer-only `TimedPresentationGate` update
 * together. `PresentationState` updates in the same state transition that
 * receives a Presentation result, so its visual/semantic effect is never
 * one paint behind its own suspension (Section 20.9); `TimedPresentationGate`
 * alone is claimed/unlocked from a narrowly scoped effect covering both
 * Pause and timed Camera, since real timing requires a genuine browser
 * side effect (Section 21.11, 22.18) — Music/Sfx never participate in it
 * (Section 23.27). Real Music/Sfx playback is initiated synchronously
 * inside the same explicit event handler that exposes the new suspension
 * — never from a post-render effect — to preserve browser user activation
 * (Section 23.17); the owned Music element and active Sfx instances are
 * ephemeral, renderer-local refs, never part of `PresentationState`
 * (Section 23.30). Every narrative transition still delegates to
 * `createPlayer`/`advancePlayer`/`selectPlayerChoice`; this component
 * never evaluates expressions, filters Choices, resolves Variants,
 * mutates StoryState, or touches Reader Memory itself.
 */
export function AfterTextPlayer({
  document: storyDocument,
  resolveAsset = identityResolveAsset
}: AfterTextPlayerProps): ReactElement {
  const [session, setSession] = useState<RendererSession>(() => createSession(storyDocument));

  if (storyDocument !== session.activeDocument) {
    setSession(createSession(storyDocument));
  }

  // Ephemeral, renderer-local audio ownership (Section 23.11, 23.15,
  // 23.30) — never part of PresentationState/PlayerState/RuntimeState.
  // Exactly one persistent Music element, lazily created; an unbounded set
  // of independent, fire-and-forget Sfx instances tracked only for
  // cleanup.
  const musicElementRef = useRef<HTMLAudioElement | null>(null);
  const activeSfxRef = useRef<Set<HTMLAudioElement>>(new Set());

  // Stops all owned audio on document replacement and on unmount (Section
  // 23.24–23.25) via ordinary effect cleanup — safe because *stopping*
  // media has no user-activation requirement (only *starting* it does,
  // Section 23.17). Keyed on the document identity itself so the previous
  // document's audio is torn down exactly when a new one takes over.
  useEffect(() => {
    return () => {
      stopMusicElement(musicElementRef.current);
      stopAndClearSfx(activeSfxRef.current);
    };
  }, [storyDocument]);

  // Applies the synchronous, click-context audio side effect for a newly
  // exposed Music/Sfx suspension (Section 23.17–23.18): called only from
  // within an explicit event handler, never from render, a setState
  // updater, or a post-render effect. Music/Sfx never mutate PlayerState/
  // RuntimeState and never trigger a further Player transition (Section
  // 23.29, 23.31).
  const applyAudioSideEffect = (player: PlayerState): void => {
    if (player.current?.type !== "presentation") return;
    const { command } = player.current;
    if (command.type === "Music") {
      applyMusicIntent(getOrCreateMusicElement(musicElementRef), command, resolveAsset);
    } else if (command.type === "Sfx") {
      applySfxIntent(command, resolveAsset, activeSfxRef.current);
    }
  };

  // Each transition is computed exactly once here (Section 23.17): the
  // resulting PlayerState is inspected synchronously for an audio side
  // effect, then the same computed result is committed — audio intent and
  // committed state always derive from the exact same transition result.
  const advance = (): void => {
    const player = advancePlayer(storyDocument, session.player);
    applyAudioSideEffect(player);
    const presentation = acceptPlayerState(session.presentation, player);
    setSession({ ...session, player, presentation });
  };
  const select = (index: number): void => {
    const player = selectPlayerChoice(storyDocument, session.player, index);
    applyAudioSideEffect(player);
    const presentation = acceptPlayerState(session.presentation, player);
    setSession({ ...session, player, presentation });
  };
  const restart = (): void => {
    // Cleanup only — Restart never fabricates new playback (Section
    // 23.23); if the restarted story later reaches Music/Sfx again, that
    // authored command triggers playback normally through advance/select.
    stopMusicElement(musicElementRef.current);
    stopAndClearSfx(activeSfxRef.current);
    setSession(createSession(storyDocument));
  };

  const currentTimed = getCurrentTimedPresentation(session.player);
  useEffect(() => {
    if (currentTimed === null) return;

    setSession((prev) =>
      getCurrentTimedPresentation(prev.player) === currentTimed
        ? { ...prev, timedGate: { suspension: currentTimed, unlocked: false } }
        : prev
    );

    const wait = waitUntilDeadline(getTimedDurationMs(currentTimed), () => {
      setSession((prev) => {
        if (
          getCurrentTimedPresentation(prev.player) !== currentTimed ||
          prev.timedGate.suspension !== currentTimed
        ) {
          return prev;
        }
        return { ...prev, timedGate: { suspension: currentTimed, unlocked: true } };
      });
    });

    return () => wait.cancel();
  }, [currentTimed]);

  const timedUnlocked = isTimedPresentationUnlocked(currentTimed, session.timedGate);
  const cameraTransitionMs = cameraAuthoredTransitionMs(session.player);

  return (
    <div aria-live="polite">
      <PresentationSurface
        presentation={session.presentation}
        resolveAsset={resolveAsset}
        cameraTransitionMs={cameraTransitionMs}
      >
        {renderCurrent(session.player, timedUnlocked, advance, select, restart)}
      </PresentationSurface>
    </div>
  );
}

function renderCurrent(
  player: PlayerState,
  timedUnlocked: boolean,
  advance: () => void,
  select: (index: number) => void,
  restart: () => void
): ReactNode {
  if (player.current === null) {
    return (
      <button type="button" onClick={advance}>
        Start
      </button>
    );
  }

  switch (player.current.type) {
    case "content":
      return (
        <div>
          <ContentView block={player.current.block} />
          <button type="button" onClick={advance}>
            Next
          </button>
        </div>
      );

    case "presentation":
      return <PresentationView command={player.current.command} onAdvance={advance} timedUnlocked={timedUnlocked} />;

    case "choice":
      return <ChoiceView items={player.current.items} onSelect={select} />;

    case "navigation":
      return (
        <div>
          <p>Continuing&hellip;</p>
          <button type="button" onClick={advance}>
            Continue
          </button>
        </div>
      );

    case "completed":
      return <CompletedView onRestart={restart} />;

    case "error":
      return <ErrorView error={player.current.error} onRestart={restart} />;
  }
}
