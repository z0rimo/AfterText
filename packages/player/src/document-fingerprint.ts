import type {
  ChoiceItem,
  ConditionalBranch,
  ExpressionNode,
  InlineNode,
  LiteralValue,
  PresentationCommand,
  SceneNode,
  StateValue,
  StoryBlock,
  StoryDocument,
  StoryStateDefinition,
  VariantBranch
} from "@aftertext/compiler";
import type { JsonValue } from "./snapshot-types.js";

/**
 * Compile-time exhaustiveness guard: every canonicalizer below ends with
 * this instead of an unconditional fallback `return`, so that adding a
 * new AST discriminant variant without updating its canonicalizer is a
 * TYPE ERROR here, not a silently-wrong fingerprint (docs/CORE_SPEC.md
 * Section 33.5 — a missing semantic field must never be excluded merely
 * because fingerprinting didn't notice it was added).
 */
function unhandledVariant(value: never): never {
  throw new Error(`document-fingerprint: unhandled AST variant: ${JSON.stringify(value)}`);
}

/**
 * Deterministic 64-bit FNV-1a hash over a string's UTF-16 code units, each
 * fed as two bytes (high byte then low byte, a fixed order — the specific
 * order is arbitrary but must never change, since changing it would
 * silently change every existing fingerprint). Pure `bigint` arithmetic
 * (docs/CORE_SPEC.md Section 33.5): no `node:crypto`, no WebCrypto, no
 * external package, so this remains portable to every supported JS
 * environment including browsers. This is a defensive mismatch detector,
 * not a cryptographic guarantee (Section 33.5's own collision caveat).
 */
const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function fnv1a64Hex(input: string): string {
  let hash = FNV_OFFSET_BASIS_64;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i); // NOSONAR(typescript:S7758) — intentional UTF-16 code-unit iteration, not text processing; see comment above
    const highByte = BigInt((code >> 8) & 0xff);
    const lowByte = BigInt(code & 0xff);
    hash = ((hash ^ highByte) * FNV_PRIME_64) & MASK_64;
    hash = ((hash ^ lowByte) * FNV_PRIME_64) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Tags an authored-optional value so its absence never collides with a present value of any type, including an authored `0`/`false`/`""` (docs/CORE_SPEC.md Section 33.5). */
function optional(value: JsonValue | undefined): JsonValue {
  return value === undefined ? ["none"] : ["some", value];
}

/** Type-tags a primitive authored value so `"1"`, `1`, `true`, `"true"`, and `null` can never canonicalize to the same representation. */
function canonicalizeTypedPrimitive(value: LiteralValue | StateValue): JsonValue {
  if (value === null) return ["null"];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "boolean") return ["boolean", value];
  return ["number", value];
}

function canonicalizeExpression(node: ExpressionNode): JsonValue {
  if (node.type === "Literal") return ["Literal", canonicalizeTypedPrimitive(node.value)];
  if (node.type === "Identifier") return ["Identifier", node.name];
  if (node.type === "Unary") return ["Unary", node.operator, canonicalizeExpression(node.argument)];
  if (node.type === "Binary") {
    return ["Binary", node.operator, canonicalizeExpression(node.left), canonicalizeExpression(node.right)];
  }
  if (node.type === "Call") return ["Call", node.callee, node.args.map(canonicalizeExpression)];
  return unhandledVariant(node);
}

function canonicalizeInline(node: InlineNode): JsonValue {
  if (node.type === "Text") return ["Text", node.value];
  if (node.type === "Emphasis") return ["Emphasis", node.children.map(canonicalizeInline)];
  if (node.type === "Strong") return ["Strong", node.children.map(canonicalizeInline)];
  if (node.type === "InlineCode") return ["InlineCode", node.value];
  if (node.type === "Link") return ["Link", node.url, node.children.map(canonicalizeInline)];
  if (node.type === "LineBreak") return ["LineBreak"];
  return unhandledVariant(node);
}

function canonicalizePresentationCommand(command: PresentationCommand): JsonValue {
  if (command.type === "Background") return ["Background", command.image];
  if (command.type === "Layer") return ["Layer", command.image];
  if (command.type === "Camera") return ["Camera", command.action, command.to, optional(command.durationMs)];
  if (command.type === "Music") return ["Music", command.track, optional(command.volume)];
  if (command.type === "Sfx") return ["Sfx", command.clip];
  if (command.type === "Pause") return ["Pause", command.durationMs];
  if (command.type === "ShowSprite") return ["ShowSprite", command.id, command.image, command.position];
  if (command.type === "HideSprite") return ["HideSprite", command.id];
  return unhandledVariant(command);
}

