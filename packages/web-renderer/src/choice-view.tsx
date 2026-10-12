import type { AvailableChoiceItem } from "@aftertext/player";
import type { ReactNode, Ref } from "react";

export interface ChoiceViewProps {
  readonly items: readonly AvailableChoiceItem[];
  readonly onSelect: (index: number) => void;
  /** Receives the first item's button, the Choice's primary control (focus policy, Section 19.18). */
  readonly primaryRef?: Ref<HTMLButtonElement>;
}

/**
 * Renders exactly the available Choice items Player/Runtime already
 * supplied (docs/CORE_SPEC.md Section 19.11) — no re-filtering,
 * reindexing, condition re-evaluation, or source-AST inspection. Each
 * item's own `index` (a compacted, positional correlator scoped to this
 * one suspension) is used verbatim for selection.
 */
export function ChoiceView({ items, onSelect, primaryRef }: ChoiceViewProps): ReactNode {
  return (
    <div role="group" aria-label="Choices">
      {items.map((item, position) => (
        <button
          key={item.index}
          ref={position === 0 ? primaryRef : undefined}
          type="button"
          onClick={() => onSelect(item.index)}
        >
          {item.text}
        </button>
      ))}
    </div>
  );
}
