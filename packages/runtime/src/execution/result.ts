import type { HeadingNode, ParagraphNode, PresentationCommand } from "@aftertext/compiler";
import type { RuntimeState } from "../state/runtime-state.js";
import type { ExecutionCursor } from "./cursor.js";
import type { RuntimeExecutionError } from "./errors.js";

/**
 * One item offered by a Choice suspension. `index` is a transient
 * request/response correlator scoped to that one suspension — never a
 * stable identity, never persisted (docs/CORE_SPEC.md Section 17.7).
 */
export interface AvailableChoiceItem {
  readonly index: number;
  readonly text: string;
  readonly target: string;
}

export interface ContentResult {
  readonly type: "content";
  readonly block: ParagraphNode | HeadingNode;
}

export interface PresentationResult {
  readonly type: "presentation";
  readonly command: PresentationCommand;
}

export interface ChoiceResult {
  readonly type: "choice";
  readonly items: readonly AvailableChoiceItem[];
}

export interface NavigationResult {
  readonly type: "navigation";
  readonly from: string;
  readonly to: string;
}

export interface CompletedResult {
  readonly type: "completed";
}

export interface ErrorResult {
  readonly type: "error";
  readonly error: RuntimeExecutionError;
}

/**
 * Exhaustive suspension/terminal outcomes of one `advance`/`selectChoice`
 * call. Runtime errors are their own variant (`ErrorResult`) — always
 * distinguishable from a valid suspension via `result.type`.
 */
export type ExecutionResult =
  | ContentResult
  | PresentationResult
  | ChoiceResult
  | NavigationResult
  | CompletedResult
  | ErrorResult;

export interface ExecutionStep {
  readonly runtimeState: RuntimeState;
  readonly cursor: ExecutionCursor;
  readonly result: ExecutionResult;
}