function canonicalizeConditionExpression(condition: ExpressionNode | undefined): JsonValue {
  return condition ? ["some", canonicalizeExpression(condition)] : ["none"];
}

function canonicalizeChoiceItem(item: ChoiceItem): JsonValue {
  return ["ChoiceItem", item.text, item.target, canonicalizeConditionExpression(item.condition)];
}

function canonicalizeConditionalBranch(branch: ConditionalBranch): JsonValue {
  return ["ConditionalBranch", branch.kind, canonicalizeConditionExpression(branch.condition), branch.blocks.map(canonicalizeBlock)];
}

function canonicalizeVariantBranch(branch: VariantBranch): JsonValue {
  return [
    "VariantBranch",
    branch.kind,
    branch.branchId,
    canonicalizeConditionExpression(branch.condition),
    branch.blocks.map(canonicalizeBlock)
  ];
}

/**
 * Covers every current `StoryBlock` variant (docs/CORE_SPEC.md Section
 * 33.5) — Paragraph/Heading inline content, Dialogue speaker/content,
 * Presentation's full authored command, Set name/expression, Goto target,
 * Choice items, and Conditional/Variant branch semantics including their
 * nested `blocks`. Never reads a `*Span`/`span` field anywhere.
 */
function canonicalizeBlock(block: StoryBlock): JsonValue {
  if (block.type === "Paragraph") return ["Paragraph", block.children.map(canonicalizeInline)];
  if (block.type === "Heading") return ["Heading", block.depth, block.children.map(canonicalizeInline)];
  if (block.type === "Dialogue") return ["Dialogue", block.speaker, block.content.map(canonicalizeInline)];
  if (block.type === "Presentation") return ["Presentation", canonicalizePresentationCommand(block.command)];
  if (block.type === "Set") return ["Set", block.name, canonicalizeExpression(block.expression)];
  if (block.type === "Goto") return ["Goto", block.target];
  if (block.type === "Choice") return ["Choice", block.items.map(canonicalizeChoiceItem)];
  if (block.type === "Conditional") return ["Conditional", block.branches.map(canonicalizeConditionalBranch)];
  if (block.type === "Variant") return ["Variant", block.id, block.branches.map(canonicalizeVariantBranch)];
  return unhandledVariant(block);
}

function canonicalizeScene(scene: SceneNode): JsonValue {
  return ["Scene", scene.id, scene.blocks.map(canonicalizeBlock)];
}

/**
 * Ordinal (not locale-aware) string comparison, explicit rather than
 * relying on `Array.prototype.sort()`'s own unspecified-by-omission
 * default: this fingerprint must be deterministic across every JS
 * environment (docs/CORE_SPEC.md Section 33.5), so the key order here
 * must never depend on the host's locale/ICU data the way
 * `String#localeCompare` would. Produces the exact same UTF-16-code-unit
 * order the engine's own default string sort already uses — this is an
 * explicitness fix, not a behavior change.
 */
function compareOrdinal(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Sorted-key canonicalization (docs/CORE_SPEC.md Section 33.5): `initialState` is an unordered authored map, so authored key order must never affect the fingerprint, unlike every array-shaped field above. */
function canonicalizeInitialState(initialState: StoryStateDefinition): JsonValue {
  return Object.keys(initialState)
    .sort(compareOrdinal)
    .map((key): JsonValue => [key, canonicalizeTypedPrimitive(initialState[key]!)]);
}

/**
 * Computes a deterministic, browser-portable fingerprint from every
 * execution/rendering-relevant authored semantic value in `document`
 * (docs/CORE_SPEC.md Section 33.5) — explicitly excluding `SourceSpan`/
 * `*Span`/`*Position` metadata and `metadata.title`/`metadata.entry`
 * (neither is read anywhere in the compiled execution/rendering path).
 * `entryScene` itself is included; `metadata.entry` is not the same field
 * and is excluded.
 */
export function computeDocumentFingerprint(document: StoryDocument): string {
  const canonical: JsonValue = [
    "StoryDocument",
    document.entryScene,
    canonicalizeInitialState(document.initialState),
    document.scenes.map(canonicalizeScene)
  ];
  return `fnv1a64:${fnv1a64Hex(JSON.stringify(canonical))}`;
}
