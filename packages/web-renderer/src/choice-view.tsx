import type { AvailableChoiceItem } from "@aftertext/player";
import type { ReactNode } from "react";

export interface ChoiceViewProps {
  readonly items: readonly AvailableChoiceItem[];
  readonly onSelect: (index: number) => void;
}

/**
 * Renders exactly the available Choice items Player/Runtime already
 * supplied (docs/CORE_SPEC.md Section 19.11) — no re-filtering,
 * reindexing, condition re-evaluation, or source-AST inspection. Each
 * item's own `index` (a compacted, positional correlator scoped to this
 * one suspension) is used verbatim for selection.
 */
export function ChoiceView({ items, onSelect }: ChoiceViewProps): ReactNode {
  return (
    <div role="group" aria-label="Choices">
      {items.map((item) => (
        <button key={item.index} type="button" onClick={() => onSelect(item.index)}>
          {item.text}
        </button>
      ))}
    </div>
  );
}
