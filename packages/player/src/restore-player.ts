import type { ChoiceItem, StoryBlock, StoryDocument } from "@aftertext/compiler";
import { fromCursorPosition, INITIAL_CURSOR, type AvailableChoiceItem, type ExecutionCursor, type RuntimeState } from "@aftertext/runtime";
import { computeDocumentFingerprint } from "./document-fingerprint.js";
import { decodeCurrent, type SnapshotCurrent } from "./snapshot-current.js";
import type { PlayerState } from "./player-state.js";
import { buildDocumentIndex, hasVisitedCurrentScene, isFreshRuntimeState, validateRuntimeState } from "./snapshot-runtime-state.js";
import { isJsonValue, isPlainRecord, type JsonValue, type RestorePlayerResult } from "./snapshot-types.js";

function malformed(reason: string): RestorePlayerResult {
  return { ok: false, error: { kind: "malformedSnapshot", reason } };
}

function unresolvable(reason: string): RestorePlayerResult {
  return { ok: false, error: { kind: "unresolvablePosition", reason } };
}

function restored(state: PlayerState): RestorePlayerResult {
  return { ok: true, state };
}

/**
 * Reconstructs a live, caller-independent `PlayerState` from an opaque
 * `PlayerSnapshot`-shaped value (docs/CORE_SPEC.md Section 33.8).
 * `snapshot` is untrusted `unknown` data — every field is validated
 * before any live state is constructed, and this function never throws
 * for ordinary malformed input, including input designed to throw while
 * merely being *inspected*: a plain object with a throwing getter on
 * `formatVersion`/etc., or a `Proxy` whose `get`/`getPrototypeOf` trap
 * throws, would otherwise propagate an exception out of this public
 * boundary the first time a validator reads one of its properties. The
 * single `try`/`catch` here — around the entire validation pipeline,
 * not scattered per call site — is the one place that guarantee needs
 * enforcing, since every validator below already assumes ordinary
 * property access never throws.
 *
 * Validation proceeds in the merged spec's own locked numbered order:
 * top-level shape -> formatVersion -> documentFingerprint -> runtimeState
 * -> position/current JSON-compatibility -> structural position
 * resolution (including Runtime's own exposure-flag/ReaderState
 * consistency check) -> current-descriptor re-derivation. Only this last
 * step produces `unresolvablePosition`; every earlier failure — including
 * a structural position that fails to resolve at all — is
 * `malformedSnapshot` (Section 33.8's own step 6 vs. step 7 boundary).
 */
