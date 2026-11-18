import type { StoryDocument } from "@aftertext/compiler";
import { advancePlayer, createPlayer, restorePlayer, selectPlayerChoice, snapshotPlayer } from "@aftertext/player";
import type { PlayerState } from "@aftertext/player";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactElement, type ReactNode, type Ref } from "react";
import { ChoiceView } from "./choice-view.js";
import { CompletedView } from "./completed-view.js";
import { ContentView } from "./content-view.js";
import { DialogueView } from "./dialogue-view.js";
import { ErrorView } from "./error-view.js";
import { PresentationView } from "./presentation-view.js";
import { PresentationSurface } from "./presentation-surface.js";
import { acceptPlayerState, INITIAL_PRESENTATION_STATE, type PresentationState } from "./presentation-state.js";
import { presentationStateMatchesCommand, restorePresentation, snapshotPresentation } from "./presentation-snapshot.js";
import { isPlainRecord, type AfterTextPlayerHandle, type AfterTextPlayerRestoreResult, type AfterTextPlayerSnapshot } from "./snapshot-types.js";
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
   * Resolves an opaque `@background`/`@layer`/`@music`/`@sfx`/`@sprite`
   * story reference to a browser-loadable URL (docs/CORE_SPEC.md Section
   * 20.11, 23.20, 31.13). Synchronous and deterministic — a
   * resource-resolution boundary, not an event callback. Defaults to
   * identity (the reference is used as-is), so a story already using real
   * browser paths/URLs works unconfigured. `kind` widened to include
   * `"music"`/`"sfx"` as of Section 23, and `"sprite"` as of Section 31 —
   * each a real, additive type change (Section 23.20, 31.13): a consumer
   * with a separately declared, explicitly narrow `kind` parameter type,
   * or one doing exhaustive `kind` switching, may require an update.
   */
  readonly resolveAsset?: (
    ref: string,
    kind: "background" | "layer" | "music" | "sfx" | "sprite"
  ) => string | null;
}

interface RendererSession {
  readonly activeDocument: StoryDocument;
  readonly player: PlayerState;
  readonly presentation: PresentationState;
  readonly timedGate: TimedPresentationGate;
  /**
   * Bumped only by a successful `restoreSnapshot` (docs/CORE_SPEC.md
   * Section 33.13); otherwise preserved unchanged by ordinary
   * advance/select and reset to `0` by Restart's own fresh
   * `createSession`. A restore can target the same document and the same
   * logical timed suspension already displayed; including this in the
   * timed/focus effects' dependency arrays guarantees a fresh timer and a
   * fresh focus opportunity on every successful restore without relying
   * on `currentTimed`/`currentResult` happening to be a new object
   * reference. Ephemeral renderer state only — never persisted, never
   * exposed publicly.
   */
  readonly restoreGeneration: number;
}

