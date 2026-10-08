import { isMap, isScalar, LineCounter, parseDocument } from "yaml";
import type { Node } from "yaml";
import type { SourcePosition, SourceSpan } from "../ast/span.js";
import type { StateValue, StoryMetadata, StoryStateDefinition } from "../ast/story.js";
import { Diagnostics } from "../diagnostics/codes.js";
import type { Diagnostic } from "../diagnostics/types.js";
import { variableNameProblem } from "./expression-lexer.js";
import { joinLineText, lineEnd, lineStart, splitLines, type SourceLine } from "./lines.js";

export interface FrontmatterResult {
  readonly metadata: StoryMetadata;
  readonly initialState: StoryStateDefinition;
  /** Source lines that remain to be parsed as the story body. */
  readonly bodyLines: readonly SourceLine[];
  readonly diagnostics: Diagnostic[];
}

const DELIMITER = "---";

/** A YAML scalar resolving to one of v0.1's allowed initial-state value types. */
function isAllowedScalarNode(node: Node | null | undefined): node is { value: StateValue } & Node {
  if (!node || !isScalar(node)) return false;
  const value: unknown = node.value;
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function keyName(key: unknown): string {
  return isScalar(key) ? String(key.value) : String(key);
}

/**
 * The state key exactly as the author wrote it. The YAML core schema reads an
 * unquoted `TRUE`, `False`, `Null`, or `~` as a boolean/null and `0x10` as a
 * number, so `String(key.value)` would silently turn the declared key `TRUE`
 * into `"true"`. For plain scalars the original source text is the key; quoted
 * scalars already carry their text as the value.
 */
function stateKeyName(key: unknown): string {
  if (isScalar(key) && key.type === "PLAIN" && typeof key.source === "string") return key.source;
  return keyName(key);
}

/**
 * `__proto__` is rejected as a state key, but not as a `@set` name: assigned
 * through the plain-object initial-state map it would silently vanish (or,
 * for `null`, change the map's prototype), so the declaration could not be
 * trusted to round-trip. See CORE_SPEC Section 12.
 */
const FORBIDDEN_STATE_KEY = "__proto__";

/** The reason a frontmatter `state:` key is not a valid state variable name, if any. */
function stateKeyProblem(key: string): string | undefined {
  if (key === FORBIDDEN_STATE_KEY) return `"${FORBIDDEN_STATE_KEY}" is not allowed as a state key.`;
  switch (variableNameProblem(key)) {
    case "invalid-identifier":
      return "state keys must match [A-Za-z_][A-Za-z0-9_]*.";
    case "reserved-literal":
      return `"${key}" is a reserved literal and cannot be a state variable name.`;
    default:
      return undefined;
  }
}

/**
 * Extracts and parses a leading `--- ... ---` YAML frontmatter block, if
 * present, normalizing it into a StoryMetadata plus a first-class initial
 * state map. Unsupported state values (arrays, nested objects, YAML
 * timestamps/binary/aliases, ...) are reported as AT1201 diagnostics and
 * dropped from the state map rather than throwing. If the YAML itself has
 * syntax errors, only AT1202 is reported for `state:` — semantic
 * validation of its (possibly parser-recovered, unreliable) contents is
 * skipped to avoid a misleading AT1201 cascade. Returns the remaining
 * body lines (frontmatter stripped) for the block parser to consume.
 */
export function extractFrontmatter(source: string): FrontmatterResult {
  const lines = splitLines(source);
  const diagnostics: Diagnostic[] = [];

  const emptyMetadata: StoryMetadata = { title: undefined, entry: undefined, span: undefined };
  const empty = { metadata: emptyMetadata, initialState: {}, bodyLines: lines, diagnostics };

  if (lines.length === 0 || (lines[0] as SourceLine).text.trim() !== DELIMITER) {
    return empty;
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] as SourceLine).text.trim() === DELIMITER) {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    // No closing delimiter: treat the whole thing as body (best-effort recovery).
    return empty;
  }

  const openLine = lines[0] as SourceLine;
  const closeLine = lines[closingIndex] as SourceLine;
  const yamlLines = lines.slice(1, closingIndex);
  const yamlText = joinLineText(yamlLines);

  const span: SourceSpan = { start: lineStart(openLine), end: lineEnd(closeLine) };
  const bodyLines = lines.slice(closingIndex + 1);

  const anchorLine = yamlLines.length > 0 ? (yamlLines[0] as SourceLine).number : openLine.number + 1;
  const anchorOffset = yamlLines.length > 0 ? (yamlLines[0] as SourceLine).startOffset : closeLine.startOffset;

  const lineCounter = new LineCounter();
  const doc = parseDocument(yamlText, { lineCounter, prettyErrors: false });

  function positionAt(offset: number): SourcePosition {
    const local = lineCounter.linePos(offset);
    return { line: anchorLine + (local.line - 1), column: local.col, offset: anchorOffset + offset };
  }

  function spanOfNode(node: Node): SourceSpan {
    const range = node.range;
    if (!range) {
      const fallback = positionAt(0);
      return { start: fallback, end: fallback };
    }
    return { start: positionAt(range[0]), end: positionAt(range[1]) };
  }

  // YAML syntax errors (e.g. an unclosed flow sequence) don't throw — the
  // `yaml` package collects them here and still returns a best-effort,
  // partially-resolved document. Surface each as an AT1202 diagnostic
  // rather than silently continuing on possibly-broken content.
  const hasYamlSyntaxErrors = doc.errors.length > 0;
  for (const error of doc.errors) {
    const errorSpan: SourceSpan = { start: positionAt(error.pos[0]), end: positionAt(error.pos[1]) };
    diagnostics.push(Diagnostics.invalidFrontmatter(error.message, errorSpan));
  }

  let title: string | undefined;
  let entry: string | undefined;
  const state: Record<string, StateValue> = {};

  if (isMap(doc.contents)) {
    for (const pair of doc.contents.items) {
      const key = keyName(pair.key);
      const value = pair.value;

      if (key === "title" && isAllowedScalarNode(value) && typeof value.value === "string") {
        title = value.value;
      } else if (key === "entry" && isAllowedScalarNode(value) && typeof value.value === "string") {
        entry = value.value;
      } else if (key === "state" && !hasYamlSyntaxErrors) {
        // Skip semantic validation of `state:` entirely when the YAML
        // itself failed to parse cleanly — the tree the parser recovers
        // around a syntax error doesn't reflect the author's intent, and
        // validating it would only produce misleading AT1201 diagnostics
        // cascading from the real AT1202 syntax error.
        if (value && isMap(value)) {
          for (const statePair of value.items) {
            const stateKey = stateKeyName(statePair.key);
            const stateValue = statePair.value;
            const keyProblem = stateKeyProblem(stateKey);
            if (keyProblem !== undefined) {
              // One diagnostic per bad entry, on the key itself; the entry is
              // dropped so the initial state never holds an unreferenceable key.
              const keyNode = statePair.key as Node | null;
              diagnostics.push(
                Diagnostics.unsupportedStateKey(stateKey, keyProblem, spanOfNode(keyNode ?? stateValue ?? value))
              );
            } else if (isAllowedScalarNode(stateValue)) {
              state[stateKey] = stateValue.value;
            } else {
              diagnostics.push(
                Diagnostics.unsupportedStateValue(stateKey, spanOfNode(stateValue ?? value))
              );
            }
          }
        } else if (value && !(isScalar(value) && value.value === null)) {
          // `state:` with no value at all resolves to a null scalar — treated
          // as "no initial state", not a malformed declaration.
          diagnostics.push(Diagnostics.unsupportedStateValue("state", spanOfNode(value)));
        }
      }
    }
  }

  const metadata: StoryMetadata = { title, entry, span };
  return { metadata, initialState: state, bodyLines, diagnostics };
}