export function restorePlayer(document: StoryDocument, snapshot: unknown): RestorePlayerResult {
  try {
    return restorePlayerUnchecked(document, snapshot);
  } catch (error) {
    return malformed(`snapshot could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function restorePlayerUnchecked(document: StoryDocument, snapshot: unknown): RestorePlayerResult {
  if (!isPlainRecord(snapshot)) return malformed("snapshot is not a plain object.");

  if (snapshot.formatVersion !== 1) {
    return { ok: false, error: { kind: "unsupportedFormatVersion" } };
  }

  if (typeof snapshot.documentFingerprint !== "string") {
    return malformed("documentFingerprint is not a string.");
  }
  if (snapshot.documentFingerprint !== computeDocumentFingerprint(document)) {
    return { ok: false, error: { kind: "documentMismatch" } };
  }

  const index = buildDocumentIndex(document);
  const runtimeStateResult = validateRuntimeState(index, snapshot.runtimeState);
  if (!runtimeStateResult.ok) return malformed(runtimeStateResult.reason);
  const runtimeState = runtimeStateResult.value;

  if (!isJsonValue(snapshot.position) || !isJsonValue(snapshot.current)) {
    return malformed("position/current are not JSON-compatible.");
  }

  const current = decodeCurrent(snapshot.current);
  if (!current) return malformed("current descriptor is malformed.");

  return restoreForCurrent(document, index, runtimeState, current, snapshot.position);
}

function restoreForCurrent(
  document: StoryDocument,
  index: ReturnType<typeof buildDocumentIndex>,
  runtimeState: RuntimeState,
  current: SnapshotCurrent,
  position: JsonValue
): RestorePlayerResult {
  if (current.type === "notStarted") return restoreNotStarted(document, runtimeState);
  if (current.type === "navigation") return restoreNavigation(index, runtimeState, current);
  if (current.type === "completed") return restoreCompleted(runtimeState);
  return restoreStructural(document, runtimeState, current, position);
}

function restoreNotStarted(document: StoryDocument, runtimeState: RuntimeState): RestorePlayerResult {
  if (!isFreshRuntimeState(document, runtimeState)) {
    return malformed("not-started runtimeState does not match createPlayer's own output.");
  }
  return restored({ runtimeState, cursor: INITIAL_CURSOR, current: null });
}

function restoreNavigation(
  index: ReturnType<typeof buildDocumentIndex>,
  runtimeState: RuntimeState,
  current: Extract<SnapshotCurrent, { readonly type: "navigation" }>
): RestorePlayerResult {
  if (current.to !== runtimeState.navigation.sceneId) {
    return malformed("navigation.to does not match runtimeState.navigation.sceneId.");
  }
  if (!index.sceneIds.has(current.from)) {
    return malformed(`navigation.from "${current.from}" does not exist.`);
  }
  return restored({ runtimeState, cursor: INITIAL_CURSOR, current: { type: "navigation", from: current.from, to: current.to } });
}

function restoreCompleted(runtimeState: RuntimeState): RestorePlayerResult {
  if (!hasVisitedCurrentScene(runtimeState)) {
    return malformed("completed runtimeState is missing the current scene's visit entry.");
  }
  return restored({ runtimeState, cursor: INITIAL_CURSOR, current: { type: "completed" } });
}

/**
 * Handles every kind with a real structural position
 * (content/dialogue/presentation/choice/error). Calls Runtime's own
 * `fromCursorPosition` — any resolution failure there, including its own
 * internal exposure-flag/ReaderState consistency check, is
 * `malformedSnapshot`, not `unresolvablePosition` (Section 33.8 step 6).
 */
function restoreStructural(
  document: StoryDocument,
  runtimeState: RuntimeState,
  current: Exclude<SnapshotCurrent, { readonly type: "notStarted" | "navigation" | "completed" }>,
  position: JsonValue
): RestorePlayerResult {
  const decoded = fromCursorPosition(document, runtimeState, position, current.type);
  if (!decoded.ok) return malformed(decoded.reason);

  return reconstructResult(runtimeState, decoded.cursor, decoded.resolvedBlock, current);
}

function reconstructResult(
  runtimeState: RuntimeState,
  cursor: ExecutionCursor,
  resolvedBlock: StoryBlock | undefined,
  current: Exclude<SnapshotCurrent, { readonly type: "notStarted" | "navigation" | "completed" }>
): RestorePlayerResult {
  if (current.type === "content") return reconstructContent(runtimeState, cursor, resolvedBlock);
  if (current.type === "dialogue") return reconstructDialogue(runtimeState, cursor, resolvedBlock);
  if (current.type === "presentation") return reconstructPresentation(runtimeState, cursor, resolvedBlock);
  if (current.type === "choice") return reconstructChoice(runtimeState, cursor, resolvedBlock, current.items);
  return reconstructError(runtimeState, cursor, current);
}

/** Only this re-derivation step — matching the resolved block's type to the suspension kind — produces `unresolvablePosition` (Section 33.8 step 7). */
function reconstructContent(runtimeState: RuntimeState, cursor: ExecutionCursor, resolvedBlock: StoryBlock | undefined): RestorePlayerResult {
  if (resolvedBlock?.type !== "Paragraph" && resolvedBlock?.type !== "Heading") {
    return unresolvable("resolved block is not a Paragraph or Heading.");
  }
  return restored({ runtimeState, cursor, current: { type: "content", block: resolvedBlock } });
}

function reconstructDialogue(runtimeState: RuntimeState, cursor: ExecutionCursor, resolvedBlock: StoryBlock | undefined): RestorePlayerResult {
  if (resolvedBlock?.type !== "Dialogue") return unresolvable("resolved block is not a Dialogue.");
  return restored({
    runtimeState,
    cursor,
    current: { type: "dialogue", speaker: resolvedBlock.speaker, content: resolvedBlock.content }
  });
}

function reconstructPresentation(runtimeState: RuntimeState, cursor: ExecutionCursor, resolvedBlock: StoryBlock | undefined): RestorePlayerResult {
  if (resolvedBlock?.type !== "Presentation") return unresolvable("resolved block is not a Presentation.");
  return restored({ runtimeState, cursor, current: { type: "presentation", command: resolvedBlock.command } });
}

function reconstructError(
  runtimeState: RuntimeState,
  cursor: ExecutionCursor,
  current: Extract<SnapshotCurrent, { readonly type: "error" }>
): RestorePlayerResult {
  return restored({ runtimeState, cursor, current: { type: "error", error: { kind: current.kind, message: current.message } } });
}

/**
 * Dynamic-programming validation of the persisted offered Choice items
 * against the resolved `ChoiceNode`'s own authored items (docs/CORE_SPEC.md
 * Section 33.8): `reachable[j]` means an authored prefix can have produced
 * exactly the persisted prefix `persisted[0..j)` while including every
 * processed unconditional authored item. A plain greedy left-to-right
 * match is NOT sufficient — it mismatches when a duplicate conditioned
 * item precedes a duplicate unconditional item with the same text/target
 * and only one persisted occurrence exists. Never evaluates any
 * `condition` expression.
 */
function choiceItemsAreValidSubsequence(
  authored: readonly ChoiceItem[],
  persisted: readonly { readonly text: string; readonly target: string }[]
): boolean {
  const m = persisted.length;
  let reachable = new Array<boolean>(m + 1).fill(false);
  reachable[0] = true;

  for (const item of authored) {
    const next = new Array<boolean>(m + 1).fill(false);
    for (let j = 0; j <= m; j++) {
      if (!reachable[j]) continue;
      if (item.condition) next[j] = true;
      if (j < m && item.text === persisted[j]!.text && item.target === persisted[j]!.target) next[j + 1] = true;
    }
    reachable = next;
  }

  return reachable[m] === true;
}

function reconstructChoice(
  runtimeState: RuntimeState,
  cursor: ExecutionCursor,
  resolvedBlock: StoryBlock | undefined,
  persisted: readonly { readonly text: string; readonly target: string }[]
): RestorePlayerResult {
  if (resolvedBlock?.type !== "Choice") return unresolvable("resolved block is not a Choice.");
  if (persisted.length === 0) return unresolvable("persisted choice items are empty.");
  if (!choiceItemsAreValidSubsequence(resolvedBlock.items, persisted)) {
    return unresolvable("persisted choice items are not a valid subsequence of the authored Choice.");
  }

  const items: AvailableChoiceItem[] = persisted.map((item, itemIndex) => ({ index: itemIndex, text: item.text, target: item.target }));
  return restored({ runtimeState, cursor, current: { type: "choice", items } });
}