function createSession(document: StoryDocument): RendererSession {
  return {
    activeDocument: document,
    player: createPlayer(document),
    presentation: INITIAL_PRESENTATION_STATE,
    timedGate: INITIAL_TIMED_GATE,
    restoreGeneration: 0
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
 * mutates StoryState, or touches Reader Memory itself. Ref-capable via
 * `forwardRef`/`useImperativeHandle` (docs/CORE_SPEC.md Section 33.11):
 * `forwardRef` is required, not a stylistic choice, because React 19's
 * ref-as-a-plain-prop convention does not work on React 18, which this
 * package's peer range still supports. This is a real, narrow, accepted
 * exception to additivity (Section 33.11, 33.18) — `AfterTextPlayer`'s
 * own exported shape changes from an ordinary function to a
 * `ForwardRefExoticComponent`; ordinary JSX usage without a ref (
 * `<AfterTextPlayer ... />`) is unaffected.
 */
export const AfterTextPlayer = forwardRef<AfterTextPlayerHandle, AfterTextPlayerProps>(function AfterTextPlayer(
  { document: storyDocument, resolveAsset = identityResolveAsset },
  ref
): ReactElement {
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
  // Keyboard-focus continuity (Section 19.18). Every narrative result
  // replaces the activated button, which would strand focus on <body>. A
  // user-initiated transition (advance/select/restart — never document
  // replacement, a timer, or presentation-state change) records one pending
  // request; the effect below then moves focus to the new result's primary
  // control. Ephemeral renderer-local refs, not part of any state.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocusRef = useRef(false);

  // A new document is a new session, not a narrative step: drop any pending
  // request rather than moving focus into it.
  useEffect(() => {
    pendingFocusRef.current = false;
  }, [storyDocument]);

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
    pendingFocusRef.current = true;
    setSession({ ...session, player, presentation });
  };
  const select = (index: number): void => {
    const player = selectPlayerChoice(storyDocument, session.player, index);
    applyAudioSideEffect(player);
    const presentation = acceptPlayerState(session.presentation, player);
    pendingFocusRef.current = true;
    setSession({ ...session, player, presentation });
  };
  const restart = (): void => {
    // Cleanup only — Restart never fabricates new playback (Section
    // 23.23); if the restarted story later reaches Music/Sfx again, that
    // authored command triggers playback normally through advance/select.
    stopMusicElement(musicElementRef.current);
    stopAndClearSfx(activeSfxRef.current);
    pendingFocusRef.current = true;
    setSession(createSession(storyDocument));
  };

  // Save/Restore (docs/CORE_SPEC.md Section 33.11-33.14). `getSnapshot`
  // always composes the two independently-owned halves from
  // `session.activeDocument`/`session.player` — never the raw
  // `storyDocument` prop, which can transiently differ from the
  // committed session during a document-replacement render — so the
  // Player fingerprint and the Presentation snapshot can never
  // accidentally mix documents.
  const getSnapshot = (): AfterTextPlayerSnapshot => ({
    player: snapshotPlayer(session.activeDocument, session.player),
    presentation: snapshotPresentation(session.presentation)
  });

  // Validates both halves completely, and cross-validates them when the
  // restored `current` is itself a Presentation suspension (Section
  // 33.12), before mutating any live state — a restore either fully
  // succeeds or has no observable effect, mirroring Restart's own atomic
  // reset. On success, the restored Presentation state is installed
  // directly, never routed back through `acceptPlayerState`/
  // `applyPresentation`: that command was already applied before the
  // snapshot was taken, and reapplying it would violate no-double-
  // application (Section 33.9). `timedGate` resets to
  // `INITIAL_TIMED_GATE` and `restoreGeneration` increments so a
  // restored timed Presentation always begins fresh and locked, even
  // when it targets the same logical suspension already on screen
  // (Section 33.13, see the timed effect below). Audio cleanup mirrors
  // Restart's (Section 33.14) and runs only once every check has passed
  // — a failed restore never stops the live session's audio, changes its
  // state, or moves focus.
  const restoreSnapshot = (snapshot: unknown): AfterTextPlayerRestoreResult => {
    const playerHalf = isPlainRecord(snapshot) ? snapshot.player : undefined;
    const presentationHalf = isPlainRecord(snapshot) ? snapshot.presentation : undefined;

    const playerResult = restorePlayer(session.activeDocument, playerHalf);
    if (!playerResult.ok) {
      return { ok: false, error: { kind: "invalidPlayerSnapshot", detail: playerResult.error } };
    }

    const presentationResult = restorePresentation(presentationHalf);
    if (!presentationResult.ok) {
      return { ok: false, error: { kind: "invalidPresentationSnapshot", detail: presentationResult.error } };
    }

    const restoredCurrent = playerResult.state.current;
    if (
      restoredCurrent?.type === "presentation" &&
      !presentationStateMatchesCommand(restoredCurrent.command, presentationResult.state)
    ) {
      return {
        ok: false,
        error: {
          kind: "invalidPresentationSnapshot",
          detail: {
            kind: "malformedSnapshot",
            reason: "presentation state is inconsistent with the restored current Presentation command."
          }
        }
      };
    }

    stopMusicElement(musicElementRef.current);
    stopAndClearSfx(activeSfxRef.current);
    pendingFocusRef.current = true;
    setSession({
      activeDocument: session.activeDocument,
      player: playerResult.state,
      presentation: presentationResult.state,
      timedGate: INITIAL_TIMED_GATE,
      restoreGeneration: session.restoreGeneration + 1
    });
    return { ok: true };
  };

  // No dependency array: always rebuilds this small wrapper object so
  // `getSnapshot`/`restoreSnapshot` close over the current render's
  // `session`, never a stale one (Section 45) — cheap, since the actual
  // snapshot/restore work only runs when a host calls one of these.
  useImperativeHandle(ref, () => ({ getSnapshot, restoreSnapshot }));

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

    // `session.restoreGeneration` (in the dependency array below) is
    // included so a successful restore always starts a fresh timer and
    // cancels any stale one, even when it targets the same logical timed
    // suspension already displayed (Section 33.13, 35-36) — restoring
    // resets `timedGate` to `INITIAL_TIMED_GATE` above, and this effect
    // re-running is what actually claims it locked and schedules the new
    // wait.
    return () => wait.cancel();
  }, [currentTimed, session.restoreGeneration]);

  const timedUnlocked = isTimedPresentationUnlocked(currentTimed, session.timedGate);

  // Runs only when the narrative result changes or a timed gate opens (a
  // locked Pause/Camera has no control yet, so the request stays pending
  // until Continue appears). Focus is moved only if it is currently
  // stranded (on <body>) or still inside this renderer, so it never steals
  // focus the user has deliberately moved elsewhere.
  const currentResult = session.player.current;
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    const target = primaryRef.current;
    if (target === null) return;
    pendingFocusRef.current = false;
    const active = target.ownerDocument.activeElement;
    if (active === null || active === target.ownerDocument.body || rootRef.current?.contains(active)) {
      target.focus();
    }
    // `session.restoreGeneration` is included so a successful restore
    // always offers a fresh focus opportunity (Section 42), even when
    // the restored result is semantically identical to the one already
    // displayed.
  }, [currentResult, timedUnlocked, session.restoreGeneration]);
  const cameraTransitionMs = cameraAuthoredTransitionMs(session.player);

  return (
    <div ref={rootRef} aria-live="polite">
      <PresentationSurface
        presentation={session.presentation}
        resolveAsset={resolveAsset}
        cameraTransitionMs={cameraTransitionMs}
      >
        {renderCurrent(session.player, timedUnlocked, advance, select, restart, primaryRef)}
      </PresentationSurface>
    </div>
  );
});

