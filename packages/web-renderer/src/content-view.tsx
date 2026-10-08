import type { HeadingNode, InlineNode, ParagraphNode } from "@aftertext/compiler";
import { Fragment, type ReactNode } from "react";
import { isSafeLinkUrl } from "./link-safety.js";

function renderInline(nodes: readonly InlineNode[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "Text":
        return <Fragment key={index}>{node.value}</Fragment>;
      case "Emphasis":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "Strong":
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case "InlineCode":
        return <code key={index}>{node.value}</code>;
      case "LineBreak":
        return <br key={index} />;
      case "Link": {
        if (isSafeLinkUrl(node.url)) {
          return (
            <a key={index} href={node.url} target="_blank" rel="noopener noreferrer">
              {renderInline(node.children)}
            </a>
          );
        }
        // Unsafe destination (Section 19.9): keep the readable text, never
        // an active anchor, and never a raw-HTML fallback.
        return <Fragment key={index}>{renderInline(node.children)}</Fragment>;
      }
    }
  });
}

/**
 * `HeadingNode.depth` is already typed `1 | 2 | 3 | 4 | 5 | 6` by the
 * compiler's AST contract — this lookup relies on that invariant directly
 * rather than defensively clamping an already-guaranteed value. If the
 * contract ever widened, this `Record` would fail to typecheck rather than
 * silently clamping to a wrong level.
 */
const HEADING_TAGS: Record<HeadingNode["depth"], "h1" | "h2" | "h3" | "h4" | "h5" | "h6"> = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
  5: "h5",
  6: "h6"
};

export interface ContentViewProps {
  readonly block: ParagraphNode | HeadingNode;
}

/**
 * Renders a `content` result's block directly from the existing compiler
 * AST (docs/CORE_SPEC.md Section 19.8) — no flattening, no Markdown
 * re-parsing, no second content AST, no `dangerouslySetInnerHTML`.
 */
export function ContentView({ block }: ContentViewProps): ReactNode {
  if (block.type === "Heading") {
    const Tag = HEADING_TAGS[block.depth];
    return <Tag>{renderInline(block.children)}</Tag>;
  }
  return <p>{renderInline(block.children)}</p>;
}
