// Public API surface. Deliberately excludes anything from parser/ that
// touches remark/mdast/unified — runtime-facing code must depend only on
// the AfterText-owned AST types re-exported here.

export { compile, type CompileResult } from "./compile.js";

export type {
  SourcePosition,
  SourceSpan,
  LiteralValue,
  UnaryOperator,
  BinaryOperator,
  LiteralExpression,
  IdentifierExpression,
  UnaryExpression,
  BinaryExpression,
  CallExpression,
  ExpressionNode,
  TextInline,
  EmphasisInline,
  StrongInline,
  InlineCodeInline,
  LinkInline,
  LineBreakInline,
  InlineNode,
  BackgroundCommand,
  LayerCommand,
  CameraAction,
  CameraZoomCommand,
  CameraCommand,
  MusicCommand,
  SfxCommand,
  PauseCommand,
  PresentationCommand,
  StateValue,
  StoryStateDefinition,
  StoryMetadata,
  ParagraphNode,
  HeadingNode,
  PresentationNode,
  SetNode,
  GotoNode,
  ChoiceItem,
  ChoiceNode,
  ConditionalBranchKind,
  ConditionalBranch,
  ConditionalNode,
  VariantBranchKind,
  VariantBranch,
  VariantNode,
  StoryBlock,
  SceneNode,
  StoryDocument
} from "./ast/index.js";

export type { Diagnostic, DiagnosticCode, DiagnosticSeverity } from "./diagnostics/index.js";

// Serializer-boundary-safety predicates (docs/CORE_SPEC.md Section 25.40,
// "Source-Generation Safety Helpers") — small, additive, lexical-only
// helpers for tools that generate AfterText source. Sourced from
// `parser/serializer-safety.ts`, which (like this whole module) has no
// `remark`/`mdast` dependency, unlike `parser/blocks.ts` itself.
export { isChoiceTargetBoundarySafe, isPresentationNamedArgumentValueBoundarySafe } from "./parser/serializer-safety.js";