function renderCurrent(
  player: PlayerState,
  timedUnlocked: boolean,
  advance: () => void,
  select: (index: number) => void,
  restart: () => void,
  primaryRef: Ref<HTMLButtonElement>
): ReactNode {
  if (player.current === null) {
    return (
      <button ref={primaryRef} type="button" onClick={advance}>
        Start
      </button>
    );
  }

  switch (player.current.type) {
    case "content":
      return (
        <div>
          <ContentView block={player.current.block} />
          <button ref={primaryRef} type="button" onClick={advance}>
            Next
          </button>
        </div>
      );

    case "presentation":
      return <PresentationView
          command={player.current.command}
          onAdvance={advance}
          timedUnlocked={timedUnlocked}
          primaryRef={primaryRef}
        />;

    case "dialogue":
      return (
        <DialogueView
          speaker={player.current.speaker}
          content={player.current.content}
          onAdvance={advance}
          primaryRef={primaryRef}
        />
      );

    case "choice":
      return <ChoiceView items={player.current.items} onSelect={select} primaryRef={primaryRef} />;

    case "navigation":
      return (
        <div>
          <p>Continuing&hellip;</p>
          <button ref={primaryRef} type="button" onClick={advance}>
            Continue
          </button>
        </div>
      );

    case "completed":
      return <CompletedView onRestart={restart} primaryRef={primaryRef} />;

    case "error":
      return <ErrorView error={player.current.error} onRestart={restart} primaryRef={primaryRef} />;
  }
}
