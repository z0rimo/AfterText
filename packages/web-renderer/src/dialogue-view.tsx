import type { InlineNode } from "@aftertext/compiler";
import type { ReactNode, Ref } from "react";
import { renderInline } from "./content-view.js";

export interface DialogueViewProps {
  readonly speaker: string;
  readonly content: readonly InlineNode[];
  readonly onAdvance: () => void;
  /** Receives the Next button, Dialogue's primary control (focus policy, Section 19.18). */
  readonly primaryRef?: Ref<HTMLButtonElement>;
}

/**
 * Renders a `dialogue` result (docs/CORE_SPEC.md Section 32.24): a visible
 * speaker label, the Dialogue body reusing the exact same inline-Markdown
 * rendering as ordinary content (Section 32.25 — no second renderer, no
 * flattening to plain text), and an ordinary Next control. Narrative content
 * (`ContentView`) never shows a speaker label — that remains the one locked
 * semantic rendering difference (Section 32.24). No Sprite/Character state is
 * read or referenced here; `speaker` is rendered as opaque authored text only.
 */
export function DialogueView({ speaker, content, onAdvance, primaryRef }: DialogueViewProps): ReactNode {
  return (
    <div>
      <p>{speaker}</p>
      <p>{renderInline(content)}</p>
      <button ref={primaryRef} type="button" onClick={onAdvance}>
        Next
      </button>
    </div>
  );
}
