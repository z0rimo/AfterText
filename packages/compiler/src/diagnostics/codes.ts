import type { SourceSpan } from "../ast/span.js";
import type { Diagnostic, DiagnosticSeverity } from "./types.js";

function diagnostic(
  severity: DiagnosticSeverity,
  code: Diagnostic["code"],
  message: string,
  span: SourceSpan
): Diagnostic {
  return { severity, code, message, span };
}

export const Diagnostics = {
  unknownDirective(name: string, span: SourceSpan): Diagnostic {
    return diagnostic("error", "AT1001", `Unknown directive "@${name}".`, span);
  },
  unclosedBlock(kind: string, span: SourceSpan): Diagnostic {
    return diagnostic(
      "error",
      "AT1002",
      `Unclosed "@${kind}" block: missing matching "@end".`,
      span
    );
  },
  duplicateScene(id: string, span: SourceSpan): Diagnostic {
    return diagnostic("error", "AT1003", `Duplicate scene id "${id}".`, span);
  },
  unknownSceneReference(id: string, span: SourceSpan): Diagnostic {
    return diagnostic(
      "error",
      "AT1004",
      `Reference to unknown scene "${id}".`,
      span
    );
  },
  malformedChoiceItem(reason: string, span: SourceSpan): Diagnostic {
    return diagnostic("error", "AT1005", `Malformed choice item: ${reason}`, span);
  },
  conditionalBranchAfterElse(span: SourceSpan): Diagnostic {
    return diagnostic(
      "error",
      "AT1006",
      `A conditional has a branch after "@else": "@else" must be the last branch.`,
      span
    );
  },
  blocksNestedTooDeeply(limit: number, span: SourceSpan): Diagnostic {
    return diagnostic(
      "error",
      "AT1007",
      `Conditional and variant blocks are nested too deeply (limit ${limit}); the block is skipped.`,
      span
    );
  },
  duplicateVariantId(id: string, span: SourceSpan): Diagnostic {
    return diagnostic("error", "AT1101", `Duplicate variant id "${id}".`, span);
  },
  variantWithoutWhenBranch(id: string, span: SourceSpan): Diagnostic {
    return diagnostic(
      "error",
      "AT1102",
      `Variant "${id}" has no "@when" branch.`,
      span
    );
  },
  unknownVariantReference(id: string, span: SourceSpan): Diagnostic {
    return diagnostic("error", "AT1103", `Reference to unknown Variant "${id}".`, span);
  },
  variantBranchAfterOtherwise(id: string, span: SourceSpan): Diagnostic {
    return diagnostic(
      "error",
      "AT1104",
      `Variant "${id}" has a branch after "@otherwise": "@otherwise" must be the last branch.`,
      span
    );
  },
  malformedExpression(reason: string, span: SourceSpan): Diagnostic {
    return diagnostic("error", "AT2001", `Malformed expression: ${reason}`, span);
  },
  expressionNumericNotFinite(span: SourceSpan): Diagnostic {
    return diagnostic(
      "error",
      "AT2005",
      "Numeric literal is not representable as a finite number.",
      span
    );
  },
  unknownBuiltin(name: string, span: SourceSpan): Diagnostic {
    return diagnostic("error", "AT2002", `Unknown builtin call "${name}".`, span);
  },
  wrongBuiltinArity(name: string, expected: number, actual: number, span: SourceSpan): Diagnostic {
    return diagnostic(
      "error",
      "AT2003",
      `"${name}" expects ${expected} argument${expected === 1 ? "" : "s"}, got ${actual}.`,
      span
    );
  },
  invalidBuiltinArgument(name: string, span: SourceSpan): Diagnostic {
    return diagnostic("error", "AT2004", `"${name}" requires a string literal argument.`, span);
  },
  unsupportedStateValue(key: string, span: SourceSpan): Diagnostic {
    return diagnostic(
      "error",
      "AT1201",
      `Unsupported initial state value for "${key}": only string, number, boolean, and null are allowed.`,
      span
    );
  },
  unsupportedStateKey(key: string, reason: string, span: SourceSpan): Diagnostic {
    return diagnostic("error", "AT1201", `Unsupported initial state key "${key}": ${reason}`, span);
  },
  invalidFrontmatter(reason: string, span: SourceSpan): Diagnostic {
    return diagnostic("error", "AT1202", `Invalid frontmatter: ${reason}`, span);
  },
  malformedPresentation(reason: string, span: SourceSpan): Diagnostic {
    return diagnostic("error", "AT1301", `Malformed presentation directive: ${reason}`, span);
  },
  presentationNumericNotFinite(span: SourceSpan): Diagnostic {
    return diagnostic(
      "error",
      "AT1302",
      "Numeric value is not representable as a finite number.",
      span
    );
  },
  unsupportedMarkdown(construct: string, span: SourceSpan): Diagnostic {
    return diagnostic(
      "warning",
      "AT3001",
      `Unsupported Markdown construct "${construct}": falling back to plain text.`,
      span
    );
  }
} as const;
