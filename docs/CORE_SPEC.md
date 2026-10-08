# AfterText — Core Specification

> Status: v0.1.x foundation (early development)
> Role: Canonical specification of the AfterText language and of the compiler, runtime, player, and web-renderer contracts
> Scope: Product intent, architectural boundaries, language principles, public AST and diagnostic contracts, and stable design decisions

This document is the primary source of truth for the AfterText Core packages (`@aftertext/compiler`, `@aftertext/runtime`, `@aftertext/player`, `@aftertext/web-renderer`).

If implementation details or informal notes conflict with this document, this document takes precedence unless the relevant section is explicitly marked `PROVISIONAL`.

**Section numbering is stable.** Section numbers are inherited from the project's original specification, and source comments refer to them. Numbers are never reused for different content; gaps in Section 25 are intentional (Section 25 lists only the compiler-guaranteed source-metadata contracts).

---

# 1. Project Definition

AfterText is a prose-first authoring format and runtime for cinematic, stateful web stories.

The author writes ordinary prose first and adds optional AfterText directives to control narrative state, branching, presentation, and web-native storytelling effects.

The core principle is:

> The story must remain readable as prose even when AfterText-specific presentation directives are removed.

AfterText is not primarily a visual novel engine, game engine, comic editor, or AI story generator.

It is intended to make written stories capable of behaving dynamically on the web.

---

# 2. Core Product Idea

AfterText treats prose as the primary artifact.

Example:

```markdown
@scene intro

그날은 비가 내렸다.

나는 창밖을 바라보았다.

@camera zoom to=1.15 duration=6s

건너편 건물에 불이 켜졌다.
```

Without AfterText directives, the remaining content should still be meaningful prose:

```markdown
그날은 비가 내렸다.

나는 창밖을 바라보았다.

건너편 건물에 불이 켜졌다.
```

Presentation enhances the text.

Presentation must not become a prerequisite for understanding the source.

---

# 3. Long-Term Differentiator

Status: LOCKED

AfterText must distinguish between:

1. the current state of the fictional world; and
2. what the reader has previously experienced.

Conceptually:

```text
StoryState != ReaderState
```

Example:

```text
Current world:
Alice is alive.

Reader memory:
The reader previously read a sentence saying Alice died.
```

Both facts may simultaneously be true.

This separation enables retroactive narrative techniques such as:

* previously read sentences changing;
* history changing without immediately informing the reader;
* choices being remembered differently from the current world;
* text variants changing after they were previously seen;
* the reader remembering a state that the story world no longer contains.

The exact runtime API is not yet finalized.

The conceptual separation is a stable architectural requirement.

---

# 4. Design Principles

Status: LOCKED

## 4.1 Prose first

Ordinary prose is the default authoring mode.

AfterText syntax supplements prose rather than replacing it.

## 4.2 Web native

The final target is the web.

Text should remain real document content where practical rather than being rendered entirely into a canvas.

This preserves:

* text selection;
* accessibility;
* responsive typography;
* browser search;
* semantic HTML;
* localization possibilities.

## 4.3 Small language

AfterText must not evolve into a general-purpose programming language.

State and narrative features should remain deliberately constrained.

## 4.4 Compiler-owned semantics

Source syntax must be parsed and normalized by the compiler.

Runtime code must not re-parse authoring strings.

Example:

```text
duration=6s
```

should become normalized compiler output such as:

```text
6000
```

before reaching runtime.

## 4.5 Explicit architecture boundaries

Compiler, runtime, presentation, and authoring-tool responsibilities must remain separate.

## 4.6 Best-effort authoring diagnostics

Ordinary author mistakes should produce structured diagnostics.

They should not normally crash compilation.

Partial compiler output may still be returned for source-editing tools and diagnostics.

---

# 5. High-Level Architecture

Status: LOCKED

Target pipeline:

```text
AfterText source
      │
      ▼
┌────────────────┐
│    Compiler    │
│                │
│ directives     │
│ Markdown       │
│ expressions    │
│ validation     │
│ normalization  │
└───────┬────────┘
        │ StoryDocument
        ▼
┌────────────────┐
│    Runtime     │
│                │
│ StoryState     │
│ ReaderState    │
│ navigation     │
│ variants       │
│ choices        │
└───────┬────────┘
        │ Runtime state/events
        ▼
┌────────────────┐
│ Web Renderer   │
│                │
│ DOM            │
│ presentation   │
│ animation      │
│ audio          │
└────────────────┘
```

Future authoring tools consume these packages rather than replacing them.

```text
Authoring tool (outside this repository)
 ├── compiler
 ├── runtime
 └── web renderer
```

---

# 6. Package Direction

Status: RESERVED (informational)

The section number is reserved and stable. The packages specified here are:

```text
@aftertext/compiler      parse + validate -> StoryDocument + diagnostics
@aftertext/runtime       pure execution over a StoryDocument
@aftertext/player        thin headless session layer over the runtime
@aftertext/web-renderer  React component; presentation only
```

Dependencies point one way: `web-renderer` -> `player` -> `runtime` -> `compiler`.

Earlier planning names (`web`, `cli`, `adapter-ink`, `effects-*`) and application ideas (`playground`, `editor`) are not part of this specification and are not commitments.

Do not create packages simply to anticipate possible future requirements.

A new package must have a real architectural boundary.

---

# 7. Compiler Contract

Status: LOCKED

The compiler pipeline is:

```text
source
→ directive scanning
→ Markdown parsing for prose regions
→ AfterText-owned AST
→ validation
→ CompileResult
```

Markdown parsing may use external libraries such as remark/unified internally.

External parser AST types must not escape through AfterText's public API.

The runtime consumes only AfterText-owned types.

All source-derived AST nodes should retain useful source location information through `SourceSpan`.

The compiler foundation is frozen for the current phase. Changes to syntax, AST contracts, or diagnostics require a concrete language requirement, compiler regression, or explicitly accepted design change.

---

# 8. AfterText v0.1 Directive Boundary

Status: LOCKED

An AfterText directive:

* starts at column 1;
* begins with `@`;
* uses a registered directive name.

Example:

```text
@scene intro
```

Indented directives are not supported in v0.1.

A literal line beginning with `@` may be escaped:

```text
\@example
```

The visible prose becomes:

```text
@example
```

Primary language separators:

```text
@       directive
@end    structured block termination
->      narrative destination
=       state assignment
```

Avoid introducing additional punctuation systems without a concrete requirement.

---

# 9. Current v0.1 Narrative Syntax

Status: LOCKED

## Scene

```text
@scene intro
```

A scene continues until the next scene declaration or EOF.

A document without an explicit scene receives a deterministic synthetic `main` scene.

Leading prose before an explicit scene is also preserved through the synthetic-main mechanism.

Empty-string scene IDs are forbidden.

---

## State mutation

```text
@set timeline = 1
@set affinity = affinity + 1
```

`@set` is the only state mutation syntax in v0.1.

---

## Navigation

```text
@goto next-scene
```

---

## Conditions

```text
@if timeline == 0

Text.

@elseif timeline == 1

Other text.

@else

Fallback.

@end
```

---

## Choices

```text
@choice

- 문을 연다 -> room
- 도망친다 -> street
- 열쇠를 사용한다 -> basement if has_key

@end
```

The condition delimiter belongs to the target portion of the choice grammar.

The word `if` inside display text is ordinary text.

---

# 10. Variant

Status: LOCKED

Variant is a first-class AfterText concept.

It must not be represented merely as syntactic sugar around `if`.

Example:

```text
@variant alice-status

@when timeline == 0
그녀는 그날 밤 죽었다.

@when timeline == 1
그녀는 그날 밤 사라졌다.

@otherwise
그날 밤에는 아무 일도 없었다.

@end
```

A variant has a stable content identity.

The runtime will eventually use this identity to determine which variant a reader previously experienced.

Conceptual future capability:

```text
hasChangedSinceRead("alice-status")
```

The exact API remains provisional.

The stable-identity concept does not.

---

# 11. Expressions

Status: LOCKED for v0.1

Supported values:

```text
string
number
boolean
null
```

A `number` emitted into the semantic AST from an authored numeric literal must be finite-representable — see Section 24 (Compiler Numeric Hardening) for the exact invariant, diagnostic, and rejection behavior for a lexically-valid literal that is not.

Supported expressions:

```text
!
-

*
/
%

+
-

<
<=
>
>=

==
!=

&&
||
```

Parentheses are supported.

Examples:

```text
timeline >= 2 && saw_person
affinity + 1
(affinity >= 5 && saw_person) || has_letter
```

Not supported:

```text
function calls
member access
arrays
objects
arbitrary script execution
```

State is flat key/value state in v0.1.

---

# 12. Initial Story State

Status: LOCKED

Initial state is defined through frontmatter:

```yaml
---
title: Example
entry: intro

state:
  timeline: 0
  saw_person: false
---
```

The compiler normalizes this into a first-class initial-state representation.

Allowed values:

```text
string
number
boolean
null
```

Unsupported YAML structures must produce diagnostics.

Malformed YAML syntax itself must produce a diagnostic:

```text
AT1202 Invalid frontmatter
```

Malformed YAML syntax must not produce misleading cascading semantic state diagnostics derived from parser-recovered values.

Semantic state validation remains active whenever the YAML syntax itself is valid.

Initial story state must not remain embedded inside generic metadata.

**State key rules (LOCKED, additive for v0.1.1).** Every key of the `state:` map must be a valid state variable name, so each declared variable can be referenced by the expression language and assigned by `@set`:

* it matches the identifier grammar `[A-Za-z_][A-Za-z0-9_]*` (ASCII only; Unicode identifiers are not part of this rule);
* it is not exactly `true`, `false`, or `null` (case-sensitive; `TRUE`, `True`, `trueValue`, `nullable`, `true_` are valid). These are the words the expression lexer always reads as literals, and the same `RESERVED_VARIABLE_NAMES` list rejects them as `@set` names (Section 25.55);
* it is not `__proto__`.

A violating entry produces `AT1201` (error), positioned on the key itself (a quoted key's span includes its quotes), and the entry is excluded from the initial state. It is one diagnostic per entry: when the entry's value is also unsupported, only the key diagnostic is reported until the key is fixed. `AT1201` is reused rather than adding a new code because it already means "this `state:` entry cannot become a valid initial-state entry" and the effect is identical (error plus the entry dropped); the message distinguishes `Unsupported initial state key` from `Unsupported initial state value`. As with every state diagnostic, none is produced when the YAML itself has a syntax error (`AT1202`).

The key is the text as written. YAML reads an unquoted `TRUE`, `False`, `Null`, or `~` as a boolean or null, and an unquoted `0x10` as a number; for plain scalar keys the original source text is used as the key (quoted keys use their content). Consequently unquoted `TRUE` and `True` declared together are still a YAML duplicate key (`AT1202`); quote one of them.

**`__proto__` is rejected for `state:` keys only (recorded asymmetry).** `@set __proto__ = ...` is unchanged and behaves safely (Section 25.55). In the frontmatter, the initial-state map is a plain object: a `__proto__` entry was silently dropped, or for `null` replaced the map's prototype, so the declaration could not be trusted, and an own `__proto__` key is not reliably preserved by common object-copy idioms (`Object.assign({}, state)`). This is revisited when a state representation or Save/Load is designed. `constructor`, `prototype`, and similar names are not reserved: they are ordinary own properties and read access is guarded against inherited names.

---

# 13. Entry Scene

Status: LOCKED

Runtime must not guess the entry scene.

The compiled document exposes normalized entry-scene information directly.

Stable invariants:

* a successfully compiled `StoryDocument` always contains at least one scene;
* `StoryDocument.entryScene` always references a scene contained in the same `StoryDocument`;
* a completely empty or whitespace-only document compiles to a synthetic `main` scene;
* prose before the first explicit `@scene` is preserved through the synthetic `main` scene;
* an explicit `entry` must reference an existing scene or produce an error diagnostic;
* if `entry` is omitted, the compiler resolves it deterministically.

Expected semantics:

1. explicit `entry` must reference an existing scene;
2. missing explicit targets are compiler errors;
3. without explicit `entry`, the first scene becomes the entry scene;
4. a scene-less document uses synthetic `main`;
5. runtime consumes the normalized result directly.

---

# 14. Presentation Commands

Status: LOCKED architectural rule

Presentation commands must use typed AfterText-owned AST representations.

Do not expose arbitrary parameter maps when a command has known semantics.

Current v0.1 command families:

```text
background
layer
camera
music
sfx
pause
```

Current camera functionality begins with:

```text
zoom
```

Additional camera actions are additive features and must receive explicit types.

Compiler responsibilities include:

* syntax;
* validation;
* duration parsing;
* numeric parsing;
* normalization;
* typed command construction.

Runtime responsibilities do not include re-parsing directive strings.

**Source-tooling metadata (LOCKED, additive — see Section 25.36).** A compiler-generated `PresentationNode` may additionally expose source-analysis metadata (an optional, compiler-populated record of named `key=value` parameters' authored *value* spans) alongside its existing whole-node `SourceSpan`. This metadata belongs to compiler/source tooling, not Presentation runtime state: it is not part of `PresentationCommand`, is never interpreted by Runtime/Player, changes no DSL semantics, and does not constitute a lossless CST — it is narrowly scoped to enabling targeted, formatting-preserving source edits (e.g. by a structured source editor) without requiring that tool to re-parse directive text itself.

**Positional source-tooling metadata (LOCKED, additive — see Section 25.36).** `PresentationNode` additionally gains one optional sibling field, `positionalValueSpan?: SourceSpan`, covering a directive's single authored positional (non-`key=value`) argument token — e.g. `@pause 0.50s`'s `0.50s`, `@camera zoom`'s `zoom`, `@music theme.mp3 volume=0.8`'s `theme.mp3`, `@background bg.png`'s `bg.png`. It follows the same public-compatibility philosophy as `parameterValueSpans`: optional on the public type (existing hand-constructed `PresentationNode` object literals remain source-compatible), but every compiler-produced node populates it exactly when the contract below says it should. Neither field is renamed, nested, or restructured to accommodate the other — both remain flat, independent, additive siblings alongside `span`:

```text
PresentationNode
├─ span
├─ parameterValueSpans
└─ positionalValueSpan
```

**Exact contract (LOCKED).** `positionalValueSpan` is populated **if and only if** the directive's argument text contains exactly one positional (non-`key=value`) token; it is `undefined` whenever zero, or two-or-more, positional tokens are present. **`undefined` is not a general "not authored" indicator** — unlike the named-parameter case, it can also mean a positional semantic value genuinely exists but cannot be safely represented as one contiguous span. Reason: current tokenization classifies only `key=value`-shaped tokens as named parameters; every other token is pooled as positional and, when there is more than one, joined with a synthetic single space into the parser's semantic value — regardless of whether a named-parameter token physically separated them in source (e.g. `first volume=0.8 second` can legally parse to a positional value equivalent to `"first second"`, even though `"first"` and `"second"` are non-contiguous in the actual source, separated by `volume=0.8`). No single `SourceSpan` can truthfully represent such a value without also covering unrelated intervening text, so the compiler never synthesizes one — the field is left `undefined` rather than exposing an incorrect bounding span. This is a directive-kind-agnostic rule (it says nothing about which command is involved), so it naturally also populates spans for Camera's action token, Music's track, and Background/Layer/Sfx's paths in their ordinary single-token form — **this metadata availability does not by itself imply that any tool supports editing those values** (see Section 25.36). No compiler grammar, tokenization, parameter-ordering, diagnostics, or recovery behavior changes as part of this — the existing loose multi-positional-token acceptance is recorded as future grammar/diagnostic backlog, not redesigned here. `positionalValueSpan` uses the same absolute raw-source `SourceSpan` convention as every other span in the compiler (UTF-16-safe, CRLF-safe, frontmatter-safe) — no new offset model. As with `parameterValueSpans`, no raw text is duplicated alongside the span; a consumer derives it via `source.slice(span.start.offset, span.end.offset)`.

**Argument-end source-tooling metadata (LOCKED, additive — see Section 25.36).** `PresentationNode` gains a third, additive, optional sibling field:

```ts
readonly argumentsEndPosition?: SourcePosition;
```

(Exact naming/type follow repository convention; the locked concept is what matters.) It is the absolute source position immediately after the last non-whitespace character of the directive's authored argument text, and before any trailing line whitespace or line terminator. For compiler-produced valid Presentation nodes it is always populated, derived from the same trimmed argument text (`directive.args`) already used by `tokenizePresentationArgs` — **never** derived from `PresentationNode.span.end`, which is known to include trailing line whitespace (see below) and is therefore unsafe as an argument-end position. `argumentsEndPosition` is a flat sibling of `span`/`parameterValueSpans`/`positionalValueSpan`, never a replacement or restructuring of any of them:

```text
PresentationNode
├─ span
├─ parameterValueSpans
├─ positionalValueSpan
└─ argumentsEndPosition
```

It remains **optional** on the public type for the same hand-construction-compatibility reason as the other two metadata fields, but every compiler-produced `PresentationNode` populates it whenever the node itself successfully parses. No `PresentationCommand` variant is touched. This field introduces no grammar, tokenization, parameter-ordering, duplicate-parameter, unknown-parameter, diagnostics, or recovery change — it is a pure additive syntax-position fact, layered onto existing, unchanged parsing, existing solely to give source-tooling consumers a safe append point for newly authored named parameters (Section 25.36).

**Why `PresentationNode.span.end` is not a safe append point (LOCKED finding).** `span.end` includes any trailing whitespace/tabs authored on the directive's source line — confirmed directly: for a directive line ending in trailing spaces before its line terminator, `span.end.offset` lands after that trailing whitespace, not immediately after the last real argument character. Conceptually:

```text
@music theme.mp3····
                ^ true arguments end (argumentsEndPosition)
                    ^ node.span.end
```

where `·` denotes authored trailing spaces. Appending new source text at `span.end` would therefore land after accumulated trailing trivia rather than immediately after the authored arguments — `argumentsEndPosition` exists specifically to give tooling a correct anchor instead.

**Removal source-tooling metadata (LOCKED, additive — see Section 25.36).** `PresentationNode` gains a fourth, additive, optional sibling field:

```ts
readonly parameterRemovalSpans?: Readonly<Record<string, SourceSpan>>;
```

flat and independent alongside the existing three:

```text
PresentationNode
├─ span
├─ parameterValueSpans
├─ positionalValueSpan
├─ argumentsEndPosition
└─ parameterRemovalSpans
```

For a given named key `k`, this is the absolute source span that, deleted via a single text splice (replace with `""`), removes exactly that named parameter's complete authored `key=value` token plus exactly one adjacent authored inter-token separator region, chosen by the deterministic position rule below — while preserving every other authored byte of the directive exactly. The purpose of including one adjacent separator in the span is deterministic post-removal source cleanup (no redundant inter-token separator trivia left behind), **not** a claim that separator removal is lexically required to avoid a token merge — the tokens on either side of a removed *interior* parameter would remain well-separated by their own original mutual separator even without this cleanup; only the directive-name-to-first-argument boundary (see the first-token rule below) is ever lexically load-bearing.

**Exact presence contract (LOCKED).** `parameterRemovalSpans[k]` is populated **if and only if** `k` is a recognized named (`key=value`) parameter occurring **exactly once** in the directive's argument text; it is `undefined` when the key does not occur at all, and *also* `undefined` when the key occurs two-or-more times. **`undefined` is not a general "not authored" indicator** — exactly the same availability-style principle already locked for `positionalValueSpan`: with two-or-more occurrences, the parser's existing last-occurrence-wins semantics make exactly one occurrence "effective," but no single removal range can safely delete "the property" without either leaving an earlier duplicate silently in force (deleting only the last occurrence) or requiring multi-range deletion (deleting all occurrences) — so the compiler exposes no removal span at all in that case, rather than an ambiguous or partially-correct one. This field is generic, directive-kind-agnostic compiler/tokenizer metadata: it may be populated for **any** recognized named parameter that occurs exactly once, including keys like `to`, or an unrecognized/unknown key, regardless of whether any tool exposes a Remove control for that key — **metadata availability does not imply tool support** (Section 25.36), exactly as already established for `positionalValueSpan` and `argumentsEndPosition`.

**Existing metadata unaffected (LOCKED).** `parameterValueSpans` keeps its existing, unmodified last-occurrence-wins semantics for both the semantic value and the exposed value span — a duplicated parameter's *value* remains editable via the existing replacement path regardless of `parameterRemovalSpans`. Duplicate-parameter grammar/diagnostics are unchanged; no new diagnostic is added for this slice. `positionalValueSpan`, `argumentsEndPosition`, and `PresentationCommand` are all untouched.

**Deterministic removal-span position rule (LOCKED).** Using the same physical argument-token scan `tokenizePresentationArgs` already performs (each token's start/end offset within `argsText` is already computed there to derive `parameterValueSpans`/`positionalValueSpan`/`argumentsEndPosition`; no second parsing pass or new grammar is introduced):

- If the target parameter's token is the **physically first** argument token (`tokenStart === 0` within `argsText`): the removal span covers the token **plus the complete authored separator immediately following it**. The whitespace between the directive name and its first argument is never part of the removal span — deleting it would merge the directive name with the next surviving token (e.g. turning `@camera duration=0.50s zoom` into the invalid `@camerazoom` if the *preceding* boundary were ever used here instead).
- Otherwise (the target is a **middle or last** argument token): the removal span covers **the complete authored separator immediately preceding it, plus the token**. For a last-position target this naturally excludes any trailing line whitespace/terminator (which lies outside `argsText` entirely, exactly like `argumentsEndPosition`'s own boundary). For a middle-position target, the separator that originally followed the removed token remains untouched and becomes the new separator between its two now-adjacent neighbors.

A separator is defined purely as **the exact authored substring between two adjacent `\S+` argument tokens** — one space, multiple spaces, tabs, or mixed space/tab bytes, exactly as authored; it is never canonicalized, normalized, or fabricated. `parameterRemovalSpans` uses the same absolute `SourceSpan`/`positionAt` conventions as every other Presentation metadata field (UTF-16-safe, CRLF-safe, frontmatter-safe) — no new offset model.

**Sole-argument case (recorded, not specially handled).** For the two removable optional parameters in practice (Camera `duration`, Music `volume`), the target can never be a directive's only argument token, since Camera always requires its positional `action` and Music always requires its positional `track`. The compiler implementation is not required to invent broader removal-span semantics for a hypothetical directive shape where a removable parameter is the sole argument; it need only fail to populate a removal span (rather than produce an unsafe one) if such a shape is ever encountered.

**No grammar change, no rich token API (LOCKED).** This field changes no tokenization, parameter-ordering, duplicate, unknown-parameter, diagnostics, or recovery behavior. No public CST-like structure (e.g. an ordered array of argument-token descriptors) is introduced in this slice — `parameterRemovalSpans` is the narrow, operation-scoped capability this feature actually needs; existing metadata fields are not replaced or restructured to make room for it.

**Contiguous positional source-tooling metadata (LOCKED, additive — see Section 25.36).** `PresentationNode` gains a fifth, additive, optional sibling field:

```ts
readonly contiguousPositionalSpan?: SourceSpan;
```

flat and independent alongside the existing four:

```text
PresentationNode
├─ span
├─ parameterValueSpans
├─ positionalValueSpan
├─ argumentsEndPosition
├─ parameterRemovalSpans
└─ contiguousPositionalSpan
```

**Existing `positionalValueSpan` contract is unchanged (LOCKED, reaffirmed).** Its locked contract remains exactly: populated iff exactly one positional (non-`key=value`) token exists. This new field does **not** broaden, redefine, or replace it — `contiguousPositionalSpan` is a separate, additive generalization sitting alongside it, not a reinterpretation of it.

**Exact presence contract (LOCKED).** `contiguousPositionalSpan` is populated **if and only if**: (1) at least one positional token exists, and (2) every positional token in the directive's argument text occupies one uninterrupted physical run — equivalently, no named (`key=value`) token's position falls between the first and last positional token's position. The span covers from the first positional token's start through the last positional token's end, **including all exact authored inter-token whitespace between positional tokens** (never re-canonicalized to a single space, even though the parser's own semantic value is). For exactly one positional token, this necessarily equals `positionalValueSpan`'s own span (the single-token case is a strict subset of the contiguous-run case) — both fields are populated and cover the identical raw source range in that case, which is expected and not a contradiction. A named parameter physically **before** the entire positional run, or physically **after** it, does not break contiguity (e.g. both `@music volume=0.8 my theme.mp3` and `@music my theme.mp3 volume=0.8` populate this field, slicing exactly `my theme.mp3`); a named parameter physically **between** two positional tokens does break it (e.g. `@music first volume=0.8 second` and `@music my foo=bar theme.mp3` — this field is `undefined` for both, even though the parser's synthetic `.join(" ")` may still produce a semantic value spanning both). **`undefined` does not mean "no positional value exists"** — the same availability-style principle already locked for `positionalValueSpan`: it may mean zero positional tokens, or it may mean positional tokens exist but are physically non-contiguous because a named-parameter token is interleaved among them. No span is ever synthesized across such a case.

**Generic, directive-kind-agnostic (LOCKED, reaffirmed principle).** This field says nothing about which command is involved and is populated identically for Background/Layer/Music/Sfx/Camera alike whenever the contract holds — including Camera's single-token `zoom` action, which trivially satisfies the one-positional-token case exactly like `positionalValueSpan` already does. **Metadata availability does not imply tool support** (Section 25.36) — this is the same principle already established for every prior metadata field in this line.

**Implementation model (LOCKED).** Derived from the same ordered, physically-scanned token list (`ArgsTextToken[]`, already built inside `tokenizePresentationArgs` for `parameterRemovalSpans`) — determine the index range spanning the first through last positional token, and confirm every token in that index range is itself positional (none are named). No second parser, no source re-scan, no new grammar, and no public CST-like argument array is introduced to compute this.

**Whole-command removal source-tooling metadata (LOCKED, additive — see Section 25.36, Whole Presentation Command Removal expansion).** `PresentationNode` gains a sixth, additive, optional sibling field:

```ts
readonly commandRemovalSpan?: SourceSpan;
```

flat and independent alongside the existing five:

```text
PresentationNode
├─ span
├─ parameterValueSpans
├─ positionalValueSpan
├─ argumentsEndPosition
├─ parameterRemovalSpans
├─ contiguousPositionalSpan
└─ commandRemovalSpan
```

**Reaffirmed, unchanged `span` contract (LOCKED).** `PresentationNode.span` starts at the directive's source start and includes its arguments and any authored trailing horizontal whitespace/tabs on the directive line, but never includes the directive's own trailing line terminator (`\n` or `\r\n`) nor any following or preceding blank-line trivia — confirmed directly, not assumed, across every position (first/middle/last/only, LF/CRLF, adjacent to Markdown/other blocks, nested inside Conditional/Variant branches). This contract is **completely unchanged** by this expansion.

**Why `span` alone is insufficient for removal (LOCKED finding).** Replacing only `node.span` with `""` leaves the directive's own physical line terminator behind, producing an accidental empty line — confirmed directly (e.g. removing `@music theme.mp3`'s bare `span` from `"@music theme.mp3\n@pause 1s\n"` leaves a leading blank line before `@pause`). A distinct, wider, compiler-owned span is required to remove a whole command cleanly.

**Exact contract (LOCKED).** `commandRemovalSpan.start` is always exactly `node.span.start` — never adjusted, never reaching backward into preceding source. `commandRemovalSpan.end` is `node.span.end` extended by the exact terminator width of the directive's own physical source line: `+0` at true end-of-file (no following line terminator), `+1` for an authored `\n`, `+2` for an authored `\r\n`. **No first/middle/last/only-block branching of any kind is used** — the same two-case rule (terminator exists vs. true EOF) applies uniformly everywhere, including inside Conditional/Variant branches, adjacent to Markdown or any other block type, and immediately before a following `@scene` line. This was proven, not assumed, against every position and trivia combination the design considered.

**Own-line-terminator ownership (LOCKED convention).** For source-tooling removal purposes, a Presentation directive owns its own immediately-following physical line terminator, and nothing else. Therefore: existing blank-line trivia before or after the directive is never touched (removal never extends past the directive's own single terminator); a following `@scene` line, a following Conditional/Variant branch marker, and any following block of any type are never touched. This is why `commandRemovalSpan` never needs to know what precedes or follows the directive beyond its own physical line.

**Explicit true-EOF policy (LOCKED, not a special case).** When the directive's own physical line has no terminator at all (`newlineLength === 0`, i.e. the directive is the last line of the file with no trailing newline), `commandRemovalSpan` equals `node.span` exactly — no terminator-width extension, and **no preceding-line-terminator fallback is added**. A prior candidate design considered consuming the *preceding* terminator in this case specifically to preserve the file's prior "has/has no final newline" state; this is explicitly rejected as unnecessary complexity, confirmed empirically: deleting only the directive's own content at true EOF already produces the correct, minimal result in every case tested (the previously-separating terminator before the removed directive simply becomes the file's new final terminator, which is pre-existing authored source, not newly introduced trivia). Whole-command removal owns only the removed directive's own following terminator; it does not attempt to preserve the file's overall final-newline-presence state as an independent goal.

**Presence contract (LOCKED, simpler than `parameterRemovalSpans`).** `commandRemovalSpan` is populated for **every** successfully-parsed compiler-produced `PresentationNode`, unconditionally — there is no duplicate-occurrence-style ambiguity analogous to `parameterRemovalSpans`, since a successfully-parsed Presentation directive always has exactly one physical source line to own. It remains optional on the public type for the same hand-construction-compatibility reason as every other metadata field in this line, but a real compiler-produced node never leaves it `undefined`.

**Implementation source fact (LOCKED).** Computed entirely from the same `SourceLine` already passed into the existing Presentation-parsing function for this directive — its `startOffset`, `text.length`, and `newlineLength` — with no second source scan and no lookup of a different line by absolute line number. This deliberately avoids the line-array-indexing pitfall already discovered and fixed for `SceneNode.followingLineEnding` (where a *different* line than the one already in hand had to be located, and the array could be a frontmatter-stripped slice with absolute, non-zero-based line numbers) — here, the directive's own already-available `SourceLine` is sufficient by construction, so no such indexing exists to get wrong.

**Presentation-specific, not generic (LOCKED decision).** `commandRemovalSpan` is added only to `PresentationNode`, not to a generic `StoryBlock` field. This is deliberate: every Presentation directive is a single physical source line, which is exactly what makes this narrow, cheap contract sufficient; other block types (Markdown paragraphs/headings, Choice, Conditional, Variant) can be multi-line with materially different source structure, and no removal feature for them is introduced or implied by this slice.

**No grammar change (LOCKED, reaffirmed).** This field changes no tokenization, parameter-ordering, duplicate/unknown-parameter, diagnostics, recovery, quoting, positional-joining, Scene grammar, or Conditional/Variant grammar. It is a pure additive syntax-position fact.

**Quoted Presentation positional arguments (LOCKED, implemented).** Presentation **positional** argument tokens may be written in double quotes. This makes identifier-prefixed `key=value`-shaped positional values (for example `config=default.json` or `foo=bar.mp3`) expressible: unquoted, such a token is classified as a named parameter. Quoting also preserves exact repeated internal whitespace and tabs. Verification: `packages/compiler/test/presentation-quoting.test.ts`.

**Explicitly a different grammar from expression string literals (LOCKED, central distinction).** The expression language (`@set`, `@if`/`@elseif`/`@when` conditions, Choice-item conditions — anything routed through `parseExpression`) already has its own, unrelated, already-shipped string-literal grammar (`tokenizeExpression` in `expression-lexer.ts`): both `"..."` and `'...'` delimiters, an escape table (`\n`/`\t`/`\r`/`\\`/`\"`/`\'`), and unterminated-string reported as `AT2001`. **This expansion does not touch, extend, unify with, or call into that grammar in any way** — the expression lexer, expression parser, `@set`, `@if`/`@elseif`/`@when`, Choice conditions, `CallExpression`, and the Reader Memory builtin registry are all completely unchanged. **Critically, the expression lexer's escape model is confirmed unsuitable for this feature and deliberately NOT reused**: any backslash-escaped character it doesn't recognize as one of `\n\t\r\\"'` silently drops the backslash and keeps only the following character — confirmed directly, `tokenizeExpression('"C:\\Users\\alice\\music.mp3"')` decodes to `"C:Usersalicemusic.mp3"`, silently destroying every Windows path separator. Quoted Presentation arguments use their own, independent, path-safe escape model (below) specifically to avoid this.

**Presentation-only lexical scope (LOCKED).** Quoted-token recognition is added only inside the Presentation argument tokenizer (`tokenizePresentationArgs` in `blocks.ts`, or its current exact equivalent) — never a generic cross-directive lexer. Confirmed directly from the parser: `@if`/`@elseif`/`@when` route their text through `tryParseExpression` directly, `@set` routes its right-hand side through the same expression parser, `@goto`/`@variant`/`@scene` treat their argument text as an opaque trimmed literal string, and `@choice` uses its own separate bullet/arrow/`\->`-escaping grammar — **none of these call `tokenizePresentationArgs`**, so Scene, Goto, Variant-name, Conditional-expression, Set-expression, and Choice grammar are all structurally unaffected by construction, not merely by intent.

**Primary intended fields and the accepted Camera consequence (LOCKED).** The primary string/path fields this unlocks are `Background.image`, `Layer.image`, `Music.track`, `Sfx.clip`. No command-specific quote-tokenization exception is introduced merely to prevent a natural consequence of Presentation-level positional quoting: because Camera's `zoom` action word already flows through the exact same positional-token mechanism (`parsePresentation`'s `case "camera"` checks the same joined `value` against `KNOWN_CAMERA_ACTIONS`), `@camera "zoom" to=1.5` is allowed to decode its positional token to `zoom` and therefore resolve to the identical semantic Camera action as the unquoted `@camera zoom to=1.5` — an accepted, harmless, unforced consequence of generic positional lexing, not a feature requiring its own design or a reason to special-case Camera.

**No quote-aware numeric parsing (LOCKED).** `Pause.duration`, `Camera.to`, `Camera.duration`, and `Music.volume` are unaffected — numeric parsing (`parseNumericParam`/`parseDurationMs`) remains completely untouched. `@pause "1.5"`, `@camera zoom to="1.5"`, and `@music track volume="0.5"` remain malformed exactly as today (the quoted text is not the expected bare-numeric syntax) — no quote-stripping is added to numeric parsing, and none of the numeric-hardening invariants (`AT1302`/`AT2005`, negative-zero preservation, the finite-number invariant) are touched by this expansion.

**Delimiter and recognition boundary (LOCKED).** Double quotes (`"..."`) only — single-quoted Presentation arguments are explicitly deferred; a single quote remains an ordinary authored character in this grammar. A `"` begins quoted-token syntax **only at a Presentation argument token boundary** — the start of `argsText`, or immediately following argument-separator whitespace. Shell-style concatenation (`foo"bar baz"qux` becoming one token) is explicitly rejected — not implemented. A `"` occurring mid-token, not at a recognized boundary (e.g. `foo"bar`), remains ordinary literal authored text, exactly as today — unchanged, since it never reaches the quote-recognition branch at all.

**Named quoted values explicitly deferred (LOCKED).** `key="foo bar"` is not supported in this expansion; existing named-parameter grammar (`PARAM_TOKEN_PATTERN`, duplicate-key last-wins semantics, unknown-parameter behavior) is completely unchanged. **Locked architectural ordering, load-bearing for correctness**: (1) group one complete Presentation argument token, respecting quotes; (2) only then determine whether that whole token is quoted-positional syntax; (3) otherwise apply the existing named-parameter classification to it. A fully-quoted token such as `"foo=bar.mp3"` is positional — the `=` inside it is decoded content, never named-parameter syntax — because classification is applied to the token as a lexical unit, never by scanning for `=` before token grouping completes.

**Compatibility (LOCKED).** Quoting is an additive pre-1.0 language feature. A `"` that does not begin an argument token (for example mid-token, `foo"bar`) remains ordinary authored text, so existing unquoted arguments are unaffected. No language-version field or feature flag exists or is introduced.

**Raw source remains canonical; semantic value ≠ authored lexical representation (LOCKED, reaffirmed architectural boundary).** `.at` source remains canonical; no AST→source serializer is introduced. For `@music "theme song.mp3"`: the semantic AST value is the decoded characters `theme song.mp3` (no quote delimiters); the authored lexical slice (what source-tooling spans cover, see below) is the full `"theme song.mp3"` including both quote delimiters. The compiler alone owns decoding from one to the other.

**Exact escape table (LOCKED) — deliberately narrower and path-safer than the expression lexer.** Inside a double-quoted Presentation positional token, exactly two sequences receive semantic decoding: `\"` → `"` and `\\` → `\`. **No other escape sequence is decoded.** For every other `\X`, **both authored characters are preserved literally and semantically** — `\n` decodes to the two characters `\` and `n` (not a newline), `\U` decodes to `\` and `U`, and so on. There is no invalid-escape diagnostic, because no backslash sequence is ever rejected — every `\X` is well-defined (either one of the two recognized escapes, or a literal two-character passthrough). Determinism is by exact left-to-right sequential scanning only — never a post-hoc regex replacement, never recursive/multi-pass escape processing — so cases like `\"`, `\\`, and `\\\"` (interpreted strictly left to right: `\\` then `\"`) all have one unambiguous result. **Windows path contract, the primary motivating case**: `@music "C:\Users\alice\music.mp3"` decodes unchanged to `C:\Users\alice\music.mp3` — ordinary Windows path backslashes never require doubling; only a backslash the author specifically wants to encode via the `\\` escape pair needs doubling. A bare backslash in an *unquoted* Presentation token remains ordinary authored content, completely unchanged from today.

**Escaped-delimiter and escaped-backslash examples (LOCKED).** `@music "a\"b.mp3"` decodes to semantic `a"b.mp3`. `"foo\\bar"` decodes the recognized `\\` pair to one semantic backslash (`foo\bar`). Internal whitespace and tabs inside a quoted token are semantic token content, never separator trivia (`"theme   song.mp3"` preserves all three internal spaces); whitespace *between* argument tokens outside quotes remains ordinary separator trivia with existing, unchanged semantics. Literal Unicode (Korean, Japanese, emoji) inside a quoted value decodes unchanged, exactly as literal Unicode already works everywhere else in this grammar — no `\uXXXX` escape syntax is added or needed.

**Empty and whitespace-only quoted values (LOCKED).** `@music ""` produces one positional token whose decoded semantic value is `""`; `@music "   "` preserves the spaces unchanged (quoted contents are never `.trim()`-ed semantically). No new domain validation (e.g. rejecting an empty asset path) is introduced by this expansion — existing command/domain behavior alone decides whether the resulting semantic value is otherwise acceptable, exactly as today.

**Single physical line only; unterminated quote (LOCKED).** Presentation directives are always single physical lines by existing parser structure, so a quoted token can never span lines — an opening `"` not closed before end-of-line is an unterminated quoted argument, not an attempt at a multiline string. **Reuses the existing `AT1301` (`malformedPresentation`) with a specific reason** (e.g. "unterminated quoted argument") — no new diagnostic code, matching the established one-code-many-reasons convention already used by `AT1301`/`AT1302` elsewhere in this document. Diagnostic span: from the opening quote through the end of that physical directive line — the most precise, useful range, using ordinary authored UTF-16 offsets throughout (never decoded-string length). Recovery: that one `PresentationNode` is not produced (dropped, exactly like every other malformed-directive case via the existing `fail(reason)` pattern); parsing of subsequent physical lines continues completely normally — no multiline recovery of any kind is needed or introduced.

**Internal tokenizer design (LOCKED decision — internal only, no public API).** The existing internal Presentation argument tokenization (`tokenizePresentationArgs`'s already-internal `ArgsTextToken`-shaped scan) is extended in place with a small deterministic single-pass scanner — conceptually: skip separator whitespace; if the current character is `"` at a recognized token boundary, scan one quoted token (decoding `\"`/`\\`, preserving every other `\X` literally) through to its closing quote or line end; otherwise scan an ordinary token through to the next separator whitespace exactly as today. **A regex-only approach (e.g. `/\S+|"[^"]*"/g`) is explicitly rejected** — it cannot express escape decoding, precise unterminated-quote diagnostics, or exact recovery spans. No public lexer API and no exported quoted-token type are introduced; any internal token representation (raw range, existing named/positional classification, a decoded value for a quoted positional token, an optional internal `quoted` flag) stays private to `blocks.ts` — exact field names are implementation-local. **`tokenizePresentationArgs` remains the single lexical source of truth** for both Presentation semantic parsing and every Presentation source-tooling metadata field — this expansion extends that one function in place; it does not create a second, quote-aware pass alongside the existing regex-based metadata scan.

**Positional semantic assembly unchanged; mixed quoted/unquoted tokens accepted as-is (LOCKED).** The existing behavior — multiple positional tokens joined semantically with one canonical ASCII space — is fully preserved; no new positional-arity restriction is introduced by this expansion. Unusual but grammatically valid source such as `@music prefix "theme song.mp3"` therefore remains allowed, producing the joined semantic value `prefix theme song.mp3` under existing joining semantics — this is documented here as accepted existing grammar behavior, not a recommended or endorsed authoring style, and no new arity diagnostic is added merely because quoting now exists.

**Source-tooling metadata impact (LOCKED contracts).** `positionalValueSpan` and `contiguousPositionalSpan`, for a quoted positional token, cover the **full authored lexical token including both quote delimiters** (e.g. slicing exactly `"theme song.mp3"`, not `theme song.mp3`) — required for exact raw-source round-tripping by source-editing tools; internal quoted whitespace never breaks contiguity, and the existing "a named token interleaved between positional tokens breaks the contiguous run" rule is completely unchanged. `parameterValueSpans`/`parameterRemovalSpans` are unaffected in contract (named-value quoting is deferred; quoted internal whitespace is never mistaken for argument-separator whitespace). `argumentsEndPosition` is unaffected in contract — for a final quoted token it is simply the position immediately after that token's closing quote, computed exactly as today (from `argsText.trimEnd().length`, after tokenization, with no new quote-structure re-scan). `commandRemovalSpan` and `PresentationNode.span` are both completely unchanged — both are physical-line-based facts, entirely independent of argument lexical structure.

**Runtime/Renderer semantic values (LOCKED).** Compiler semantic AST fields receive fully decoded values — `@background "night city.png"` → `image === "night city.png"`; `@layer "alice happy.png"` → `image === "alice happy.png"`; `@music "theme song.mp3"` → `track === "theme song.mp3"`; `@sfx "door knock.wav"` → `clip === "door knock.wav"`; an escaped case like `@music "a\"b.mp3"` → `track === 'a"b.mp3'`. Runtime/Player/Web Renderer receive only these already-decoded semantic strings, exactly as they already receive `image`/`track`/`clip` today — they never see quote delimiters and never strip them; no Runtime/Player/Web Renderer source changes are introduced or required.

**No public compiler AST impact (LOCKED).** No new field is added to `PresentationNode`, `PresentationCommand`, or any other public semantic AST type — no `quoted: boolean`, no `rawValue: string`, no other source-syntax flag on any semantic node. Source spans and raw source slices (already sufficient for every prior source-tooling feature in this line) remain sufficient for source-editing tools here too.

**Explicit deferred scope (this expansion).** Named quoted values (`key="foo bar"`); special quoted-numeric support; single-quoted Presentation arguments; multiline quoted strings; string interpolation (`${...}`, `{memory...}`, or any templating); Unicode escape syntax (`\uXXXX`); a generic cross-directive quote lexer shared by non-Presentation directive families; automatic quoting or escaping by tools; AST→source serialization; everything already listed in the base and prior-expansion deferred-scope paragraphs above.

---

# 15. Markdown

Status: LOCKED architectural rule

Markdown is used for prose.

AfterText does not reimplement the complete Markdown grammar.

External Markdown parser types remain compiler-internal.

Unsupported constructs should degrade gracefully where reasonable, but the compiler must emit diagnostics instead of silently changing author intent.

---

# 16. Diagnostics

Status: LOCKED

Compiler diagnostics have:

```text
severity
code
message
SourceSpan
```

Ordinary invalid author input should produce diagnostics rather than exceptions.

Current diagnostic families include:

```text
AT1000  structural / scene / directive
AT1100  variant
AT1200  initial state / frontmatter
AT1300  presentation
AT2000  expression
AT3000  Markdown compatibility
```

Diagnostic numbering should remain stable once publicly released.

The `DiagnosticCode` type currently contains exactly the codes below. Existing codes keep their meaning; numbers are grouped by concern (1000s structural, 1100s variants, 1200s frontmatter, 1300s presentation, 2000s expressions, 3000s Markdown). "Parser" means raised while parsing; "Validation" means raised by the post-parse validation pass.

| Code | Severity | Meaning | Raised in |
|---|---|---|---|
| `AT1001` | error | Unknown directive. | Parser |
| `AT1002` | error | Unclosed block: missing matching `@end`. | Parser |
| `AT1003` | error | Duplicate scene id. | Validation |
| `AT1004` | error | Reference to an unknown scene (goto, choice target, or entry). | Validation |
| `AT1005` | error | Malformed choice item: bullet line with no `->` target, or an invalid target tail. | Parser |
| `AT1006` | error | A conditional branch appears after `@else`; `@else` must be last. | Validation |
| `AT1101` | error | Duplicate variant id. | Validation |
| `AT1102` | error | Variant has no `@when` branch. | Validation |
| `AT1103` | error | Reference to an unknown variant (for example a Reader Memory query argument). | Validation |
| `AT1104` | error | A variant branch appears after `@otherwise`; `@otherwise` must be last. | Validation |
| `AT1201` | error | Unsupported initial-state entry: either a value that is not a string, number, boolean, or null (arrays, nested maps, aliases, a non-map `state`), or an unsupported key (Section 12). The entry is excluded from the initial state. | Parser |
| `AT1202` | error | Invalid frontmatter: a YAML syntax error, including duplicate keys. | Parser |
| `AT1301` | error | Malformed presentation directive. | Parser |
| `AT1302` | error | Presentation numeric value is not representable as a finite number. | Parser |
| `AT2001` | error | Malformed expression. | Parser |
| `AT2002` | error | Unknown builtin call name. | Validation |
| `AT2003` | error | Wrong argument count for a known builtin. | Validation |
| `AT2004` | error | Reader Memory builtin argument is not a string literal. | Validation |
| `AT2005` | error | Expression numeric literal is not representable as a finite number. | Parser |
| `AT3001` | warning | Unsupported Markdown construct; the text falls back to plain text. | Parser |

`AT3001` is the only warning; all other codes are errors. `CompileResult.hasErrors` is `true` when at least one diagnostic has severity `error`; the compiler still returns a best-effort `document`.

Verification: `test/frontmatter.test.ts`, `test/frontmatter-state-keys.test.ts`, `test/choice.test.ts`, `test/conditional.test.ts`, `test/variant.test.ts`, `test/numeric-hardening.test.ts`, `test/markdown-diagnostics.test.ts`.

---

# 17. Runtime Principles

Status: LOCKED concepts / PROVISIONAL API

The runtime domain foundation (state shape) is implemented in `@aftertext/runtime`. Narrative execution — condition evaluation, Variant branch resolution, scene navigation, choice execution — has not been implemented yet.

`@aftertext/runtime` depends on `@aftertext/compiler`'s public types only (e.g. `StoryDocument`, `StateValue`) — it requires no compiler executable code at runtime. This is a specific instance of the general compiler/runtime boundary in Section 4.5 and should hold for future packages as well: prefer a type-only dependency on the compiler unless a package genuinely needs to invoke `compile(...)` itself.

## 17.1 Narrative Use Cases

The runtime must be designed against concrete narrative behavior, not designed abstractly first. The following scenarios are the basis for the v0 runtime domain model.

### 1. State-dependent narrative

A reader action may change the current fictional world state.

Example:

```text
reader chooses:
"Look through the window"

StoryState:
saw_window = true
```

Later narrative may depend on that state. This belongs to `StoryState`.

### 2. Variant resolution

A stable Variant may resolve to different branches depending on current `StoryState`.

Example:

```text
variant: alice-status

timeline == 0
    "She died that night."

timeline == 1
    "She disappeared that night."

timeline >= 2
    "Nothing happened that night."
```

Variant remains a first-class AfterText concept.

### 3. Retroactive change detection

The runtime must eventually be able to determine that the reader previously saw a different branch of the same Variant.

Example:

```text
previously seen:
alice-status -> alice-status:0

current resolution:
alice-status -> alice-status:1
```

Conceptually:

```text
changedSinceRead == true
```

This is a core AfterText capability.

### 4. Story world and reader memory may disagree

The current fictional world and reader experience are distinct domains.

Example:

```text
StoryState:
apartment = 703

ReaderState:
the reader previously experienced content implying apartment = 704
```

The locked architectural requirement remains (Section 3):

```text
StoryState != ReaderState
```

### 5. Scene revisits

The runtime must know whether a scene was previously entered and how many times it has been entered.

Authors should not need to manually maintain bookkeeping variables for this. Scene visit information belongs to `ReaderState`.

### 6. Historical reader actions may later matter

A future story may need to know that the reader actually selected:

```text
"Go to apartment 704"
```

even if a rewritten world now presents the corresponding event as:

```text
"Go to apartment 703"
```

This may eventually require a narrow reader-action log. This is not required for the initial runtime foundation. Do not introduce a generic `History` subsystem solely for this possibility.

### 7. Runtime state must be serializable

The runtime model must eventually support save/load. Persistable runtime state should therefore use deterministic, serializable data structures.

Avoid requiring persisted state to contain:

```text
Map
Set
Date
class instances
closures
browser objects
functions
```

Persistence implementation itself is a later concern.

### 8. Identical StoryState may produce different reader experiences

Two readers may have identical current `StoryState` while having different `ReaderState`.

Example:

```text
Reader A previously saw:
alice-status:0

Reader B only ever saw:
alice-status:2
```

Future narrative or presentation may use that difference. The author-facing syntax for querying reader memory is now locked for its first slice — see Sections 17.14–17.19.

## 17.2 v0 Runtime Scope

Status: LOCKED architectural direction

Required for the v0 runtime foundation:

```text
StoryState
ReaderState
NavigationState
scene visit tracking
VariantMemory
serializable RuntimeState
```

Expected later runtime behavior (not yet implemented):

```text
state-dependent condition evaluation
Variant resolution
changed-since-read detection
```

Deferred — no speculative infrastructure should be built for these:

```text
generic History
event sourcing
undo/time-travel infrastructure
full choice-action history
author-facing reader-memory expressions
reader-memory-driven presentation effects
```

**Readonly-state clarification (type-contract hardening, no behavior change):** the six semantic-state types above — `RuntimeState`, `StoryState`, `ReaderState`, `NavigationState`, `SceneVisitMemory`, `VariantMemory` — now encode this section's and Section 17.5's already-locked immutable-update contract at the type level: every property is `readonly`, and `StoryState`/`ReaderState`'s nested maps are `Readonly<Record<...>>`. This closes a gap between the implementation (already pure/immutable) and its public types (previously mutable-looking); it does not change execution semantics, and `ExecutionCursor`/execution result/error types were already fully `readonly` beforehand.

## 17.3 Runtime Domains

Definitions:

### StoryState

Current truth of the story world. Flat, JSON-serializable key/value state, seeded from the compiler's `StoryDocument.initialState`.

### ReaderState

Facts about what the reader has experienced: scene visit memory and Variant memory. Does not include world truth.

### NavigationState

The reader's current reading position. Neither world state nor reader memory.

### VariantMemory

Which stable content Variant branches the reader has previously seen. Nested inside `ReaderState` — not an independent top-level runtime state (Decision B).

### History (deferred)

A hypothetical future narrow log of reader actions — not a generic event-sourcing subsystem. Not implemented in v0 (Decision D).

Do not collapse StoryState and ReaderState into one state object.

## 17.4 Locked Runtime-Domain Decisions

Status: LOCKED

### Decision A — StoryState and ReaderState are separate top-level domains

```text
StoryState != ReaderState
```

### Decision B — VariantMemory belongs inside ReaderState

It is not an independent top-level runtime state.

### Decision C — Resolving narrative content does not mean the reader experienced it

```text
resolve != seen
```

For example, a function resolving a Variant's current branch must not automatically mutate reader memory. The reader experience must be recorded by a separate operation after the content is actually presented/experienced. This boundary matters because a renderer may resolve content before the reader scrolls to it or actually sees it.

### Decision D — Do not introduce a generic History abstraction in v0

If historical reader actions become necessary later, begin with the narrowest concrete domain abstraction, likely something similar to:

```text
ReaderActionLog
ChoiceRecord
```

rather than a generalized event log.

### Decision E — Do not add generic block-level reader memory in v0

The compiler currently provides stable author identity for scenes and Variants. Ordinary prose blocks do not currently have a guaranteed author-stable identity suitable for long-lived save data.

Therefore do not introduce:

```text
seenBlocks
```

using source offsets, block indexes, or generated unstable identifiers. Do not modify the compiler merely to create block IDs for this purpose.

## 17.5 Narrative Execution Model

Status: LOCKED

This section defines how the runtime turns a compiled `StoryDocument` into a sequence of observable steps, without implementing that execution yet.

### Recommended model: pull-based, pure transition functions

The consumer (a renderer, a test, a future session wrapper) asks the runtime for the next meaningful result:

```text
result = advance(document, runtimeState, cursor)
```

`advance` is a **pure function**: given the same three inputs it always returns the same `{ result, runtimeState, cursor }` output, and it never mutates its arguments. There is no hidden engine object, no callback registration, and no asynchrony.

### Alternatives considered and rejected

| Model | Why rejected |
|---|---|
| Push/event model (runtime calls consumer callbacks) | Cannot cleanly express "pause here, possibly for a long time, possibly across a reload, until the consumer decides to proceed" — callbacks are for notification, not for suspend/resume. |
| Async generator (`async function*`) | Nothing here is genuinely asynchronous (no I/O, no timers). Forcing `await` on every step adds ceremony for a deterministic, synchronous computation and invites confusing that "waiting for the reader" is the same kind of wait as "waiting for a network response." |
| Mutable `StoryEngine` with callbacks | Collapses "what happened" (a value) with "who gets notified and when" (control flow) into one stateful facade, exactly what Sections 20–21 of this task warn against. Hard to test in isolation; hard to keep pure. |
| Plain (non-async) JS generator (`function*`) as the *only* representation | Attractive for one reason: nested block position (inside a `@if`/`@variant` branch) falls out of the JS call stack for free via `yield*`. Rejected as the *public contract* because a suspended generator's position cannot be inspected or serialized — it would foreclose ever safely persisting a suspended position (Section 17.10). It may still be a reasonable *internal implementation detail* of `advance`, as long as the position it represents is also expressible as plain data at every suspension boundary. |

### Why pull-based pure functions fit AfterText specifically

* Matches the existing runtime foundation exactly: `createRuntimeState`, `recordSceneVisit`, `recordVariantSeen` are already pure, immutable-update functions. Execution should not be the one part of the runtime that breaks that style.
* `RuntimeState` is required to be JSON-serializable at rest (Section 17.2); a pure step function that returns a fresh `RuntimeState` at every suspension makes "the state right now" trivially inspectable and snapshottable, with no hidden engine internals to reconcile.
* A pull-based boundary is naturally testable: a test calls `advance` repeatedly and asserts on the sequence of results, with no fake timers, no mocked callbacks, no event bus.

## 17.6 Automatic Execution and Suspension

Status: LOCKED

Executing a scene means walking its blocks in source order. Some constructs run to completion without any external input ("automatic"); others must hand control back to the consumer ("suspend") before execution continues.

| Construct | Automatic? | Suspends (category) | Changes `StoryState` | Changes `ReaderState` | Changes `NavigationState` |
|---|---|---|---|---|---|
| `ParagraphNode` | no | `content` | no | indirectly¹ | no |
| `HeadingNode` | no | `content` | no | indirectly¹ | no |
| `PresentationNode` | no | `presentation` | no | indirectly¹ | no |
| `SetNode` | yes | no | yes | no | no |
| `ConditionalNode` | yes (branch *selection* only) | no, by itself | no, by itself | no | no |
| `VariantNode` | yes (branch *resolution* only) | no, by itself | no | no — resolution alone never touches `ReaderState` (17.9) | no |
| `ChoiceNode` | no | `choice` | no | indirectly¹ | no, until a selection is made |
| `GotoNode` | no — always triggers a navigation transition | `navigation` | no | no | yes, in the same transition that returns the `navigation` result |

¹ May cause `advance()` to call `recordSceneVisit`/`recordVariantSeen` — but only if this result is the qualifying *first* observable result of the current scene-entry episode and/or of a Variant occurrence it is nested inside (17.9). This is general reader-experience memory, not a defined effect of the construct itself, and never applies to `navigation`/`completed`-by-itself/automatic-only work (Conditional/Variant resolution, `@set`) the way it does here.

Notes:

* **One prose block or one presentation command = one suspension.** No batching heuristic is defined for v0: this keeps pacing entirely under the presentation layer's control (a "tap to continue" or typewriter effect operates per block) and avoids inventing an undemonstrated policy.
* **`ConditionalNode` and `VariantNode` never create an artificial scene transition.** Selecting a branch is automatic; the selected branch's own blocks are then executed *inline*, in the same walk, subject to their own rows in this table — a selected branch may itself contain any suspension-producing block (prose, presentation, a nested choice, even another goto). A `@set` or `@goto` inside an `@if` behaves exactly as it would at the top level of the scene.
* **`ChoiceNode`, once a selection is made, uses exactly the same navigation semantics as `GotoNode`** (its row above) — see 17.7.
* Reaching the end of a scene's block list with no pending `@goto`/`@choice` produces a `completed` result. This is a **normal terminal state**, not an error — a scene that ends in plain prose with no further navigation is a valid way to end a story or a branch of it.

## 17.7 Per-Construct Execution Semantics

Status: LOCKED unless noted

### `@set name = expression`

1. Evaluate `expression` against the current `StoryState` (see 17.8).
2. Produce a new `StoryState` with `name` set to the result (`{ ...story, [name]: value }`).
3. Continue automatically — no suspension.

`@set` may assign a name that does not already exist in `StoryState`; it creates it. There is no variable declaration concept in AfterText — state is flat and dynamic, matching Section 11.

### `ConditionalNode`

Evaluate `if`/`elseif` conditions in source order; the first one that evaluates `true` wins and its blocks execute inline. If none match, the `else` branch (if present) executes. If none match and there is no `else`, the conditional contributes nothing to the walk — execution simply continues with the next sibling block.

### `VariantNode`

A pure resolution operation, independent of any reader-memory mutation:

```text
resolveVariant(variantNode, context: EvaluationContext)
  -> { variantId, branchId, blocks } | undefined
```

(`context` supersedes the earlier bare `storyState` parameter — see 17.17, required once `@when`/`@otherwise` conditions can contain Reader Memory query calls.)

`@when` conditions are evaluated in source order, first match wins; `@otherwise` is the fallback. If nothing matches and there is no `@otherwise`, resolution returns nothing and the variant contributes nothing to the walk — the same graceful "no match" behavior as an else-less conditional, consistent with the compiler's own best-effort philosophy (a variant lacking a matching branch is a warning-worthy authoring situation, not a crash). **`resolveVariant` never calls `recordVariantSeen`** — see 17.9.

### `ChoiceNode`

Required model, in order:

1. Evaluate each item's optional condition against the current `StoryState`; items with no condition are always available. A condition that errors (17.8) aborts the step with that error — it does not silently exclude the item.
2. Expose only the available items: suspend with a `choice` result listing them. Items filtered out by a false condition are not included.
3. **Suspend.** Merely reaching and presenting the choice never changes `StoryState` or `NavigationState`, and never itself creates a `ChoiceRecord`, `ReaderActionLog` entry, or any other record of having selected or acted on the choice — presenting options is not itself an action. It *may*, however, change `ReaderState` through the same general exposure mechanism that applies to any other observable result: if the presented choice is the qualifying first observable result of the current scene-entry episode and/or of a Variant occurrence it is nested inside, `advance()` calls `recordSceneVisit`/`recordVariantSeen` for it exactly as it would for a `content` or `presentation` result (17.9). This is general reader-experience memory — the reader saw this scene/branch — not a record of the choice itself, and does not require or introduce a `ChoiceRecord`/`ReaderActionLog`.
4. Wait for an explicit selection operation (conceptually `selectChoice(...)`; exact naming is implementation-level), given exactly the choice suspension it resolves — the same value `advance()` returned when it evaluated this choice's conditions and produced the available-item list. The selection identifies one of the items *that suspension carries* — e.g. by position in that list. This identifier is a transient request/response correlator, never persisted: it is not a stable identity and must never be written into `ReaderState` (Decision E's constraint extends to it by the same reasoning).
5. The selection operation validates the choice it names against the items carried by the *supplied* suspension — conditions are **not** re-evaluated, and the source `ChoiceNode` is not re-located or re-consulted. A selection that does not resolve to one of those items (out of range, or otherwise not present in that suspension) is rejected as a runtime error (an invariant/precondition violation, 17.11) — it does not silently pick a fallback or ignore the call.
6. Once a valid selection is made, execution transitions toward that item's target scene using **exactly the same navigation semantics as `GotoNode`** (below): the returned `RuntimeState` already reflects the new scene, execution suspends with a `navigation` result, and `navigated != experienced` applies identically — selecting a choice does not itself touch `ReaderState.visitedScenes`.

The execution core is pure and caller-owned; it holds no global, mutable notion of "the one currently active suspension." Reusing an older — but internally valid, i.e. still accurately carrying the item set `advance()` actually returned for it — choice suspension is therefore **not**, by itself, a runtime-core error: it represents a legitimate replay or fork from that earlier runtime state, not staleness. If an application or session layer wants to permit selection only against its own latest externally-visible suspension, that freshness policy belongs to that higher layer — the pure execution core has no basis to enforce it, and does not attempt to.

Choice selection does not create reader-action history in v0: no record of *which* item was chosen, nor that a choice was specifically acted on, is kept (Decision D — no `ReaderActionLog`/`ChoiceRecord`). This is distinct from the general scene/Variant exposure memory a presented (not yet selected) choice may still contribute to — see item 3 above and 17.9.

If the available-item list is empty after filtering (every item's condition was false, or the author wrote a choice with no items), this is a runtime semantic error (17.11), not a silent skip to `completed`. An unreachable choice is very likely an authoring mistake — a dead end the author did not intend — and silently passing through it would hide a broken narrative branch rather than surface it.

### `GotoNode`

`@goto target` and a resolved choice selection (above) share one navigation rule:

* The transition that reaches the target scene **already carries a `RuntimeState` whose `navigation.sceneId` is the target** — there is no separate commit step, no `acknowledgeNavigation()`, and no hidden mutation required merely to make the change "stick." The state update and the suspension happen together, in the same `advance` result.
* That same transition's `result` is a `navigation` suspension (carrying at least the target `sceneId`, and the source, if useful) so the presentation layer can react to the scene change (e.g. scroll, transition effect) before any of the new scene's content is walked.
* Execution does not continue into the target scene's blocks within that same call — the *next* explicit `advance` begins the walk from the top of the target scene. See 17.12 for why this suspension is the load-bearing decision for infinite-loop protection.
* **`navigated != experienced`.** Changing `NavigationState.sceneId` — whether from `@goto` or from a resolved choice — must never automatically modify `ReaderState.visitedScenes`. Scene experience remains recorded only through the existing, explicit `recordSceneVisit` (17.9). This is the navigation-specific instance of the same boundary already established for Variants: internal execution progress is not, by itself, reader experience.

## 17.8 Expression Evaluation

Status: LOCKED

A pure evaluator for the compiler's existing `ExpressionNode` (`Literal`, `Identifier`, `Unary`, `Binary`, and — since 17.14 — `Call`) against an evaluation context (17.17). The governing principle: **explicit, deterministic rules — never implicit JavaScript truthiness or coercion.** Every rule below is a deliberate design decision, not "whatever `+`/`==`/`!` happen to do in JS." (`Call` expressions, specifically Reader Memory query builtins, are defined separately in 17.14–17.17; the rules below otherwise apply unchanged.)

### Unknown identifiers are a runtime error

Reading a variable that does not exist in `StoryState` is a runtime semantic error — it does **not** evaluate to `null`.

A misspelled variable such as `saw_preson` must not silently behave as a false-like value when the author meant `saw_person`. `null` remains a valid, explicit `StoryValue` (an author can `@set` it deliberately); *absence* of a variable and an explicit `null` value are not the same thing, and conflating them would hide typos as quiet always-false conditions.

### Boolean contexts require an actual boolean

Every condition — `@if`/`@elseif`, `@when`, a choice item's `if`, and the operands of `!`, `&&`, `||` — must evaluate to an actual `boolean`. **No truthiness of any kind is applied.** Each of the following, used directly as a condition or logical operand, is a runtime error: `null`, `0`, `1`, `""`, `"text"`, or any other non-boolean value. There is no "falsy" or "truthy" value in AfterText — only `true`, `false`, and everything else is a type mismatch.

`&&` and `||` still short-circuit (the right operand is not evaluated once the left already determines the result) — this is ordinary control flow, unrelated to coercion, and matters because an unevaluated branch should not surface an error of its own.

### Cross-type equality never errors

`==` and `!=` may compare values of different `StoryValue` types without throwing:

| Comparison | Result |
|---|---|
| Same type, equal value (including `null == null`) | `==` → `true`, `!=` → `false` |
| Same type, different value | `==` → `false`, `!=` → `true` |
| Different types (e.g. `1 == "1"`, `null == false`) | `==` → `false`, `!=` → `true` |

Equality is well-defined for any two values regardless of type — "are these the same thing" is trivially no if the types differ — unlike arithmetic or ordering, which are meaningless across mismatched types (below). This lets an author write `@if favorite_color == "blue"` without first proving `favorite_color` is a string. **Never use JavaScript's coercive `==`** (which would make `1 == "1"` true) — types are compared as-is; only same-type, same-value pairs are equal.

### Arithmetic and ordering operate on numbers only

`+ - * / %` (binary), unary `-`, and `< <= > >=` all require **every** operand to be a `number`. Any other operand type — including `string`, `boolean`, or `null` — is a runtime error (type mismatch). There is no implicit number/string conversion in either direction: `+` never performs string concatenation in v0, and a `number` is never coerced to/from `boolean` or `string`. No string ordering is defined for v0 either — nothing in the current language surface demonstrates a need for it.

`/` and `%` by zero are a runtime error — **not** `Infinity`/`NaN`. More generally, **the result of any arithmetic operation must remain representable as a valid JSON number**: `NaN` and `Infinity` are technically the JS `number` type but are not valid `StoryState` results (`JSON.stringify(NaN) === "null"`, silently corrupting a serialized `RuntimeState`). Division/modulo by zero is the practical case most likely to produce one, but the rule is general — any operation that would otherwise yield `NaN` or `Infinity` is a runtime error instead.

## 17.9 Reader Memory Integration: Scene Visits and Variant-Seen

Status: LOCKED

`resolve != seen` (Decision C) governs Variant resolution, and the same reasoning governs navigation as `navigated != experienced` (17.7). Resolving a Variant branch (`resolveVariant`) or reaching a scene (`GotoNode`, a resolved Choice selection) is never itself reader experience. `resolveVariant` remains pure and must never call `recordVariantSeen`; `navigateTo`/a resolved Choice selection must never call `recordSceneVisit`. Recording is a separate, explicit concern, precisely defined below.

**Layer: `advance()` performs both recordings.** This was previously left PROVISIONAL; it is now LOCKED. `advance()` is the only layer that knows, at the moment it commits a result, whether that result is the qualifying first observable output of the current scene-entry episode and/or of a given Variant occurrence — no external consumer can reconstruct this from `advance()`'s public return value alone (`ExecutionResult` and the opaque `ExecutionCursor` expose no scene-entry or Variant-provenance identity). No stateful session wrapper is introduced or required for this. Both recordings remain pure: `advance()` folds their result into the `ReaderState` it returns as part of a fresh `RuntimeState`, exactly as it already folds `StoryState` updates from `@set` — no input is ever mutated. `resolveVariant`, `navigateTo`, and `selectChoice` are unchanged by this and still never call either function directly.

### Scene visit rule

A scene visit represents one **scene-entry episode**: the span from arriving at a scene (the initial entry, a `@goto`, or a resolved Choice selection) up to the next navigation away from it. `recordSceneVisit` fires **exactly once per episode**, the first time that episode produces one of:

* `content`
* `presentation`
* `choice`

or an immediate `completed` if the scene (or its remaining automatic-only content) produces nothing else first. It does **not** fire for `navigation`, a runtime error, or automatic work alone (`@set` execution, Conditional resolution, Variant resolution) — none of these are, by themselves, something the reader observed.

Consequences:

* A scene whose first block is `@goto` produces only `navigation` and is therefore **not** recorded as visited — an immediate-Goto scene is a pure redirector, never shown to the reader.
* An empty scene, or a scene whose only content is automatic work matching nothing, reaching `completed` **is** recorded — reaching that terminal state is itself the scene's (content-free) observable outcome.
* Multiple observable suspensions within the same episode (e.g. several paragraphs shown across several `advance()` calls while the reader stays in the scene) record only once, on the first of them.
* A later, genuine re-entry into the same scene (a fresh navigation back into it) begins a new episode and increments `visitCount` again.
* `selectChoice()`/`navigateTo` never record anything themselves — they only ever produce `navigation`. The target scene becomes visited only once a subsequent `advance()` call produces a qualifying result from it. Replaying an older, internally valid choice suspension (17.7) is unaffected by this and remains legitimate fork/replay behavior — it requires no global freshness state.

### Variant-seen rule

Resolving a Variant selects a branch; that alone is not reader experience. A particular Variant resolution — one specific occurrence of a branch being selected — is recorded exactly once, the first time execution produces one of:

* `content`
* `presentation`
* `choice`

**from inside that selected branch**, including from a construct nested within it (e.g. a Conditional, or another Variant, inside the branch). Unlike the scene rule above, `completed` is **not** extended to Variants by symmetry, and automatic-only work never qualifies: `navigation`, `completed`, and automatic work with no further observable output (`@set`/Conditional/Variant resolution) never count as Variant experience, even when that automatic work is the branch's entire content. A branch containing only automatic work that falls through to sibling content, or that runs to the end of the scene and reaches `completed`, is therefore **not** recorded as seen — recording requires an actual `content`/`presentation`/`choice` result attributable to the branch.

A later, independent resolution of the same Variant — to the same branch or a different one — is a new occurrence and may increment `seenCount` again.

### Nested Variants

If content is exposed while more than one Variant-branch frame is active and not yet recorded — e.g. a selected branch of Variant A itself contains Variant B, whose selected branch produces the content — that one observable result counts as the qualifying first experience for **every** active, not-yet-recorded Variant occurrence it is nested inside: both A's and B's selected branch, in that example. Each occurrence is still recorded at most once; once an occurrence has been recorded, later suspensions produced from within the same still-active branch frame(s) must not record it again.

### Why this needs cursor-internal bookkeeping, not a per-call computation

A scene-entry episode or a Variant occurrence does not always produce its qualifying first result within the same `advance()` call that began the episode or made the resolution — a runtime error, or step-budget exhaustion, can occur first:

```text
enter Scene B
@set x = failing_expression
Paragraph
```

The call that pushes Scene B's frame fails on the `@set` before any observable result; the returned cursor is non-empty. A later call resuming from it and eventually exposing `Paragraph` must still recognize this as the same, still-unrecorded episode. The same applies to a Variant occurrence:

```text
@variant mood
  branch happy
    @set x = 1
    @set y = failing_expression
    Paragraph
```

If resolution enters `happy` and then errors before `Paragraph`, a later `advance()` resuming from the returned cursor must still know that `Paragraph` belongs to that same, still-unrecorded `mood`/`happy` occurrence.

Because of this, whether an episode or occurrence has already been recorded cannot be determined by a computation confined to a single `advance()` call, and specifically cannot be reduced to checking `cursor.length === 0` at call start. The ephemeral `ExecutionCursor` may therefore carry the minimum internal metadata necessary to answer, across calls: has the current scene-entry episode already recorded its visit, and — per active Variant-branch frame — which `variantId`/`branchId` it corresponds to, and whether that occurrence has already been recorded. This metadata is runtime-only, ephemeral, never written into `ReaderState`, never persisted, and remains opaque to consumers exactly as the rest of `ExecutionCursor` already is (17.10). This is not a reintroduction of speculative plumbing rejected in an earlier pass — Reader Memory integration is what now makes it a concrete, required need rather than a hypothetical one. Its exact representation (e.g. a per-frame `seenRecorded` flag alongside a resolved branch's `variantId`/`branchId`) is an implementation-level decision, not fixed here.

## 17.10 Execution Cursor and Persistence

Status: LOCKED for v0 scope / explicitly UNRESOLVED for cross-session mid-scene resume

Walking a scene's nested blocks (inside `@if`/`@variant` branches) requires tracking a position deeper than `NavigationState.sceneId` alone. This position — the **execution cursor** — exists separately from `RuntimeState` and is **ephemeral interpreter state for v0, not persisted.**

**Execution structural position is not the same kind of thing as reader-memory identity, and the two must not be conflated:**

* The execution cursor answers "where inside this scene's block tree is the walk right now" — a concern of the interpreter alone, needed only to resume `advance()` correctly within an in-memory session.
* `ReaderState` identity (scene ids, Variant branch ids) answers "what should a save file remember about the reader, potentially for a very long time, potentially across the author editing the story." Decision E forbids unstable, source-derived identifiers (block indexes, offsets) here specifically because saved data must outlive incidental changes to the document's structure.
* Because the cursor is ephemeral and never written to persisted state, **block indexes or a structural path (e.g. "block 2, inside its selected branch, block 0") are an acceptable internal representation for it** — the instability that makes such a scheme unacceptable for `ReaderState` (Decision E) simply does not apply to something that is never saved. Nothing about this section relaxes Decision E for `ReaderState`/`seenBlocks`; it only clarifies that the constraint was never about the cursor in the first place.
* `NavigationState.sceneId` is not being changed by this design task (explicitly out of scope) and remains the only *persisted* position.
* Reader Memory integration (17.9) is a second, concrete case of the same allowance: the cursor may additionally carry ephemeral scene-entry/Variant-occurrence bookkeeping (whether the current episode's visit, or a given active branch frame's seen-status, has already been recorded) needed only to make `recordSceneVisit`/`recordVariantSeen` correct across multiple `advance()` calls — e.g. after a progressive error or step-budget exhaustion. The same constraint applies: acceptable specifically because it is never persisted and never written into `ReaderState`.

**Open question, deliberately left unresolved:** if a session is saved while suspended *mid-scene* (after some but not all of a scene's automatic blocks have run) and later resumed, the only safe replay starting point without a cursor is the top of the current scene — but naively replaying already-executed `@set` statements would double-apply their effects (e.g. `@set counter = counter + 1` would increment twice). This is a genuine, unresolved correctness gap, not a decision made and hidden. It does not need to be solved before implementing the execution core, but must not be silently papered over by claiming full mid-scene resume works when it does not. Solving it (a real checkpoint/cursor persistence design, or an authoring convention around scene granularity) is FUTURE work, out of scope for this design pass.

## 17.11 Runtime Errors

Status: LOCKED principle / PROVISIONAL shape

Runtime execution errors are a distinct concern from compiler `Diagnostic`s (Section 16) — different producer, different audience, different lifecycle — and this design does not introduce a diagnostics framework for them. Two categories:

1. **Author/story semantic errors** — the compiled story, combined with actual runtime data, asks for something undefined: an unknown identifier, a non-boolean used as a condition, a type mismatch in arithmetic/ordering, division/modulo by zero, or a `ChoiceNode` with no available items.
2. **Invariant/precondition violations** — something outside the story's own narrative logic is wrong: a `@goto`/choice target that does not resolve to a real scene (the execution layer assumes it is given a `StoryDocument` with `CompileResult.hasErrors === false`; running a document with unresolved compiler errors is unsupported), or a consumer calling `selectChoice` with an index that is not part of the supplied choice suspension's item set.

An **execution-step limit exceeded** error (17.12) is a third, distinct case: neither a story mistake nor a contract violation, but a protection mechanism tripping.

The exact error type/shape is FUTURE work (not designed here) but should stay narrow — likely a small discriminated union carrying a category and a message, not a code registry mirroring the compiler's `Diagnostic`.

**Runtime execution is progressive, not transactional.** If `advance()` successfully completes one or more automatic operations (e.g. a `@set`, a matched conditional/Variant branch selection) before a later operation in that same call fails, the already-completed operations remain reflected in the returned `RuntimeState`/cursor — the whole `advance()` call is **not** rolled back. Only the operation that actually failed leaves no effect of its own. For example, given

```text
@set a = 1
@set b = 2
@set c = 10 / 0
```

with no suspension between them, a failure on the third leaves `a` and `b` set, leaves `c` untouched, and returns the runtime error anchored at that third operation. This is the natural behavior of a step-by-step walk that reflects each completed unit of work as it goes — matching how state already visibly progresses through automatic operations on the way to an ordinary successful suspension — not a rollback/transaction mechanism, which this design does not introduce.

## 17.12 Infinite-Loop Protection

Status: LOCKED

Two independent layers, not one:

1. **Structural: `GotoNode` always suspends** (17.7). Because a scene's block tree is finite and the language has no looping construct of its own, walking *within* one scene between suspensions is inherently bounded by that scene's (finite) AST. The only way execution could otherwise cross scene boundaries without limit — e.g. `scene A -> scene B -> scene A -> ...` — is if `@goto` continued automatically into the next scene's blocks without returning control first. Making `@goto` a suspension point removes that possibility by construction: a single call to `advance` can never itself traverse more than one scene.
2. **A hard step-count backstop.** The budget applies to *automatic internal work performed during a single `advance` call, before it reaches a suspension point* — e.g. a `@set` evaluation, a conditional branch selection, a Variant branch resolution, or descending into a selected branch's blocks ("nested inline execution"). Reaching any suspension point (`content`, `presentation`, `choice`, `navigation`, `completed`) ends that `advance` call and, with it, resets the budget — the count is per-call, not cumulative across a whole reading session. If the count of automatic steps exceeds a fixed limit before any suspension point is reached, the interpreter raises an "execution-step limit exceeded" runtime error rather than hanging. This exists for defense in depth — a pathologically large or degenerate scene (not an infinite loop, just a very large finite one) — and as a backstop against the structural argument in (1) turning out to have a gap. No timers, no concurrency: a plain counter compared against a constant, fully deterministic and trivially testable. The architectural requirement is that this deterministic finite guard exists; the specific numeric limit is an implementation detail to be chosen later, not a value this document commits to. Exhaustion follows the same progressive rule as any other runtime error (17.11): all automatic work already completed earlier in that `advance` call remains reflected in the returned state; only the operation that could not begin because the budget ran out is not executed.

A caller that mechanically calls `advance`/`next()` in an unattended loop across *many* suspensions (e.g. an "auto-skip" feature looping through repeated `navigation` results) can still loop indefinitely across many calls — that is the caller's own control flow, not a runtime hang, and is out of scope for the runtime to prevent.

## 17.13 Public API Direction

Status: PROVISIONAL (principle is LOCKED: no `StoryEngine` facade; shapes/names are not final)

The durable commitment is: a small set of pure functions is the source of truth, mirroring the existing `createRuntimeState`/`recordSceneVisit`/`recordVariantSeen` style. Illustrative sketch (not to be implemented from this task):

```ts
function advance(
  document: StoryDocument,
  runtimeState: RuntimeState,
  cursor: ExecutionCursor
): ExecutionStep;

function selectChoice(
  document: StoryDocument,
  suspension: ExecutionStep, // the step advance() returned whose result was "choice" — not separately-supplied state/cursor
  index: number
): ExecutionStep;

interface ExecutionStep {
  runtimeState: RuntimeState;
  cursor: ExecutionCursor;
  result: ExecutionResult; // content | presentation | choice | navigation | completed
}
```

`ExecutionCursor` is treated as an opaque value the consumer stores and passes back — its internal shape is intentionally not committed to yet (17.10).

`selectChoice` takes the exact suspension it resolves, rather than separately-supplied `runtimeState`/`cursor`, so a selection is always validated against the item set that specific suspension already carries (17.7) — never re-derived by re-locating or re-evaluating the source `ChoiceNode`.

Consistent with 17.7's navigation timing: when `result` is `navigation`, the `runtimeState` returned in that *same* `ExecutionStep` already has the new `sceneId` — there is no separate acknowledgement call. The consumer simply calls `advance` again (with that returned `runtimeState`/`cursor`) to begin walking the target scene.

A small, optional stateful "session" wrapper *may* be offered purely for ergonomics (so a consumer does not have to thread `runtimeState`/`cursor` through every call by hand), but it must be a thin, mechanical pass-through with no independent narrative logic of its own — not a `StoryEngine`. Whether to build that wrapper at all, and its exact shape, is left to the implementation task. In practice, this ergonomic need is now addressed one layer up by `@aftertext/player`'s `PlayerState`/`advancePlayer`/`selectPlayerChoice` (Section 18) — still pure functions, not a stateful wrapper inside this package — which reduces the likelihood that `@aftertext/runtime` itself ever needs its own session wrapper.

`selectChoice` is kept as a separate method from the no-argument continuation, rather than one `next(input?)`, so a consumer cannot accidentally supply (or omit) input for the wrong kind of suspension.

## 17.14 Reader Memory Query Expressions: `CallExpression` Primitive

Status: LOCKED

Adds a fifth `ExpressionNode` variant:

```ts
interface CallExpression {
  readonly type: "Call";
  readonly callee: string;
  readonly args: readonly ExpressionNode[];
  readonly span: SourceSpan;
}
```

`ExpressionNode` is now `Literal | Identifier | Unary | Binary | Call`.

This is a **syntax/AST primitive only**. It does not introduce: user-defined functions, arbitrary/dynamic function calls, callable values, member access (`.`), indexing (`[...]`), lambdas, or a general standard library. Only a small, fixed, compiler-approved set of builtin names may ever execute (17.15). An unknown call name is a semantic error (17.16) — never silently accepted, and never treated as a `StoryState` identifier lookup. Call-name resolution and `StoryState` identifier resolution are two entirely separate semantic namespaces (17.15).

**Parsing**: conventional call syntax, `name(...)`. Arguments are parsed as ordinary, general expression syntax (comma-separated) at the AST/parser level — the `Call` node itself does not restrict what an argument can structurally be. This keeps the AST general enough that a future builtin with a different argument contract does not require redesigning `CallExpression` again. The Reader Memory builtins introduced in this slice (17.15) then impose their own, much narrower semantic restriction — exactly one string-literal argument — through validation, not through the grammar: **Call syntax/AST is general; Reader Memory builtin semantics are deliberately narrow.**

## 17.15 Reader Memory Builtin Namespace and Initial Query Set

Status: LOCKED

`ReaderState` is reachable from a story expression **only** through this explicit, fixed builtin-call boundary — never as an ordinary identifier or pseudo-variable. Builtin names occupy the *call* namespace (an identifier immediately followed by `(`), entirely separate from the `Identifier` namespace `StoryState` already owns. This remains valid and unambiguous:

```text
@set visited = true
@if visited
  ...
```

while `visited("intro")` — the same word, immediately followed by a call — means the Reader Memory builtin. Bare identifiers continue to resolve only against `StoryState`, exactly as before this section.

The first slice locks **exactly** these four builtins. No convenience aliases and no additional queries are introduced in this slice:

```text
visited(scene_id) -> boolean
visit_count(scene_id) -> number
seen_variant(variant_id) -> boolean
last_seen_variant_branch(variant_id) -> string | null
```

### `visited(scene_id)`

Equivalent to the existing `hasVisitedScene` helper. A valid scene visited at least once → `true`; a valid scene never visited → `false`.

### `visit_count(scene_id)`

Equivalent to the existing `getSceneVisitCount` helper. Returns the scene's recorded `visitCount`; a valid scene never visited → `0`.

### `seen_variant(variant_id)`

A **new** pure Reader Memory query helper — `VariantMemory`'s existing shape already supports this query, so it adds no persisted state. `true` if the Variant has at least one recorded occurrence (`reader.seenVariants[variantId] !== undefined`); a valid Variant never seen → `false`.

### `last_seen_variant_branch(variant_id)`

A **new** pure Reader Memory query helper, likewise adding no persisted state: the Variant's current `lastSeenBranchId` if it has been seen; a valid Variant never seen → `null`. `null` is already a valid `LiteralValue`/`StoryValue` — no new value category is introduced.

**Argument rule (this slice only)**: all four builtins require **exactly one argument**, and that argument **must be a string literal**.

Valid: `visited("intro")`, `visit_count("intro")`, `seen_variant("mood")`, `last_seen_variant_branch("mood")`.

Not valid in this slice: `visited(scene_name)` (identifier argument), `visited("a" + "b")` (computed argument), `visited()` (wrong arity), `visited("a", "b")` (wrong arity). No dynamic/computed Reader Memory reference exists yet — deferred, not designed here.

**Deliberately deferred, not part of this slice** — the underlying memory may already contain enough information for some of these; that alone does not obligate exposing them yet:

* A builtin for the Variant's *first*-seen branch, and for its seen *count* — no concrete narrative use case motivates them yet.
* `hasVariantChangedSinceRead` as a public builtin. Its existing signature (`hasVariantChangedSinceRead(reader, variantId, currentBranchId)`) compares an explicitly *supplied* candidate branch against `lastSeenBranchId` — it was shaped for an internal caller that already has a freshly-resolved `branchId` in hand, not for an author hand-writing a compiler-generated branch-id string into prose. It remains an internal/helper-level concept for now. The same expressive power is already available compositionally, e.g. `last_seen_variant_branch("mood") != "mood:1"`. A future slice may revisit a more author-ergonomic form (e.g. one implicitly bound to "whichever `@when`/`@otherwise` this condition belongs to") — that is a materially bigger design, not decided here.
* `ReaderActionLog`/`ChoiceRecord`-backed action-history or Choice-history queries remain undesigned (Decision D, 17.9), independent of this slice.

## 17.16 Reader Memory Query Validation

Status: LOCKED

### Compile-time (primary path)

Because every Reader Memory builtin's argument is a string literal in this slice, its reference is fully knowable at compile time — the compiler must validate it, exactly as it already validates `@goto`/Choice scene targets.

* **Scene references** (`visited`, `visit_count`): the literal must name a real scene in the compiled document. A nonexistent scene is a compile-time semantic diagnostic — reuse the existing unknown-scene-reference diagnostic where appropriate (the same category `@goto`/Choice targets already produce). Forward scene references remain valid, exactly as they already are for `@goto`/Choice targets.
* **Variant references** (`seen_variant`, `last_seen_variant_branch`): the literal must name a real Variant id declared somewhere in the document. A nonexistent Variant id is a compile-time semantic diagnostic. Forward Variant references must also validate correctly: if the compiler's Variant-id collection is order-dependent (built incrementally while walking the document top to bottom), the validation pass must instead fully collect all Variant ids first, then check references — mirroring however scene ids are already collected before their own references are checked. A later Variant declaration must not make an earlier reference to it incorrectly appear invalid.
* **Unknown builtin names, wrong argument count, and a non-string-literal argument to a Reader Memory builtin** are each compile-time semantic diagnostics. An unknown call name is never treated as, or conflated with, an unknown `StoryState` identifier — they are diagnosed through entirely separate semantic checks, matching the namespace separation in 17.15.

Exact diagnostic codes/names are implementation-level and not fixed by this document, except where an existing diagnostic is explicitly reused above.

### Runtime (defensive path)

The runtime evaluator must still behave deterministically if it is ever asked to evaluate a best-effort/malformed document that bypassed compiler validation (the same standing assumption already governing `@goto`/Choice targets, 17.11). It must distinguish:

| Case | Result |
|---|---|
| Valid scene, never visited | `false` / `0` (normal value) |
| Invalid scene reference | runtime semantic/invariant error |
| Valid Variant, never seen | `false` / `null` (normal value) |
| Invalid Variant reference | runtime semantic/invariant error |
| Unknown builtin name reaching the runtime | runtime error |

An invalid reference must never be silently treated as merely "unseen" — those are different facts (an unseen-but-real scene/Variant vs. one that does not exist at all), and conflating them would hide a broken reference the same way the existing Choice/Goto validation already refuses to do. Exact `RuntimeExecutionErrorKind` names are implementation-level, unless a public-contract need forces one to be fixed here (none does).

## 17.17 EvaluationContext and `resolveVariant` Evolution

Status: LOCKED

### EvaluationContext

Expression evaluation now needs more than `StoryState`. The evaluator's shared input becomes a single, explicit, pure evaluation context:

```ts
interface EvaluationContext {
  readonly document: StoryDocument;
  readonly story: StoryState;
  readonly reader: ReaderState;
}
```

Responsibilities are strictly partitioned:

```text
StoryState identifier resolution          -> context.story    (unchanged behavior)
Reader Memory builtin values               -> context.reader   (only reachable via Call dispatch, 17.15)
Scene/Variant reference validity           -> context.document (defensive runtime checks, 17.16)
  for defensive runtime checks
```

`ReaderState` fields are never exposed as ordinary identifiers, under any circumstance. Evaluation remains pure and deterministic for the supplied context — no module-global or "current runtime" state is introduced anywhere. This context fully replaces the bare `StoryState` parameter the evaluator previously took; every recursive step of expression evaluation (unary, binary, condition, and now call) receives and threads through the same context.

### Runtime builtin execution model

Reader Memory builtins are evaluated by a small, fixed runtime dispatch table keyed by builtin name (17.15's four entries). The runtime must **not**: dynamically resolve JavaScript functions by name, invoke arbitrary functions, expose host functions, or provide any author-facing function-registration mechanism. Only the compiler/runtime-known builtins in that fixed table ever execute. `CallExpression` therefore introduces no scripting escape hatch — it is exactly as closed a primitive as `BinaryExpression`'s fixed operator set already is.

### Operator composition

A `Call`'s result is an ordinary expression value and composes with every existing operator under the already-locked strict rules (17.8) — no truthiness, logical operators require actual booleans, arithmetic/ordering require numbers, cross-type equality is defined exactly as already locked, and short-circuit evaluation is unchanged: a builtin on the unevaluated side of `&&`/`||` must not execute. For example:

```text
visited("intro") && flag
visit_count("hub") >= 2
seen_variant("mood") && last_seen_variant_branch("mood") == "mood:1"
last_seen_variant_branch("mood") == null
```

### Step budget

Evaluating a Reader Memory query introduces **no new step-budget charge point** (17.12). A `Call` node is ordinary expression-evaluation work performed inside whichever construct's existing single charge already covers its enclosing expression — `@set` evaluation, Conditional selection, or Variant resolution; Choice presentation continues to follow its existing (uncharged) rule. There is no separate per-builtin-call charge.

### `resolveVariant` public API evolution

Reader Memory queries may now appear inside `@when`/`@otherwise` conditions, so `resolveVariant` can no longer operate correctly with only `StoryState`. Its public input is explicitly evolved from the old illustrative sketch (17.7):

```ts
resolveVariant(node, story)
```

to:

```ts
resolveVariant(node, context: EvaluationContext)
  -> { variantId, branchId, blocks } | undefined
```

This is an intentional, approved public API change, not an incidental one. Rejected alternatives, specifically because each would produce ambiguous or silently incorrect Reader Memory behavior: supplying an implicit empty `ReaderState` (queries would always see "never seen," silently wrong); inspecting an overloaded parameter shape at runtime (genuinely ambiguous, since `StoryState` is an open `Record<string, StoryValue>` that could itself contain keys named `story`/`reader`); or hiding `ReaderState` in module-global state (breaks purity, explicitly disallowed everywhere else in this design).

`resolveVariant` remains, unchanged: pure, deterministic, first-match-wins, and non-recording — it still never calls `recordVariantSeen` (17.9). Only the information available to its condition evaluator changes.

### Other runtime expression call sites

Every runtime site that evaluates a story expression — `@set` evaluation, Conditional conditions, Variant conditions, Choice item conditions, and any nested sub-expression recursion within them — must use the same `EvaluationContext`. Reader Memory query semantics must not differ depending on which construct contains the expression. Internal helpers not part of the public barrel (e.g. Choice item filtering) may change their own signatures as necessary to thread the context through; this is an internal-only consequence, not a public-API concern the way `resolveVariant` is.

## 17.18 Non-Goals and Recording-Semantics Reaffirmation

Status: LOCKED

This slice changes **how** Reader Memory is queried. It changes nothing about **how Reader Memory is recorded.** The following remain exactly as locked in 17.9 and are explicitly reaffirmed, not reopened: `recordSceneVisit`/`recordVariantSeen`'s own semantics; the scene-entry-episode and Variant-resolution-occurrence rules; `navigated != experienced`; the deliberate asymmetry between Scene and Variant `completed` handling; and replay/fork behavior.

Explicitly out of scope for this slice (unchanged from before it):

```text
dynamic Reader Memory query arguments
arbitrary ReaderState access
ReaderActionLog
ChoiceRecord
action-history / Choice-history queries
general user-defined functions
host-function calls
member access
indexing
save/resume changes
stateful session wrappers
renderer/UI behavior
```

## 17.19 Expected Implementation Impact

Status: informational (implementation is a future task, not this one)

Implementation is expected to touch both packages.

**Compiler**: the expression AST (new `CallExpression`, extended `ExpressionNode` union); the expression parser (call-syntax parsing, including comma-separated argument lists at the grammar level); punctuation handling for call arguments; a semantic validation pass for builtin name/arity/argument-literal-ness and Scene/Variant reference existence (extending the document's existing reference-validation pass, with Variant-id collection made order-independent per 17.16); new diagnostics; compiler tests.

**Runtime**: the new `EvaluationContext`; `Call` evaluation via the fixed builtin dispatch table; `resolveVariant`'s evolved signature; the `Set`/Conditional/Choice call sites threading the same context through; defensive runtime query errors (17.16); the two new pure Variant-memory query helpers (`seen_variant`, `last_seen_variant_branch`) — additive only, no change to `recordVariantSeen`/`recordSceneVisit` themselves; runtime tests; and at least one focused compiled-source E2E scenario demonstrating a reader experiencing a scene, Reader Memory recording it, a later expression querying that memory, and the story's branch outcome changing accordingly (Scene memory at minimum; Variant query behavior may remain primarily unit/integration-tested if folding it into the same E2E scenario would make it unnecessarily complex).

No new persisted `ReaderState` field is expected — `SceneVisitMemory`/`VariantMemory`'s existing shapes are already sufficient for the entire first query slice.

---

# 18. Player Core

Status: LOCKED

## 18.1 Package Boundary and Layering

A new sibling package, `packages/player` (`@aftertext/player`), sits directly above `@aftertext/runtime`:

```text
@aftertext/compiler
        ↓
@aftertext/runtime
        ↓
@aftertext/player
        ↓
future renderer/application UI
```

`@aftertext/player` is a headless application/player layer. It must not absorb runtime narrative semantics. Runtime remains authoritative for: `StoryState`, `ReaderState`, `NavigationState`, the execution cursor, expression evaluation, Reader Memory (recording and queries), Choice validation, Variant resolution, navigation, and execution errors. Player only owns and threads these runtime values for one active play session — it does not reinterpret, duplicate, or make narrative decisions about any of them.

## 18.2 PlayerState

```ts
interface PlayerState {
  readonly runtimeState: RuntimeState;
  readonly cursor: ExecutionCursor;
  readonly current: ExecutionResult | null;
}
```

* `runtimeState` is the authoritative runtime state, stored once, unmodified in shape — `StoryState`/`ReaderState`/`NavigationState` are never pulled out into separate `PlayerState` fields.
* `cursor` is the authoritative, opaque runtime execution cursor (17.10), threaded exactly as `advance()`/`selectChoice()` return it.
* `current` is the most recently exposed runtime `ExecutionResult`. `current === null` means the player was created but no narrative execution has occurred yet — a state an `ExecutionStep` itself cannot represent, since it has no "nothing happened yet" variant.

`PlayerState` introduces no new Choice state, no new Reader Memory state, and no narrative state of any kind outside `RuntimeState` — a thin, three-field wrapper, not a second narrative model.

## 18.3 No Separate PlayerView Model

This slice does not introduce a PlayerView/PlayerEvent hierarchy. The runtime's existing `ExecutionResult` variants — `content`, `presentation`, `choice`, `navigation`, `completed`, `error` — already carry the information a future renderer needs: a renderer-ready inline AST for content (`ParagraphNode`/`HeadingNode`/`InlineNode`) and already-typed, unit-normalized `PresentationCommand`s. Player surfaces these results unchanged; a future renderer adapts them to UI. Player does not create a second narrative-result AST.

## 18.4 `createPlayer`

```ts
function createPlayer(document: StoryDocument): PlayerState;
```

Creation: calls `createRuntimeState(document)` for `runtimeState`; initializes `cursor` to the runtime's initial cursor (`INITIAL_CURSOR`); sets `current` to `null`. Creation performs no narrative execution — `createPlayer` must not implicitly call `advance()`. The first execution step remains an explicit player action, exactly mirroring how `createRuntimeState` itself performs no execution at the runtime layer.

## 18.5 `advancePlayer`

```ts
function advancePlayer(
  document: StoryDocument,
  player: PlayerState,
  options?: AdvanceOptions
): PlayerState;
```

A pure transition: calls `advance(document, player.runtimeState, player.cursor, options)` and returns a new `PlayerState` built from the returned `runtimeState`/`cursor`/`result` (as `current`). Never mutates the supplied `player`. Never reinterprets the result — navigation, presentation, content, and choice are never automatically skipped or consumed. One player action corresponds to exactly one runtime `advance()` call.

## 18.6 Navigation and Presentation Remain Observable

A `navigation` result remains directly observable as `player.current.type === "navigation"`; `advancePlayer` does not automatically call `advance()` again to "finish" the transition. This preserves the runtime's locked `navigated != experienced` rule (17.7/17.9) at the player layer and lets a future renderer react to a scene change (e.g. a transition effect) before the target scene's own content is walked. The next explicit `advancePlayer()` call begins walking the target scene.

A `presentation` result is likewise surfaced unchanged. Player does not load assets, play audio, schedule timing, perform transitions, or automatically advance past a `presentation` result — interpreting `PresentationCommand` is entirely a future renderer's responsibility.

## 18.7 Choice Exposure and Selection

A `choice` result (including its current available-item set, `AvailableChoiceItem[]`) is surfaced unchanged.

```ts
function selectPlayerChoice(
  document: StoryDocument,
  player: PlayerState,
  index: number
): PlayerState;
```

When `player.current` is a Choice result, `selectPlayerChoice` reconstructs the exact runtime suspension `selectChoice` requires from `player`'s own three fields (`{runtimeState: player.runtimeState, cursor: player.cursor, result: player.current}`), delegates to `selectChoice(document, thatStep, index)`, and returns the resulting `runtimeState`/`cursor`/`result` as a new `PlayerState`. Player never re-evaluates conditions, never reconstructs available Choice items from the AST, never adds a `ChoiceRecord`, and never enforces a global "latest suspension" freshness rule — the runtime's existing replay/fork semantics (17.7) remain fully valid at the player layer: an older, still-valid `PlayerState` may be retained and selected from independently.

## 18.8 Invalid Selection Before or Without a Choice

Calling `selectPlayerChoice` while `player.current` is not a Choice result — including `current === null`, `content`, `presentation`, `navigation`, `completed`, or `error` — never throws a host-language exception and never introduces a new Player-specific error system. It returns a new `PlayerState` with `runtimeState`/`cursor` unchanged and `current` set to the existing runtime `invalid-choice-selection` error (the same `RuntimeExecutionError` shape `selectChoice` itself already produces for this case, 17.11).

Where an `ExecutionStep` already exists (`current` is `content`/`presentation`/`navigation`/`completed`/`error`), delegating to `selectChoice` itself is the source of this validation — `selectChoice` already rejects a suspension that is not a choice. Only for `current === null` — where no `ExecutionStep` exists yet to delegate to — may Player construct the same runtime error outcome directly, since there is nothing to hand to `selectChoice`. This is defensive application-API behavior, not a new narrative semantic: the error kind and shape are unchanged runtime concepts.

## 18.9 Pure Transitions; No Generic Session Abstraction Yet

Player Core is built entirely from pure functions over `PlayerState`. It introduces no mutable Player class, no `StoryEngine`, no hidden module state, no singleton session, no implicit "latest result," and no callbacks/event emitters:

```ts
let player = createPlayer(document);
player = advancePlayer(document, player);
player = selectPlayerChoice(document, player, 0);
player = advancePlayer(document, player);
```

An older `PlayerState` value remains a valid, immutable snapshot and may be retained for replay/fork, exactly like a runtime `ExecutionStep`.

No generic `RuntimeSession` wrapper is introduced in this slice. The current concrete need is a single headless Player consumer; a generic session abstraction may be extracted later only if multiple distinct consumers demonstrate genuinely duplicated orchestration needs — not designed speculatively now.

## 18.10 Content, Completed, and Error Handling

`content` results are surfaced unchanged: the existing `ParagraphNode`/`HeadingNode`/`InlineNode` structures remain authoritative. Player does not render Markdown, generate DOM, flatten `InlineNode` trees, or transform links/emphasis/code — a future renderer consumes them directly. No second text/content AST is introduced.

`completed` and `error` results are likewise surfaced unchanged through `PlayerState.current`. Player adds no recovery policy, telemetry, retry policy, terminal UI, or exception throwing for either — a future consumer decides what these states look like.

## 18.11 Reader Memory Behavior

Player never calls `recordSceneVisit`/`recordVariantSeen` directly and never evaluates a Reader Memory query itself — these remain exclusively runtime responsibilities (17.9, 17.14–17.17). Player simply receives the already-updated `RuntimeState` as the natural return value of `advance()`/`selectChoice()`. No Reader Memory recording or query semantics are changed by introducing this layer.

## 18.12 Public API Scope and Package Dependencies

The first `@aftertext/player` package exposes only: `PlayerState`, `createPlayer`, `advancePlayer`, `selectPlayerChoice`. It may re-export the runtime result types a consumer needs to narrow `PlayerState.current` (the `ExecutionResult` variants and `AvailableChoiceItem`), by reference to the existing runtime types — never redefined — so `@aftertext/player` gives consumers one coherent entry point without duplicating those types. It does not re-export unrelated runtime internals.

`@aftertext/player` depends on `@aftertext/runtime`, and may depend on `@aftertext/compiler` for `StoryDocument` typing, following the existing monorepo dependency pattern (compiler is used for types only — no compiler code ships in runtime's or player's emitted JS). As of v0.1 release hardening, internal `@aftertext/*` package relationships are declared as ordinary `dependencies`, not `peerDependencies`. Compiler/runtime public APIs must not be modified merely to avoid this legitimate type-only dependency. Adding the package may require ordinary package-integration wiring (a root TypeScript project reference, workspace/lockfile metadata) — expected integration work, not scope expansion.

## 18.13 Scope Exclusions

Player Core does not implement or design: React components, browser DOM rendering, CSS, image loading, audio playback, presentation timing, save slots, persistent saves, rollback, history/backlog, autoplay, skip mode, settings/menu UI, localization, `ReaderActionLog`, `ChoiceRecord`, a stateful session wrapper, or renderer plugins. This is a headless player core only.

## 18.14 Future Renderer Boundary

Status: informational

A future renderer should be able to do, conceptually:

```text
PlayerState.current
        ↓
switch result type
        ├─ content      → render content
        ├─ presentation → execute/render presentation
        ├─ choice       → render buttons
        ├─ navigation   → transition handling
        ├─ completed    → ending screen
        └─ error        → error surface
```

The Player API is designed so that consuming it requires no narrative-semantic duplication in that renderer — see Section 19 (Web Renderer Core) for how the renderer layer itself is expected to relate to Player.

---

# 19. Web Renderer Core

Status: LOCKED

Sits directly above `@aftertext/player` (Section 18): it consumes `PlayerState`/`createPlayer`/`advancePlayer`/`selectPlayerChoice` and adapts `PlayerState.current` to UI. It does not re-implement runtime execution, expression evaluation, Choice filtering, Variant resolution, Reader Memory, navigation semantics, StoryState mutation, or execution-cursor semantics — those remain exactly where the compiler/runtime/player layers already keep them. Renderer responsibility is limited to browser/React presentation and interaction.

## 19.1 Package Boundary and Embedded Demo

A new reusable package, `packages/web-renderer` (`@aftertext/web-renderer`):

```text
@aftertext/compiler
        ↓
@aftertext/runtime
        ↓
@aftertext/player
        ↓
@aftertext/web-renderer
```

The first slice also includes a small local Vite development harness inside this same package, conceptually:

```text
packages/web-renderer/
  src/
  test/
  demo/
```

The demo is for real-browser manual verification only. It is **not** a second package, **not** a separate `apps/demo` workspace, and **not** part of the published renderer package's build output. No new top-level `apps` workspace category is introduced in this slice. A separate application may be introduced later, once a real independent consumer exists — not designed speculatively now.

## 19.2 React/Vite Dependency Model

`react`/`react-dom` are **peer dependencies** of `@aftertext/web-renderer`, with matching dev dependencies for local tests/demo — the standard shape for a reusable component library, avoiding a bundled/duplicate React and (only `react`/`react-dom` are peers; internal `@aftertext/*` packages are ordinary `dependencies` as of v0.1 release hardening).

Development-only tooling may include Vite, the React Vite plugin, Vitest, React Testing Library, and happy-dom. Vite is for local demo development and browser-oriented dev tooling only — it is not part of the package's own `tsc`-based build (matching `compiler`/`runtime`/`player`'s existing build model).

No Next.js, no SSR. The renderer is client-side only.

## 19.3 Renderer Input Boundary

The renderer accepts a compiled `StoryDocument`. It does **not** accept raw AfterText source as its primary API and does **not** call `compile()` internally:

```tsx
<AfterTextPlayer document={document} />
```

Compilation and compiler diagnostics remain outside renderer responsibility — a demo harness (or any other consumer) compiles bundled/sample source before passing the resulting `StoryDocument` in.

## 19.4 Public API

The first public component surface is locked to exactly:

```ts
interface AfterTextPlayerProps {
  readonly document: StoryDocument;
}

function AfterTextPlayer(props: AfterTextPlayerProps): ReactElement;
```

No callbacks are added in this slice — not `onComplete`, `onError`, `onAdvance`, `onNavigate`, `onChoice`, `onPresentation`, nor any other state-change callback. There is no demonstrated host-application requirement for them yet; such integration callbacks may be added later only when a real consumer requires them.

Public exports remain exactly:

```text
AfterTextPlayer
AfterTextPlayerProps
```

`@aftertext/compiler`/`@aftertext/runtime`/`@aftertext/player` are not broadly re-exported.

## 19.5 PlayerState Ownership

`AfterTextPlayer` owns a `PlayerState` through ordinary React state:

```ts
const [player, setPlayer] = useState(() => createPlayer(document));
```

All transitions delegate to `advancePlayer(...)`/`selectPlayerChoice(...)` — the component never reimplements what they already do. No Redux, Zustand, MobX, XState, renderer-specific narrative reducer, or duplicated `StoryState` is introduced. A reducer may be introduced later only if renderer-local interaction state genuinely grows enough to justify one — not decided now.

## 19.6 Document Replacement

A new `document` prop value represents a new playable story/session. The renderer resets its `PlayerState` via a fresh `createPlayer(newDocument)` call — it never attempts to migrate `RuntimeState`, cursor, Reader Memory, or renderer progress between different `document` props. Implementation may use an appropriate React identity/reset mechanism (e.g. keying state re-initialization off the document identity). No cross-document session migration is designed.

## 19.7 Initial Startup State

`PlayerState.current` begins `null` (Section 18.4). The renderer exposes an explicit **Start** action (a real semantic `<button>`) that calls `advancePlayer(...)`. It must **not** automatically call `advancePlayer()` from a mount effect — this preserves explicit user control and avoids React Strict-Mode mount-effect double-invocation concerns.

## 19.8 Content Rendering

When `current.type === "content"`, the existing compiler/runtime content structure is rendered directly — `ParagraphNode`/`HeadingNode` and every `InlineNode` form (`Text`, `Emphasis`, `Strong`, `InlineCode`, `Link`, `LineBreak`):

```text
Paragraph   -> <p>
Heading     -> <h1> ... <h6> as represented by the node's depth
Text        -> text node
Emphasis    -> <em>
Strong      -> <strong>
InlineCode  -> <code>
LineBreak   -> <br>
Link        -> <a>, subject to the link-safety rule (19.9)
```

Formatting is never flattened to plain text, Markdown is never re-parsed, no second content AST is introduced, and `dangerouslySetInnerHTML` is never used — content stays escaped through ordinary React children semantics throughout.

## 19.9 Browser Link Safety

The renderer is the boundary that turns a story URL into a clickable browser link — this is a renderer-owned safety rule, not a runtime/compiler concern. Clearly executable/dangerous URI schemes (e.g. `javascript:`) must never become active `<a>` elements. Ordinary browser-safe destinations remain allowed: `http:`, `https:`, `mailto:`, relative URLs, and fragment/hash URLs. When a `Link`'s destination cannot be safely rendered as a navigable anchor, its readable text is preserved without making the unsafe destination executable — never by falling back to raw HTML. Exact scheme-allowlist implementation is implementation-level.

## 19.10 Content Progression

Content does not auto-advance. A semantic Next `<button>` calls `advancePlayer(...)`. Autoplay, skip, typewriter timing, and click-anywhere advancement are not implemented in this slice.

## 19.11 Choice Rendering

When `current.type === "choice"`, the exact available items Player/Runtime already supplied are rendered — each as its own real semantic `<button>`. Selection delegates directly to `selectPlayerChoice(document, player, item.index)`, using the exact exposed index. The renderer never recomputes Choice conditions, re-filters items, reindexes them, inspects the source `ChoiceNode`, or invents Choice history.

## 19.12 Navigation Behavior

Navigation remains externally observable and requires an **explicit** renderer action in this slice. When `current.type === "navigation"`, the renderer may show a minimal transition/continue state (e.g. a "Continue" button) and waits for user interaction before calling `advancePlayer(...)` again.

**Navigation is not automatically advanced through a `useEffect` in this slice.** A story may contain repeated immediate navigation (`A -> B -> A -> B ...`); the runtime step budget is scoped to a single external `advance()` call, so automatically initiating a new external call for every navigation result could create an uncontrolled browser-side render/effect loop with no guard against it. Explicit navigation continuation preserves `navigated != experienced` while retaining full user control. A future renderer policy may revisit automatic navigation only together with an explicit continuation/hop guard — not designed here.

## 19.13 Presentation Behavior

Presentation results remain externally observable. Every `PresentationCommand` is acknowledged with a simple textual/debug-friendly representation (e.g. "Background: ...", "Music: ...") and waits for an explicit Next action, exactly like content. As of Section 20 (Web Presentation Core), `Background`/`Layer` additionally update persistent renderer-only visual state at the same transition — this does not change the acknowledgement-plus-Next suspension rule above, and `Camera`/`Music`/`Sfx`/`Pause` remain exactly as inert as originally locked here: no image loading, audio/SFX playback, real pause timers, animation, fades, or transition timing. As of Section 21 (Web Presentation Timing), `Pause` additionally becomes a real renderer-local timing gate at the same transition, replacing its plain Next continuation with a locked/unlocked Continue flow — see Section 21.3–21.4; `Camera`/`Music`/`Sfx` remain exactly as inert as originally locked here. As of Section 22 (Web Camera Zoom), `Camera` additionally updates persistent renderer-only zoom state and, when it carries an explicit `durationMs`, uses the same locked/unlocked Continue flow as Pause — see Section 22.6, 22.14–22.18; `Music`/`Sfx` remain exactly as inert as originally locked here. As of Section 23 (Web Audio Presentation), `Music`/`Sfx` additionally attempt real browser audio playback as a side effect of the same acknowledgement-plus-Next transition — neither gains a timing gate, and this does not change the acknowledgement-plus-Next suspension rule above — see Section 23.12–23.13.

## 19.14 Renderer-Only Presentation State

Superseded by Section 20: a renderer-only `PresentationState`, persisted across ordinary results and updated at Background/Layer Presentation transitions, is now locked. See Section 20.5–20.10.

## 19.15 Completed State

When `current.type === "completed"`, render a minimal completion state (e.g. "Story complete.") with a **Restart** action. Restart creates a fresh `PlayerState` via `createPlayer(document)` — it never manually resets `RuntimeState`, Reader Memory, cursor internals, or navigation fields.

## 19.16 Error State

Runtime/Player errors remain ordinary result data, never thrown into a React error boundary as normal narrative behavior. When `current.type === "error"`, render a safe minimal surface containing the error's `kind` and human-readable `message` only — never a raw stack trace. Include the same Restart action (`createPlayer(document)`). No retry policy, logging infrastructure, or renderer-specific error taxonomy is introduced.

## 19.17 Styling

CSS Modules or other stylesheet imports are **not** added to the published renderer source in this first slice, since the package continues to build via the repository's normal plain-`tsc` library build, which does not itself bundle or copy CSS assets. The reusable renderer's first slice is structurally/semantically rendered without requiring a published CSS asset pipeline. The embedded Vite demo (19.1) may contain ordinary demo-only CSS (centered readable viewport, reasonable content width, readable typography, vertical Choice buttons, visually usable Start/Next/Continue/Restart actions, clear completed/error presentation) — this demo styling is not part of the renderer's public API or theming contract. A real renderer styling/theming strategy is deferred.

## 19.18 Accessibility Minimum

Native semantic browser elements throughout: every action (Start/Next/Continue/Restart/Choice item) is a real `<button>`; Choice items are independently focusable; headings remain heading elements; links remain anchors when safe (19.9); normal keyboard activation works with no custom keyboard emulation. An appropriate live/status region should be used where helpful so content changes can be announced by assistive technology. Aggressive focus-stealing on every `PlayerState` change is **not** locked in this slice — focus-management refinements may be added later based on actual browser/assistive-technology testing.

## 19.19 Dependency Direction

```text
compiler
   ↓
runtime
   ↓
player
   ↓
web-renderer
```

`@aftertext/web-renderer` depends on `@aftertext/player`, and may depend on `@aftertext/compiler` for `StoryDocument` typing. It does not import `@aftertext/runtime` directly from production renderer code where the required result/error types are already intentionally re-exported through Player (Section 18.12) — no skip-level dependency. No reverse or circular dependency is introduced. The demo harness may additionally use compiler APIs to compile its own sample story (19.1/19.22) — that usage belongs to the demo, not the reusable renderer component.

## 19.20 Scope Exclusions

Not implemented in this slice: save/load, persisted sessions, rollback, backlog/history, autoplay, skip mode, typewriter animation, asset pipeline, background image loading, character sprites, audio/music playback, real Presentation timers, animation engine, fades/transitions, localization UI, settings/menu system, mobile renderer, editor, custom themes, plugin architecture, renderer extension API, SSR, and generic host callbacks.

## 19.21 Testing Strategy

Status: informational

Vitest with a lightweight DOM environment (e.g. happy-dom) and React Testing Library — the same per-package `environment` mechanism `compiler`/`runtime`/`player` already use, just set to a DOM environment for this package. Coverage areas: startup (Start renders/performs the first advance from `current === null`); content (Paragraph/Heading/nested inline formatting, no raw HTML, safe links render as anchors, unsafe schemes do not, Next progresses); Choice (buttons correspond exactly to available items, selection uses the supplied index, the correct transition follows); navigation (remains a visible state, no automatic effect-driven advance, explicit Continue performs exactly one `advancePlayer`); Presentation (surfaced/acknowledged, no asset/audio/timer behavior, explicit Next continues); completed/error (correct state rendered, Restart creates a fresh session); document replacement (a new `StoryDocument` resets to the initial Start state). At least one component-level integration test drives a real `compile()`-produced `StoryDocument` through the full sequence (compile → render → Start → content → Next → Choice → select → navigation → Continue → target content → Next → completed) without manually constructing the Story AST. Playwright or another real-browser automation framework is not required for this first slice.

## 19.22 Demo Harness

Status: informational

A small Vite-powered local demo lives inside `packages/web-renderer` (19.1), letting a developer launch a real story in a browser: compile bundled/sample AfterText source to obtain a `StoryDocument`, then render `<AfterTextPlayer document={document} />`. This compiler usage belongs to the demo application, not the reusable renderer component (19.3/19.19). The demo is not part of the published package files.

## 19.23 Development Sequence

Status: informational

```text
Web Renderer Core documentation lock
        ↓
@aftertext/web-renderer implementation
        ↓
component/integration tests
        ↓
embedded browser demo verification
```

Real visual Presentation support for Background/Layer is specified in Section 20; audio and animation remain out of scope there too.

---

# 20. Web Presentation Core

Status: LOCKED

Sits inside `@aftertext/web-renderer` (Section 19), adding the first *persistent, visual* interpretation of `PresentationCommand` on top of the inert acknowledgement Section 19.13 already locked. It does not change compiler AST, runtime execution, or Player semantics — nothing here required or produced a compiler/runtime/player change.

## 20.1 Scope of This Visual Slice

Implemented visually in this slice: `Background`, `Layer`. Kept visually inert (unchanged from Section 19.13): `Camera`, `Music`, `Sfx`, `Pause` — each remains an observable Presentation suspension, visibly acknowledged, explicitly continued through Next, and does **not** alter persistent visual state. No camera animation, audio, SFX, or real pause timing is implemented. (As of Section 21, `Pause` gains real renderer-local *timing* — a locked/unlocked gate, not a visual-state change — while remaining outside `PresentationState`. As of Section 22, `Camera` gains persistent `cameraZoom` state and, with an explicit duration, the same timing gate as Pause. As of Section 23, `Music` gains persistent `music` state and, together with `Sfx`, attempts real browser audio playback — neither gains a timing gate. See Sections 22.6/22.16–22.18 and 23.5/23.12–23.13.)

## 20.2 Current `PresentationCommand` Model

Recorded here for reference (authoritative definition remains `packages/compiler/src/ast/presentation.ts`, Section 14):

```text
BackgroundCommand  { image: string }
LayerCommand       { image: string }
CameraZoomCommand  { action: "zoom"; to: number; durationMs?: number }
MusicCommand       { track: string; volume?: number }
SfxCommand         { clip: string }
PauseCommand       { durationMs: number }
```

No new `PresentationCommand` variant, and no new field on an existing one, is introduced by this slice.

## 20.3 Known Layer Model Limitation

`LayerCommand` currently carries only `image: string` — no layer ID, character ID, slot ID, position, z-index/order, or removal/clear operation. This slice therefore does **not** implement a general multi-layer or character-sprite system. The locked renderer interpretation for this slice is:

> `Layer` controls one persistent foreground visual slot.

```text
Background slot: 0 or 1 image
Foreground Layer slot: 0 or 1 image
```

A later `Layer` command replaces the previous foreground Layer slot — it does not append an independent additional layer. This is the only interpretation the current data model honestly supports, not a design preference; true named/multiple layers require a future compiler/DSL change and are explicitly not designed here. Do not claim or imply support for multiple simultaneous Layer commands.

## 20.4 No Clear Operation

The compiler requires a non-empty `image` value for both `@background` and `@layer` — there is no AST representation for "clear background" or "clear layer." This slice therefore supports **set/replace only**. No empty-string or magic-token clear convention is invented. A future syntax/AST change may introduce explicit clearing if a concrete need arises.

## 20.5 Renderer-Owned `PresentationState`

```ts
interface PresentationState {
  readonly background: string | null;
  readonly layer: string | null;
}
```

(Exact naming/implementation is implementation-level.) Initial state: `{ background: null, layer: null }`. Owned exclusively by `@aftertext/web-renderer` — never added to `RuntimeState`, `StoryState`, `ReaderState`, `NavigationState`, `PlayerState`, or `ExecutionCursor`. The runtime and player remain entirely unaware that browser presentation persistence exists.

## 20.6 `PresentationState` Lifetime and Reset

Background/Layer persist across every ordinary result — content, choice, navigation, other Presentation commands, completed, and error — until another command of the same kind replaces it. Only two things reset `PresentationState` to `{ background: null, layer: null }`: **Restart**, and a **new `document` prop**. It is not reset merely because a Scene navigation occurred, content changed, a Choice was selected, the story completed, or the runtime returned an error — terminal UI may render over the last active visual state.

## 20.7 Atomic Renderer Session State

The renderer's internal session state generalizes to hold `PlayerState` and `PresentationState` together in one state owner:

```ts
interface RendererSession {
  readonly activeDocument: StoryDocument;
  readonly player: PlayerState;
  readonly presentation: PresentationState;
}
```

One React state owner, updated atomically — never two independent state containers for a single user action that may change both. No Redux/Zustand/XState.

## 20.8 Pure Presentation Transition

```ts
function applyPresentation(state: PresentationState, command: PresentationCommand): PresentationState;
```

`Background` replaces `background`; `Layer` replaces `layer`; at the time this section was locked, `Camera`/`Music`/`Sfx`/`Pause` left `PresentationState` unchanged. Pure, does not mutate its input, renderer-internal, not part of the public package API. Uses an exhaustive `PresentationCommand` switch — no permissive `default` that could silently swallow a future command variant TypeScript could otherwise catch. **Superseded in part**: as of Section 22, a valid `Camera` command replaces `cameraZoom`; as of Section 23, a `Music` command replaces `music` (Section 22.6, 23.5–23.7). `Sfx`/`Pause` still leave `PresentationState` unchanged — Sfx has no persistent state by design (Section 23.13), and Pause remains purely timing (Section 21.7).

## 20.9 Presentation Application Timing

Persistent visual state updates at the **same** renderer transition that receives a Presentation result — never through a post-render `useEffect`:

```text
user action -> Player transition -> new PlayerState
  -> if current result is Presentation: applyPresentation(...)
  -> one atomic RendererSession update -> render
```

The same paint that exposes `current.type === "presentation"` already reflects the newly applied Background/Layer state. This avoids a one-frame old-background flash, effect-driven duplicate application, and Strict-Mode effect complications. The Presentation result remains a suspension and is not automatically consumed by applying it visually.

## 20.10 Player-Transition Normalization

Presentation application is tied to **the Player result actually produced**, not to an assumption about which specific Player function can produce it:

```ts
const nextPresentation =
  nextPlayer.current?.type === "presentation"
    ? applyPresentation(previousPresentation, nextPlayer.current.command)
    : previousPresentation;
```

applied after *every* renderer-triggered Player transition (`advancePlayer` and `selectPlayerChoice` alike), even though only `advancePlayer` can currently produce a `presentation` result. No Player API changes.

## 20.11 Public Asset-Resolution Boundary

`AfterTextPlayerProps` gains one additive, optional prop:

```ts
export interface AfterTextPlayerProps {
  readonly document: StoryDocument;
  readonly resolveAsset?: (ref: string, kind: "background" | "layer") => string | null;
}
```

Synchronous, deterministic, pure from the renderer's perspective — not an event callback, and not subject to Section 19.4's callback deferral. Default when omitted: identity (`resolved URL = ref`), so a story already using usable browser paths/URLs works with zero configuration.

## 20.12 Asset Identity vs. Narrative Identity

Changing `resolveAsset`'s function identity never restarts `PlayerState`, clears Reader Memory, resets `RuntimeState`, or resets `PresentationState`. Narrative/session identity remains tied only to `document` (Section 19.6). `PresentationState` stores the raw author reference (Section 20.5); resolution happens at render time, so an existing background/layer re-resolves for free if a host supplies a different resolver, with no story replay.

## 20.13 Asset-Reference Neutrality

The compiler treats Presentation image strings as opaque, non-empty references — never defined as filesystem paths, browser URLs, bundler imports, or CDN IDs (confirmed: nothing in Section 14 of this specification or the compiler's parsing constrains their shape beyond non-emptiness). The Web Renderer preserves that neutrality; `resolveAsset` (20.11) is the only boundary converting an opaque story reference into a browser-loadable URL. The DSL is not permanently bound to Vite, Webpack, local filesystem paths, or a CDN convention.

## 20.14 Browser Image URL Safety

The resolver's output is validated before it becomes an `<img src>`. Allowed: `http:`, `https:`, `blob:`, relative URLs, absolute-path URLs, and fragment-resolved browser URLs where meaningful. For `data:` URLs, only image data (`data:image/...`) is allowed — an arbitrary `data:` payload (e.g. `data:text/html,...`) is rejected exactly like any other unsafe scheme. Executable/unexpected schemes (e.g. `javascript:`) are rejected. Browser URL parsing is used rather than naive prefix matching, per the same reasoning already locked for link safety (Section 19.9). If a resolved asset URL fails this validation, no active `<img src>` is created from it. This is a distinct allowlist from Section 19.9's link safety (different legitimate schemes for images vs. anchors), not a reuse of the same allowed-scheme set.

## 20.15 Background Rendering Semantics

`Background(image)` sets/replaces the persistent background slot. Rendering policy: decorative, centered, fills the presentation surface, `object-fit: cover`, rendered beneath Layer and narrative UI. Uses `<img alt="">` — never inventing meaningful alt text from a filename/asset ID. No captions. No clear operation exists (Section 20.4).

## 20.16 Foreground Layer Rendering Semantics

`Layer(image)` sets/replaces the single persistent foreground Layer slot (Section 20.3). Rendering policy: decorative, rendered above Background and below narrative UI, centered, `object-fit: contain`. Uses `<img alt="">` — the current AST carries no author-provided accessibility description. Not interpreted as multiple characters, named sprites, positioned actors, or append-only layers. No clear operation exists.

## 20.17 Deterministic Visual Stacking

A fixed stacking model, not inferred from source order (`LayerCommand` has no z/order field to infer from):

```text
z = 0   Background
z = 1   foreground Layer
z = 2   narrative UI
```

Exact CSS values are implementation-level; the ordering itself is deterministic and fixed.

## 20.18 Structural Styling Policy

The existing no-published-CSS rule (Section 19.17) is unchanged. Inline React styles only, used solely for layout-critical structure: presentation-surface positioning, absolute image positioning, width/height, `object-fit`, z-order, and `pointer-events` if required. Host/demo CSS remains responsible for aesthetic skinning. No CSS Modules added to library source, no Tailwind, no design system, no theme API.

## 20.19 Presentation Result UI

Applying a visual command does not consume the Presentation suspension. When `current.type === "presentation"`: the visual state is already updated (Section 20.9), the existing command acknowledgement (Section 19.13) remains visible, and explicit Next remains required. No auto-advance after visual application. The existing debug/readable label may remain even once the command also has a real visual effect.

## 20.20 Deferred Presentation Commands

`Music` and `Sfx` remain exactly as locked in Section 19.13 for the purposes of this section's own scope at the time it was written: visible acknowledgement, explicit Next, no `PresentationState` change beyond what is noted below. No partial/fake implementation of either. (As of Section 21, `Pause` is no longer merely acknowledged-and-Next — it becomes a real renderer-local timing gate, Section 21.3 — though it still never mutates `PresentationState`, Section 21.7. As of Section 22, `Camera` is no longer merely acknowledged-and-Next either — it updates persistent `cameraZoom` and, with an explicit `durationMs`, uses the same timing gate as Pause — see Section 22.6, 22.16–22.18. As of Section 23, `Music` gains persistent semantic state (`PresentationState.music`) and both `Music`/`Sfx` attempt real browser audio playback — neither gains a timing gate, and Music no longer literally "does not play" — see Section 23.5, 23.12–23.13.)

## 20.21 Asset-Load Failure Behavior

An image load failure is renderer/browser behavior, never narrative execution — it must not become a `RuntimeExecutionError`, since the runtime already successfully executed the Presentation command. For an unsafe, unresolved, or failed image asset: no renderer crash, no `PlayerState`/`RuntimeState` change, no automatic retry, no preload infrastructure. A small visible non-fatal fallback/debug indication is provided where practical, via ordinary component-local error state on the `<img>` (not added to `PresentationState` itself), keyed/remounted by the resolved URL so a later replacement asset starts cleanly.

## 20.22 Content/Choice Composition

```text
Presentation surface
  ├─ Background
  ├─ foreground Layer
  └─ Narrative UI
      ├─ Start
      ├─ Content
      ├─ Choice
      ├─ Navigation
      ├─ Presentation acknowledgement
      ├─ Completed
      └─ Error
```

Persistent visual state renders underneath the existing narrative UI, which remains driven solely by `PlayerState`. Background/Layer semantics are unchanged by this composition.

## 20.23 Restart Behavior

Restart produces a fresh `PlayerState` and an empty `PresentationState` atomically: `{ player: createPlayer(document), presentation: INITIAL_PRESENTATION_STATE }`. No lower-level runtime field is manually mutated/reset.

## 20.24 Document Replacement

A `document` change produces the same fresh-`PlayerState`-plus-empty-`PresentationState` reset, in the same renderer-session reset already locked in Section 19.6. No visual carries over from the previous `StoryDocument`. Changing `resolveAsset` alone does not trigger this reset (Section 20.12).

## 20.25 Completed/Error Behavior

Completed and error screens may render over the last active Background/Layer — neither is cleared merely because the story terminated or the runtime returned an error. Restart still clears it as defined in Section 20.23.

## 20.26 Replay/History Scope

The renderer continues to own exactly one active path. No visual-state reconstruction or history is added: no rollback, presentation history, save/load restoration, replay timeline, or reverse command application. Player's own lower-level immutable replay/fork ability is unchanged but is not exposed as renderer UI in this slice.

## 20.27 Demo Requirements

Status: informational

The embedded demo (Section 19.22) extends to prove persistent visual state, using local demo-owned assets under `packages/web-renderer/demo/assets/` (small, reviewable local fixtures — SVG preferred where practical — never remote third-party assets unless unavoidable), excluded from the published package through the existing `files` boundary. Sequence: Background A → Layer A → content → Choice → a branch that replaces the Background (proving replacement) alongside a branch that leaves it unchanged (proving persistence) → later content. The demo supplies a real `resolveAsset` mapping story references to Vite-resolved asset URLs.

## 20.28 Testing Requirements

Status: informational

Pure `applyPresentation` tests: initial state; Background set/replace; Layer set/replace; input immutability; Camera/Music/Sfx/Pause each leave state unchanged. Component tests: a visual command changes presentation in the same render as the Presentation suspension (no effect flush needed); Background/Layer persist into later content and into Choice; a branch-specific replacement affects only the selected path; Restart and a new `document` clear visual state; a new resolver does not restart story/presentation; default identity and a custom resolver both behave correctly; an unsafe resolved URL never becomes an image source; `data:image/...` is accepted while an arbitrary non-image `data:` payload is rejected; a failed image load is non-fatal and never a `RuntimeExecutionError`; deferred commands remain visual-state no-ops and still require Next. At least one real-source integration test drives: compile → Start → Background Presentation (visible immediately) → Next → Layer Presentation (visible immediately) → Next → content with both visuals retained → Choice → select → Navigation/Continue as required → branch-specific Background Presentation (updated immediately) → Next → target content with the updated visual retained — public APIs only, no manually constructed AST.

## 20.29 Public API Scope

Only `AfterTextPlayerProps` changes (gains optional `resolveAsset`, Section 20.11). Not exported: `PresentationState`, `applyPresentation`, presentation-surface internals, asset-safety helpers. No standalone public `AssetResolver` type is introduced unless implementation demonstrates a concrete ergonomic need — the function type may remain inline on `AfterTextPlayerProps`. No compiler/runtime/player API change is expected; if implementation reveals one is genuinely required, that is a blocker to report before proceeding, not to silently work around.

## 20.30 Explicit Deferred Scope

Not implemented in this slice: multiple named layers, layer positioning, layer removal, background clearing, sprite/character semantics, camera zoom/animation, Music, Sfx, real Pause timing, audio state, transitions/fades, animation, preloading, asset cache, loading progress, save/load, rollback, backlog/history, autoplay, skip, themes, plugins, editor integration, mobile-native presentation.

---

# 21. Web Presentation Timing

Status: LOCKED

Sits inside `@aftertext/web-renderer` (Section 19), adding the first *timed* interpretation of `PresentationCommand` on top of the persistent-visual layer already locked in Section 20. It does not change compiler AST, runtime execution, or Player semantics — nothing here requires or produces a compiler/runtime/player change.

## 21.1 Scope of This Timing Slice

This slice implements real timing for exactly one command: `Pause`. `CameraZoomCommand` receives its own future design pass and is **not** touched here — it remains exactly the inert, visible-acknowledgement-plus-Next behavior already locked in Section 19.13/20.20. Reason: Pause proves the browser timer/effect/Strict-Mode lifecycle without requiring the unresolved Camera decisions (persistent zoom state, transform target, animation mechanism, anchor/origin semantics, reduced motion, animation-completion semantics) — deliberately the smallest slice that proves the timing model without speculative animation design.

## 21.2 Current `PauseCommand` AST/Parser Semantics

Recorded here for reference (authoritative definition remains `packages/compiler/src/ast/presentation.ts` and its parser, Section 14):

```ts
interface PauseCommand {
  readonly type: "Pause";
  readonly durationMs: number;
}
```

Source duration syntax is `<number><unit>` where unit is `ms` or `s` (e.g. `@pause 500ms`, `@pause 1.5s`, `@pause 0ms`). Current parser behavior:

* seconds are converted to milliseconds; the result is rounded to an integer number of milliseconds regardless of input path;
* `0` is a valid duration;
* a negative duration cannot compile (invalid);
* a bare number with no unit cannot compile (invalid — the unit is mandatory);
* a missing duration entirely cannot compile (invalid);
* there is currently **no compiler-defined maximum** duration.

This slice introduces no new compiler validation — the renderer consumes `durationMs` exactly as already produced.

## 21.3 Pause as a Real Timing Gate

`Pause` is locked as a real narrative timing gate, not merely an acknowledgement. When the renderer receives `current.type === "presentation"` with `command.type === "Pause"`, the Pause begins **locked**:

```text
Presentation(Pause(durationMs)) received
  -> locked
       - Pause acknowledgement remains visible
       - narrative advancement is unavailable
       - no active Continue/Next action can bypass the wait
       - no automatic narrative advance occurs
  -> durationMs elapses
  -> unlocked
       - an explicit Continue action becomes available
```

The user must press Continue to trigger the next `advancePlayer()` call. This differs from every other Presentation command, which continues to use the existing acknowledgement-plus-Next flow unchanged (Section 21.22).

## 21.4 No Automatic Advance

The Pause timer must never call `advancePlayer` (or `selectPlayerChoice`) itself. Its only effect on success is flipping renderer-local gate state from locked to unlocked for the current suspension. Narrative execution remains exclusively user-driven, exactly like every other suspension already locked in this project (Start/Next/Continue/Restart) — this intentionally avoids turning Pause into autoplay.

## 21.5 No Pause Skipping

While a Pause is locked: Next is unavailable, Continue is unavailable/disabled, clicking elsewhere does not advance, and no keyboard shortcut bypasses the wait. Skip/autoplay behavior is explicitly deferred and must not be silently introduced in this slice.

## 21.6 Consecutive Pause Safety

Because timer completion never calls `advancePlayer`, consecutive `Pause` commands cannot create an automatic progression loop, however short their durations:

```text
Pause 100ms -> wait -> user Continue -> Pause 100ms -> wait -> user Continue -> ...
```

No timed-command hop counter or auto-continuation guard is required — the existing "one explicit user action per suspension" invariant already prevents any unguarded chain, structurally, with no additional machinery. This is an intentional advantage of the manual-Continue model over an auto-advance model.

## 21.7 Renderer-Local Timing State

Browser timing state belongs only to `@aftertext/web-renderer`. It is not added to the compiler AST beyond the already-existing `durationMs` field, nor to `RuntimeState`, `StoryState`, `ReaderState`, `NavigationState`, `PlayerState`, `ExecutionCursor`, or the persistent `PresentationState` (Section 20.5). Persistent visual state and ephemeral Pause timing state are separate concerns with separate reset rules (Section 20.6 vs. Section 21.14–21.16): visual state persists across ordinary transitions by design, while timing/gate state must reset on every new suspension, including ones the visual layer otherwise leaves untouched.

## 21.8 Pause Gate Model

Pause readiness is not modeled as an unqualified global boolean. A gate conceptually equivalent to:

```ts
interface PauseGate {
  readonly suspension: PausePresentationResult | null;
  readonly unlocked: boolean;
}
```

(exact internal type/naming is implementation-level) ties `unlocked` to a specific suspension. A new Pause always begins locked, even if the previous Pause was unlocked, even if both durations are equal, and even if both `PauseCommand` values are structurally identical. Pause identity must never be derived solely from `durationMs`.

## 21.9 Pause Suspension Identity

Timer lifecycle is tied to the exact current Pause result/suspension produced by Player, not to command-value equality. Using the current Pause result object/reference as an internal React effect dependency is acceptable and sufficient, since `advancePlayer`/`selectPlayerChoice` are pure and always construct a fresh result object per call — this is an implementation-local identity mechanism only. No Pause suspension ID is exposed publicly, and no runtime/player suspension ID is added merely for this renderer feature. A transition to a new Pause result must always create a fresh locked timing lifecycle, regardless of equal command values (Section 21.8).

## 21.10 No Transient Unlocked Frame

When transitioning from an unlocked Pause A to a new Pause B, Pause B must render as locked immediately — there must be no intermediate render where B inherits A's unlocked Continue affordance before a later effect corrects it. Unlock eligibility is derived from **both** the current Pause suspension identity and the gate state recorded for that specific suspension together, so a gate belonging to any previous suspension is automatically treated as locked for a new one. Relying solely on a post-render effect resetting one global "unlocked" boolean back to `false` is insufficient and is not the locked design.

## 21.11 Timer Effect Boundary

Unlike the pure, effect-free visual Presentation application already locked in Section 20.9, real timing legitimately requires a browser side effect and is deliberately exempted from that no-`useEffect` rule. A narrowly scoped effect observes the current Pause suspension:

```text
current result becomes Pause P
  -> effect setup for P
  -> schedule timer/deadline wait
  -> duration completes
  -> mark the gate for P (and only P) unlocked
```

Effect cleanup cancels the currently scheduled browser timeout. The effect must not mutate `PlayerState`, must not mutate `PresentationState`, must not call `advancePlayer` or `selectPlayerChoice`, and must not directly alter `RuntimeState`. Its only successful-completion effect is the renderer-local Pause gate transitioning to unlocked.

## 21.12 Strict Mode Safety

The design must be correct under the development double-invoke lifecycle (`effect setup -> cleanup -> effect setup again`, already relevant to this project via Section 19.7). Guarantees: the first scheduled timeout is canceled by cleanup before it can fire; only the surviving effect instance's timer may unlock the current Pause; no duplicate narrative advancement is possible, because timeout completion never invokes Player execution (Section 21.4) — Strict Mode therefore structurally cannot cause double narrative advancement; no orphaned timeout remains; and a stale effect instance may never unlock a newer Pause (Section 21.13).

## 21.13 Stale Callback Guard

A timeout callback must only unlock the Pause suspension for which it was created. If the current Pause has changed, or no longer exists, by the time the callback fires, it must do nothing. This is enforced via the suspension-associated gate/identity (Section 21.8–21.9), not via a bare boolean — an old timeout must never be able to unlock a newer Pause, a restarted session, or a replacement document.

## 21.14 Restart and Pause State

Restart (Section 19.15/19.16) always creates a fresh `RendererSession` atomically — fresh `PlayerState`, reset `PresentationState` (Section 20.23), and an empty Pause gate — exactly like every other Restart field; if a story reached via that fresh session later hits a Pause, it begins locked from scratch, with no residual gate state from before Restart.

**Reachability note, recorded for accuracy rather than as a narrowing of the guarantee above**: in the current Web Renderer UI, Restart is exposed only from the terminal `completed`/`error` states (Section 19.15/19.16), which are mutually exclusive with an active `presentation`(Pause) suspension — `player.current` can only be one `ExecutionResult` variant at a time, and reaching `completed`/`error` requires having already passed any Pause via its own Continue action. A locked Pause therefore cannot currently coexist with a visible Restart action, and "Restart while a Pause is locked" is not a reachable UI state in this slice. The cancellation scenarios actually reachable while a Pause is locked are StoryDocument replacement (Section 21.15) and component unmount (Section 21.16) — both host/prop/lifecycle-level actions independent of `current.type`.

If a future renderer change ever makes Restart (or an equivalent session-reset action) reachable from a non-terminal state, any active Pause timer must be canceled/invalidated as part of that same session reset, exactly as already required for document replacement and unmount.

## 21.15 Document Replacement During Pause

If the `document` prop changes while a Pause is locked, the same reset applies: cancel the current timer, create a fresh Player session, reset `PresentationState` (Section 20.24), clear the Pause gate, and render Start. A timer created for the old document must never affect the new document. Existing document-replacement semantics (Section 19.6, 20.24) remain authoritative and are not altered by this slice.

## 21.16 Component Unmount

If `AfterTextPlayer` unmounts while a Pause is waiting, the timer is canceled by ordinary effect cleanup, no later state update occurs, and no global timer registry exists anywhere in the implementation.

## 21.17 Browser Timer Duration Semantics

`durationMs` represents a minimum approximate browser wall-clock wait, not a media-grade or real-time-precise guarantee. Tab throttling, event-loop load, and ordinary browser scheduling may cause the actual unlock to occur later than the authored duration. The renderer must never unlock earlier merely because the tab was suspended/throttled — deadline reasoning (Section 21.18), not a fixed elapsed-tick assumption, governs correctness. No high-precision clock is built.

## 21.18 Large-Duration Safety

Because the compiler enforces no maximum `durationMs` (Section 21.2), the renderer must not assume every valid duration can safely be supplied as a single browser `setTimeout` delay. Internally, the renderer waits toward a target deadline (`deadline = startWallClock + durationMs`), scheduling only a browser-safe chunk of the remaining delay at a time; when a chunk fires, it recomputes the remaining time and either unlocks (remaining `<= 0`) or schedules another safe chunk. This remains a small internal timing helper, not a generic scheduler framework.

## 21.19 Zero-Duration Pause

`0ms` is a valid compiler input (Section 21.2) and remains a real Pause suspension — it does not synchronously disappear during the Player transition. Expected behavior: the Pause renders locked, the timer/effect lifecycle runs, and the gate unlocks asynchronously at the first eligible timer turn; the user still presses Continue. Zero duration is not special-cased into automatic narrative advancement.

## 21.20 Timer Scheduling Failure

A timer/scheduling failure is renderer-local and must never become a `RuntimeExecutionError` — the runtime error taxonomy is unchanged. If the renderer cannot establish a timer for the current Pause, the preferred behavior is fail-open (unlock Continue) rather than permanently deadlocking the story. This is defensive browser-environment handling only; no retry infrastructure is required.

## 21.21 Pause UI

While locked, the existing Presentation acknowledgement remains visible (e.g. conceptually "Pause: 2000ms" plus a "Waiting…" indication) with no usable Continue action. Once unlocked, a Continue action becomes available. Exact wording is implementation-level. No countdown, progress bar, remaining-time display, or skip button is added in this slice.

## 21.22 Other Presentation Commands Unchanged

Only Pause's interaction model changes in this slice:

```text
Background -> Next   (visual, persistent — Section 20)
Layer      -> Next   (visual, persistent — Section 20)
Camera     -> Next   (inert acknowledgement — unchanged in this slice; superseded by Section 22 for a timed Camera)
Music      -> Next   (inert acknowledgement in this slice; superseded by Section 23 — remains plain Next, but attempts real playback)
Sfx        -> Next   (inert acknowledgement in this slice; superseded by Section 23 — remains plain Next, but attempts real playback)
Pause      -> locked: Waiting / unlocked: Continue
```

Background/Layer persistent visual semantics (Section 20) are unchanged by this slice.

## 21.23 CameraZoom Remains Deferred (superseded by Section 22)

Recorded here as an accurate description of this slice's own scope at the time it was locked: this slice did not implement or lock camera zoom persistence, `to=1` reset meaning, camera transform target, animation mechanism, animation completion, reduced-motion handling, or camera timing of any kind, and `Camera` continued as a visible inert acknowledgement plus explicit Next. **Superseded by Section 22**, which now locks all of the above.

## 21.24 Public API Scope

This slice adds no new public `AfterTextPlayerProps`. No pause callback, timing callback, skip prop, autoplay prop, speed multiplier, timer-implementation injection point, or animation-settings prop is introduced. Timing behavior is entirely internal to `@aftertext/web-renderer`.

## 21.25 Asset/Visual Semantics Unchanged

Pause timing does not alter `resolveAsset` (Section 20.11), asset URL safety (Section 20.14), Background/Layer persistence (Section 20.6), single-foreground-Layer semantics (Section 20.3), asset-load failure behavior (Section 20.21), visual stacking (Section 20.17), or `PresentationState` reset rules (Section 20.23–20.24). Pause timing and visual asset handling remain independent concerns.

## 21.26 Testing Requirements

Status: informational

Fake-timer component tests (Vitest fake timers where appropriate) covering: a Pause result renders locked with Continue unavailable and does not advance before the duration elapses, and unlocks at the duration boundary with exactly one Player transition per Continue click; two consecutive Pause commands with equal durations create independent locked lifecycles, and an earlier unlocked state never leaks into the next Pause; a `0ms` Pause still renders as a locked suspension before unlocking asynchronously, with no automatic advance; Strict Mode setup/cleanup/re-setup does not unlock early and does not produce a duplicate surviving timer; Restart, a new `document`, and unmount each cancel an in-flight Pause timer such that advancing time afterward cannot affect the new/unmounted state; if a large-duration chunking helper (Section 21.18) is independently testable, it does not unlock before the target deadline and correctly unlocks once the deadline is reached; and Background/Layer/Camera/Music/Sfx continue to use the existing Next interaction unchanged. At least one real-source integration test drives: compile → Start → content → Next → Pause (locked) → advance time short of the duration (still locked) → reach the duration (Continue available) → Continue → next content — public APIs only, no manually constructed AST for the principal scenario.

## 21.27 Demo Requirements

Status: informational

The embedded demo (Section 19.22) adds exactly one short real Pause (a duration on the order of one second, short enough for convenient manual verification) to the existing sample story, visibly demonstrating the Pause acknowledgement, the locked/"Waiting…" state, and Continue becoming available once unlocked. `CameraZoom` behavior is not added to the demo in this slice.

## 21.28 Explicit Deferred Scope

Not implemented in this slice: `CameraZoom` timing/animation/state of any kind, Music, Sfx, audio, autoplay, Pause skipping, timing speed control, user timing preferences, countdown/progress UI, a generic scheduler framework, a timeline engine, save/load, rollback, backlog/history, scene transitions, or an animation library.

---

# 22. Web Camera Zoom

Status: LOCKED

Sits inside `@aftertext/web-renderer` (Section 19), adding the first *real* browser interpretation of `CameraZoomCommand` on top of the persistent-visual layer (Section 20) and the real-timing infrastructure (Section 21). It does not change compiler AST, runtime execution, or Player semantics, and does not add any new Camera AST field (no pan, position, anchor/origin DSL, shake, rotation, or author-controlled easing) — nothing here requires or produces a compiler/runtime/player change.

## 22.1 Scope of This Slice

This slice implements exactly: persistent absolute zoom state, optional CSS zoom animation, and timed Camera gating when `durationMs` is explicitly present. It does not implement pan, camera position, an anchor/origin DSL, shake, rotation, or author-controlled easing — the current AST has no fields for any of these, and none is added.

## 22.2 Current `CameraZoomCommand` AST/Parser Facts

Recorded here for reference (authoritative definition remains `packages/compiler/src/ast/presentation.ts` and its parser, Section 14):

```ts
interface CameraZoomCommand {
  readonly type: "Camera";
  readonly action: "zoom";
  readonly to: number;
  readonly durationMs: number | undefined; // absent when duration= wasn't given
}
```

`to` accepts negative values, zero, and fractions, with no compiler-enforced range. `durationMs` is optional and, when present, follows the same `<number><unit>` (`ms`/`s`) rules already recorded for Pause (Section 21.2). **Confirmed empirically**: the same numeric-overflow behavior already found for Pause's `durationMs` also applies to `to` — an extreme-but-syntactically-valid literal (e.g. hundreds of digits before any unit) can produce `to === Infinity` (or `-Infinity`) via `Number(...)` overflow, with no compiler error. `NaN` is not reachable from the compiler today (the parser's numeric pattern only ever matches well-formed digit/decimal strings). This slice introduces no new compiler validation — the renderer consumes `to`/`durationMs` exactly as already produced and defends itself (Section 22.5).

## 22.3 Meaning of `to`

`to` is an **absolute zoom scale**, not a relative multiplier, percentage, or delta from the previous zoom: `to=1` is identity, `to=1.5` is 150%, `to=0.8` is zoomed out to 80%. A later Camera command's `to` **replaces** the previous persistent target outright — it never composes multiplicatively with prior zoom commands. Consequently `to=1` always returns the visual scene to identity scale, with no special-casing required.

## 22.4 Valid Zoom Domain

A valid renderer zoom is any **finite number greater than zero**. `0`, negative values, `Infinity`, `-Infinity`, and `NaN` (defensively, though not reachable from the compiler today — Section 22.2) are invalid for browser rendering. No renderer-imposed maximum is introduced in this slice: a large but finite positive value is an authored value and is rendered as-is, not silently clamped. The compiler's lack of a numeric finiteness bound was recorded as a future hardening concern (Section 22.37) and is now resolved by Section 24 (Compiler Numeric Hardening) — the compiler still imposes no range/domain bound beyond finiteness, so this section's own renderer-side defenses remain necessary and unchanged.

## 22.5 Invalid Zoom Handling

When a Camera command's `to` fails Section 22.4's domain check, the renderer:

* leaves persistent `cameraZoom` unchanged (same reference, no mutation) — never writes an invalid value into `PresentationState`;
* emits no invalid CSS transform (no `scale(0)`, `scale(NaN)`, `scale(Infinity)`, or a negative/mirroring scale);
* keeps the Camera Presentation suspension fully observable — the command is **not** discarded as a narrative suspension;
* never produces a `RuntimeExecutionError` — this is renderer-local visual safety, not a narrative or runtime failure.

Visual validity and timing classification (Section 22.14–22.16, 22.29) are independent: an invalid-zoom Camera command that also carries an explicit `durationMs` still fully participates in the timed gate exactly as if its zoom had been valid — e.g. `Camera(to=Infinity, duration=1s)` produces no visual zoom change, but the suspension still locks for 1s and Continue still unlocks at the deadline (Section 22.30).

## 22.6 Persistent Camera State

`PresentationState` (Section 20.5) gains one field:

```ts
interface PresentationState {
  readonly background: string | null;
  readonly layer: string | null;
  readonly cameraZoom: number;
}
```

Initial value: `cameraZoom = 1`. It stores only the accepted persistent final zoom value (Section 22.4–22.5) — never an animation handle, browser timer ID, from/to animation bookkeeping, or transition-lifecycle state. `applyPresentation` (Section 20.8) gains a real `Camera` case (previously a no-op) that updates `cameraZoom` when `to` is valid and otherwise returns the input state unchanged, exhaustive and pure exactly like the existing `Background`/`Layer` cases.

## 22.7 Camera Persistence

A valid Camera zoom persists through content, choice, navigation, Background commands, Layer commands, Pause, Music, Sfx, completed, and error — identical to Background/Layer's already-locked persistence rule (Section 20.6) — until another valid Camera command replaces it. Background/Layer replacement does not reset camera zoom: `Camera(to=1.5)` followed by a new `Background` renders that Background inside the still-zoomed surface (Section 22.32).

## 22.8 Camera Reset

`cameraZoom` resets to `1` only when the renderer creates a fresh session — Restart or a new `StoryDocument` prop — extending the already-locked `PresentationState` reset semantics (Section 20.23–20.24) to this field. It is not reset on Scene navigation or any other ordinary transition.

## 22.9 Persistent vs. Ephemeral State Boundary

The architectural separation is locked as:

```text
PresentationState.cameraZoom   = persistent visual state
TimedPresentationGate          = ephemeral suspension/timing state (Section 22.18)
```

These concerns are never merged. Animation/timer lifecycle remains renderer-local and ephemeral, exactly mirroring the already-locked separation between `PresentationState` and `PauseGate` (Section 21.7–21.8).

## 22.10 CameraSurface DOM Structure

A stable internal `CameraSurface` wraps the visual assets only:

```text
PresentationSurface
  ├─ CameraSurface
  │   ├─ Background
  │   └─ foreground Layer
  └─ Narrative UI
```

The camera transform applies only to Background and the foreground Layer. It must never transform narrative text, Choice buttons, the Presentation acknowledgement, Continue/Next, or completed/error UI — narrative UI stays a separate, untransformed sibling at normal scale (Section 22.32).

## 22.11 CameraSurface Stability

`CameraSurface` must be a persistent, unkeyed DOM element across ordinary renderer result changes. It must not be mounted only while the current result is Camera, must not be keyed/remounted per Camera command, and must not be replaced between content/choice/presentation renders. This stability is required so an ordinary CSS transition can animate from the previously committed transform value to the next Camera target (Section 22.22) — the persistent visual surface exists independently of the current narrative result, exactly like the existing Background/Layer slots already do.

## 22.12 Transform Origin

The current AST has no camera anchor/origin. Locked renderer policy: `transform-origin: center center`. This is Web Renderer policy, not DSL semantics — the renderer does not infer a focus point from Layer placement or asset content.

## 22.13 Viewport Clipping

The presentation surface must clip transformed visual content, using structural behavior equivalent to `overflow: hidden` on the visual viewport/container — this prevents zoomed visuals from painting outside the renderer surface. A zoom below `1` may reveal empty space inside the viewport; that is accepted in this first slice as an honest consequence of an unclamped zoom domain, not a defect to compensate for. Zoom is not clamped to `>= 1` (Section 22.4).

## 22.14 Duration Omitted

When `durationMs === undefined`, the accepted `cameraZoom` is applied immediately, in the same transition as Background/Layer (Section 20.9); the Camera Presentation acknowledgement is exposed with a plain, immediately-available **Next** action, exactly like every other non-timed Presentation command. No timing gate is created, and no hidden default duration is invented.

## 22.15 Explicit Zero Duration

When `durationMs === 0`, the command is still classified as **explicitly timed** (Section 22.29) — this intentionally differs from an omitted duration. Behavior: the accepted target is applied immediately, the Camera suspension begins locked, an asynchronous zero-delay timing lifecycle runs through the same deadline mechanism as any other timed suspension, and Continue becomes available once that lifecycle completes — the user still explicitly presses Continue rather than a plain Next. `undefined` and `0` are never collapsed into the same behavior.

## 22.16 Positive-Duration Camera

For `durationMs > 0`: the Camera result arrives, the valid target zoom is applied (persistent state, same transition), the visual transition starts (Section 22.21), the timed gate locks (no active Next/Continue), the authored duration elapses, the gate unlocks, Continue becomes available, and the user's Continue click performs exactly one `advancePlayer()` call. The timer itself never advances narrative execution (Section 22.17).

## 22.17 No Camera Auto-Advance

Timed Camera completion — positive duration or explicit zero — must never call `advancePlayer` or `selectPlayerChoice`. Animation/timer completion changes only renderer-local gate state, preserving "one explicit user action per Presentation suspension" exactly as already locked for Pause (Section 21.4), with no new justification for treating Camera differently.

## 22.18 Generalized Timed-Presentation Gate

Now that both `Pause` and `Camera` with `durationMs !== undefined` share the identical timing/gate lifecycle, the previously Pause-specific gate (Section 21.8) generalizes into one internal timed-Presentation gate:

```ts
interface TimedPresentationGate {
  readonly suspension: PresentationResult | null;
  readonly unlocked: boolean;
}
```

(Exact internal type/naming is implementation-level.) The timed-command classifier is explicitly limited to the two currently supported cases — `Pause`, and `Camera` with an explicit `durationMs` — and must not become a plugin registry, a generic scheduler, or an extensible timing framework. This is a narrow, behavior-preserving generalization, not a new abstraction layer for hypothetical future timed commands.

## 22.19 Pause Non-Regression

Generalizing the gate is permitted only if every already-locked Pause semantic remains unchanged: Pause starts locked; duration completion never auto-advances; Continue remains explicit; consecutive identical Pause commands remain independent (no stale-gate leakage, Section 21.8–21.10); Strict Mode behavior (Section 21.12), large-duration chunking (Section 21.18), zero-duration behavior (Section 21.19), and all cancellation semantics (Section 21.14–21.16) are unchanged. The existing Pause test suite remains authoritative — it must continue passing, with at most an import/name update, never a behavioral change.

## 22.20 Shared Timing Helper

Camera reuses the existing deadline-based timing helper (Section 21.18, `waitUntilDeadline`) unchanged — deadline calculation, safe-timeout chunking, cancellation, Strict Mode cleanup compatibility, zero-duration asynchronous completion, the stale-callback guard (Section 21.13), and fail-open scheduling behavior (Section 21.20) all apply identically. These mechanics remain fully independent of Camera's visual animation rendering — no timer logic is duplicated for Camera.

## 22.21 Animation Mechanism

A CSS transition on `CameraSurface`:

```text
transform: scale(cameraZoom)
transition-property: transform
transition-duration: <duration>
transition-timing-function: ease
```

No animation library, Web Animations API, `requestAnimationFrame` interpolation, or custom animation loop is added.

## 22.22 Animation Starts From Prior Zoom

Because `CameraSurface` is already mounted and retains the previously committed `transform: scale(previousZoom)` (Section 22.11), a Camera command that changes persistent `cameraZoom` causes the next commit to change that same element's `transform` to `scale(newZoom)` with the current Camera transition duration — the browser's own CSS transition machinery animates between those two computed values with no artificial two-render staging step, `requestAnimationFrame` trick, or separate from/to bookkeeping required. `transition-duration` is read directly from the current Camera command's `durationMs` when it is the active result (defaulting to an inert value otherwise), since a transition only actually triggers exactly when `cameraZoom` changes, which only happens while that same command is still current.

## 22.23 Narrative Unlock Independent of `transitionend`

`transitionend` is never the authoritative narrative timing signal. Camera unlock uses the same deadline/timer mechanism as Pause (Section 22.20), because: transition events can be interrupted or omitted; reduced-motion behavior may suppress them entirely; this project's test DOM environment does not run a real CSS transition engine; and narrative timing must remain deterministic and testable independent of whatever the rendering engine visually does. CSS animation is purely visual; `TimedPresentationGate` alone controls narrative readiness — these are deliberately separate mechanisms with no coupling between them.

## 22.24 Camera Interruption Model

Timed Camera commands cannot overlap under this interaction model: a timed Camera is locked until its authored duration completes, and the user cannot reach another Presentation command until Continue becomes available and is pressed. No animation-interruption system is needed. Durationless Camera commands may follow each other through ordinary, rapid explicit Next actions and simply replace the persistent absolute zoom each time, with no animation to interrupt.

## 22.25 Reduced Motion

`prefers-reduced-motion: reduce` is honored for visual Camera animation only: the visual transform jumps immediately to the final zoom, but the authored narrative timing gate is unchanged — reduced motion affects motion, never story pacing, and Camera is never unlocked early merely because motion is reduced. A minimal internal `matchMedia` check is sufficient; no live preference/settings subsystem is built, and no public prop is added. Whether the preference is sampled once per Camera suspension or through a small renderer helper is implementation-level, provided visual motion is suppressed when reduction is active and the authored timing duration is fully preserved.

## 22.26 Easing

Fixed renderer policy: `ease`, applied uniformly to every Camera zoom transition. This is renderer policy, not author-controlled DSL semantics — no easing syntax or public prop is added.

## 22.27 Animation Failure Behavior

Narrative correctness never depends on CSS animation successfully running. If the browser does not visibly animate the transform, the final accepted value may simply appear immediately; the Camera timing gate continues independently, Continue unlocks according to the authored duration, and no `RuntimeExecutionError` occurs. The renderer never deadlocks waiting for an animation event (Section 22.23).

## 22.28 Camera Acknowledgement UI

```text
Durationless Camera:            Camera acknowledgement + Next
Timed Camera, locked:           Camera acknowledgement + "Animating…" (no active Next/Continue)
Timed Camera, unlocked:         Camera acknowledgement + Continue
```

Exact acknowledgement/label wording remains implementation-level (matching Section 21.21's precedent for Pause). No active Next button is shown while a timed Camera is locked, and no skip action is added.

## 22.29 Timed Classification Rule

A Camera command is timed exactly when `durationMs !== undefined` — not only when `durationMs > 0`. Therefore `durationMs = 0` (Section 22.15) still participates in the `TimedPresentationGate` lifecycle. Pause remains always timed, since `PauseCommand.durationMs` is never optional (Section 21.2).

## 22.30 Invalid Zoom + Timing Independence

Visual validity (Section 22.4–22.5) and timing classification (Section 22.29) are independent axes and must never be conflated: `Camera(to=0, duration=1s)` behaves as persistent-zoom-unchanged **and** a Camera suspension visible **and** a timed gate locked for 1s **and** Continue available after the duration — it is never silently downgraded to durationless (plain-Next) behavior merely because its zoom value was rejected.

## 22.31 Completed/Error Behavior

Persistent camera zoom remains active behind completed and error UI, exactly like Background/Layer's already-locked precedent (Section 20.25) — extended here to `cameraZoom`. Execution terminating or erroring never resets Camera state; only Restart does (Section 22.8).

## 22.32 Background/Layer Orthogonality

Camera state and asset state remain fully independent: a later Background/Layer command does not reset Camera and does not need to know Camera state, and automatically renders inside the existing `CameraSurface` transform purely as a structural consequence of the DOM nesting (Section 22.10) — no code needs to coordinate the two. Symmetrically, a later Camera command never alters the Background or Layer reference.

## 22.33 Public API Scope

No public API change. `AfterTextPlayerProps` remains exactly as already locked (Section 20.11's `resolveAsset`, unchanged). No camera callback, animation callback, zoom prop, easing prop, reduced-motion prop, timing prop, or scheduler-injection point is introduced — Camera behavior stays entirely internal to `@aftertext/web-renderer`.

## 22.34 Testing Requirements

Status: informational

Pure `PresentationState` tests: initial `cameraZoom === 1`; a valid Camera command sets/replaces `cameraZoom`; `to=1` returns to identity; a valid fractional zoom below 1 is accepted; `0`, negative, `Infinity`, `-Infinity`, and (defensively) `NaN` are each ignored, leaving `cameraZoom` unchanged; a large finite positive value is accepted unclamped; Camera never alters `background`/`layer`, and Background/Layer/Music/Sfx/Pause never alter `cameraZoom`; input immutability. Timed-gate tests (after generalization, Section 22.18): every existing Pause timing test still passes unmodified in behavior (Section 22.19); a durationless Camera is not classified as timed; `duration=0` and any positive duration are classified as timed; a new timed Camera cannot inherit a stale Pause gate and vice versa; consecutive timed Camera suspensions are independent, mirroring Pause's own identity guarantee (Section 21.9–21.10). Component tests: Camera target changes `CameraSurface`'s transform; `CameraSurface` remains persistent/stable across result changes (Section 22.11); narrative UI is outside the transformed subtree; durationless Camera uses plain Next; `duration=0` begins locked and asynchronously unlocks Continue; positive duration begins locked and unlocks exactly at the authored deadline with no auto-advance and exactly one Player transition per Continue click; zoom persists into content, Choice, navigation, and through Background/Layer replacement; completed/error retain zoom; a second Camera begins from the previous persistent zoom; Restart and document replacement reset zoom to `1`; Strict Mode safety and unmount cancellation (mirroring Section 21.12/21.16); reduced motion suppresses visual transition duration while the gate still waits the full authored duration; an invalid zoom never emits an invalid transform; an invalid-zoom timed Camera still observes its own timing gate (Section 22.30). Tests must not assert actual CSS interpolation frames in the project's test DOM environment (Section 22.23). All existing Pause tests are run and must remain green, unchanged in behavior.

## 22.35 Demo Requirements

Status: informational

The embedded demo (Section 19.22/21.27) adds one short timed zoom (e.g. `@camera zoom to=1.3 duration=800ms`) to the existing sample story, and later a durationless `@camera zoom to=1` to visibly restore identity before the story ends — no new demo assets are required, and timings stay short enough for convenient manual verification, matching Pause's own demo precedent.

## 22.36 Explicit Deferred Scope

Not implemented in this slice: camera pan, camera x/y position, an author-controlled transform-origin/anchor DSL, camera shake, rotation, an easing DSL, keyframes, `transitionend` as a narrative-authority signal, scene fades/crossfades, a timeline engine, autoplay, skip, animation speed controls, user animation settings, editor camera tooling, or mobile-renderer changes.

## 22.37 Compiler-Hardening Follow-Up (superseded by Section 24)

Status: informational, non-binding

The compiler's numeric literal parsing can produce non-finite AST values (`Infinity`/`-Infinity`) from extreme-but-syntactically-valid literals — now empirically confirmed for Pause/Camera durations (Section 21.2) **and** for Camera `to` (Section 22.2). Renderer-side defenses (Section 22.5) are sufficient for this feature and no compiler change is made in this branch. **Superseded by Section 24**, which now locks the centralized compiler-hardening design this note anticipated.

---

# 23. Web Audio Presentation

Status: LOCKED

Sits inside `@aftertext/web-renderer` (Section 19), adding the first *real* browser interpretation of the existing `MusicCommand`/`SfxCommand` on top of the persistent-visual layer (Section 20), the real-timing infrastructure (Section 21), and Camera zoom (Section 22). It does not change compiler AST, runtime execution, or Player semantics — nothing here requires or produces a compiler/runtime/player change.

## 23.1 Scope of This Slice

This slice implements real browser audio playback for exactly two existing commands: `Music` (persistent, single-slot, replace-on-every-occurrence) and `Sfx` (transient, one-shot, no persistent state). Neither gains a timing gate — neither carries any duration field in the current AST (Section 23.2–23.3). No new Camera/Pause behavior is touched.

## 23.2 Current `MusicCommand` AST/Parser Facts

Recorded here for reference (authoritative definition remains `packages/compiler/src/ast/presentation.ts` and its parser, Section 14):

```ts
interface MusicCommand {
  readonly type: "Music";
  readonly track: string;
  readonly volume: number | undefined; // absent when volume= wasn't given
}
```

Source syntax: `@music <track> [volume=<number>]`. `track` is a required positional value (missing it is a compile error, matching Background/Layer/Sfx's own "requires a file path" precedent). `volume` is optional and, when present, accepts any syntactically valid signed decimal with **no compiler-enforced range** — negative, zero, and greater-than-one all compile without error. **Confirmed empirically**: the same numeric-overflow finding already recorded for Pause/Camera (Section 21.2, 22.2) also applies to `volume` — an extreme-but-valid literal can overflow to `Infinity`/`-Infinity` with no compiler error; `NaN` is not reachable from the compiler today. There is currently no stop/clear command, no loop field, no duration field, no fade field, and no playback-rate field anywhere in the AST. This slice introduces no new compiler validation.

## 23.3 Current `SfxCommand` AST/Parser Facts

```ts
interface SfxCommand {
  readonly type: "Sfx";
  readonly clip: string;
}
```

Source syntax: `@sfx <clip>`, a single required positional value, identical shape/validation to Background/Layer. **Confirmed empirically**: a trailing `volume=` (or any other) parameter on `@sfx` is tokenized but never read — `SfxCommand` carries no volume, duration, or loop field of any kind today, and there is no stop semantics.

## 23.4 Runtime/Player Behavior

Music and Sfx continue to use the existing generic Presentation suspension model unchanged (Section 17, 18.5–18.6): each authored `@music`/`@sfx` directive becomes one observable `PresentationResult`, suspending exactly once and requiring explicit user acknowledgement, via the same single generic `"Presentation"` runtime case already used for every other Presentation command — confirmed to carry zero Music/Sfx-specific code anywhere in `@aftertext/runtime`/`@aftertext/player`. No compiler/runtime/player change is required for this slice. No audio command may auto-advance narrative execution (Section 23.31).

## 23.5 Music Persistent Semantic State

`PresentationState` (Section 20.5, 22.6) gains one field:

```ts
interface MusicPresentationState {
  readonly track: string;
  readonly volume: number | undefined;
}

interface PresentationState {
  readonly background: string | null;
  readonly layer: string | null;
  readonly cameraZoom: number;
  readonly music: MusicPresentationState | null;
}
```

(Exact internal naming is implementation-level.) `PresentationState.music` stores only authored semantic intent — the raw `track` reference and the raw authored `volume`, exactly as the compiler produced them. It must never contain an `HTMLAudioElement`, a `Promise`, a timer, an event listener, a playback-status flag, or any other browser/media handle (Section 23.30). Initial value: `null`.

## 23.6 Music Persistence

Once a Music command is accepted, its semantic `music` state persists through every ordinary result — Content, Choice, Navigation, Background, Layer, Camera, Pause, Sfx, completed, and runtime error — identical in shape to Background/Layer/Camera's already-locked persistence rule (Section 20.6, 22.7). It resets to `null` only on Restart or a new `document` prop (Section 23.23–23.24). Component unmount also stops the browser-owned audio object (Section 23.25), but this is lifecycle cleanup, not a `PresentationState` transition.

## 23.7 Music Replacement

Every authored Music command replaces the current semantic music state outright: `Music A` followed by `Music B` results in `music = B`. The single browser-owned Music element is retargeted to `B` and playback starts again from the beginning. There is exactly one persistent Music slot (Section 23.11) — no crossfade, no fade, no overlap between persistent Music tracks.

## 23.8 Same-Track Music

A later authored Music command using the same track reference is still a new, independent observable Presentation event — never suppressed or deduplicated by comparing it against the currently-stored semantic state:

```text
Music A -> content -> Music A
```

The second `Music A` restarts playback of that track from the beginning. This follows the same principle already locked for Pause/Camera (Section 21.8–21.9, 22.8): an authored Presentation event's identity is never derived from equal command *values* alone.

## 23.9 Music Volume

The authored `volume` value is stored unchanged in `PresentationState.music` (Section 23.5). Renderer playback maps it to `HTMLMediaElement.volume` (which only accepts `[0, 1]` and throws outside that range) via this locked policy:

```text
volume === undefined            -> playback volume 1
finite, 0 <= volume <= 1        -> use the authored value
finite, volume < 0              -> clamp playback volume to 0
finite, volume > 1              -> clamp playback volume to 1
NaN / Infinity / -Infinity      -> playback volume 1
```

The renderer must never assign an out-of-range or non-finite value to `HTMLMediaElement.volume`. This clamping/default behavior is renderer policy only, exactly like Camera's zoom-domain guard (Section 22.4–22.5) — it does not change what `PresentationState.music.volume` stores, only what is applied to the element. Non-finite numeric parsing was recorded as future centralized compiler-hardening work (Section 23.37) and is now resolved by Section 24 (Compiler Numeric Hardening) — the compiler still imposes no `[0, 1]` range validation, so this renderer-side normalization remains necessary and unchanged.

## 23.10 Music Looping / Natural End

Music does not loop automatically in this slice — the current DSL has no loop field (Section 23.2), and the renderer must not invent implicit background-music looping to compensate. When playback reaches its natural end: no Player transition occurs, no `PresentationState` transition occurs, the semantic `music` state remains exactly the currently-authored Music intent, and the browser element simply remains ended (the renderer does not auto-restart it — doing so would be inventing looping through the back door). A future DSL/compiler extension may add explicit loop semantics (Section 23.36).

## 23.11 Music Browser-Object Ownership

The long-lived Music `HTMLAudioElement` is renderer-local ephemeral state, owned by an `AfterTextPlayer`-internal ref or a narrowly extracted internal hook/module owned by `AfterTextPlayer` — never by `PresentationState`, `PlayerState`, `RuntimeState`, or `PresentationSurface` (which remains a pure rendering component, Section 20.10). There is exactly one persistent Music playback slot, mirroring the single persistent Background/Layer/CameraSurface precedent (Section 20.3, 22.11).

## 23.12 Music Suspension Behavior

Music is not timed — it carries no duration field (Section 23.2) and does not participate in `TimedPresentationGate` (Section 23.27). On a Music suspension: playback is attempted, the existing Music acknowledgement is shown, and Next is immediately available — the renderer does not wait for loading, for the `play()` promise to resolve, or for track completion. Playback and narrative acknowledgement remain fully independent, exactly matching the already-locked principle that a timing gate is never introduced merely because a side effect is asynchronous (Section 21.11).

## 23.13 Sfx Semantics

Sfx is a transient, one-shot renderer-side playback event and is not stored in `PresentationState` at all — nothing later needs to recall a past Sfx occurrence. On each Sfx suspension: the asset resolves, an independent playback instance is created, playback is attempted once, the existing acknowledgement is shown, and Next is immediately available. Each authored Sfx occurrence is independent of every other; two identical consecutive `@sfx` commands must each attempt playback exactly once (Section 23.15 tracks the resulting instances for cleanup only, never for deduplication).

## 23.14 Sfx Overlap

Independent Sfx playback instances may overlap. A new Sfx command does not stop an older Sfx instance, and advancing the narrative does not stop an Sfx instance either. This slice does not introduce a single shared Sfx element, an instance pool, ducking, or any interruption policy.

## 23.15 Active Sfx Lifecycle Tracking

Although Sfx has no semantic persistent state (Section 23.13), the active browser `Audio` instances it creates must be tracked renderer-locally so they can be cleaned up (Section 23.16). A minimal internal structure such as a `Set<HTMLAudioElement>` is acceptable; this is ephemeral cleanup bookkeeping only, never exposed publicly and never stored in `PresentationState`. An instance is removed from this tracking set when its playback naturally ends or fails.

## 23.16 Sfx Cleanup

Active Sfx instances (Section 23.15) are stopped and cleared on Restart, document replacement, and component unmount — old-document Sfx must never continue audibly into a new story/session. Ordinary narrative advancement does not stop an Sfx instance (Section 23.14), and reaching completed/error does not automatically stop an already-running Sfx (Section 23.26).

## 23.17 Autoplay/User-Activation Architecture

A bare React effect must not be used to initiate Music or Sfx playback. Playback initiation must occur **synchronously within the explicit user event handler** that causes the new Presentation suspension to become current — Start, Next, Continue, or a Choice selection. The implementation may compute the next pure Player/session result before committing React state, inspect the resulting suspension, and synchronously claim its audio intent there, still within that same handler. `play()` must never be called from component render, from a `setState` updater callback, or from a `useEffect` that only runs after render commits. This architecture is locked specifically to keep playback initiation as close as reliably possible to genuine browser user activation — unlike Pause/Camera timer scheduling (Section 21.11), which has no user-activation requirement and correctly uses a plain effect, audio playback does. Restart performs cleanup only (Section 23.23) and never fabricates new playback.

## 23.18 Strict Mode Safety

Audio playback must not depend on any "effect runs once" assumption. Because actual `play()` initiation occurs only inside explicit event handlers (Section 23.17), which React's Strict Mode does not double-invoke (unlike render bodies, state-updater callbacks, and effect setup/cleanup, which it does): Strict Mode's render re-execution must not duplicate Music playback, and its effect setup/cleanup double-invoke must not duplicate Sfx playback. No separate claimed-suspension gate is required as long as playback remains structurally event-handler-owned. If implementation evidence proves this insufficient, that is a blocker to report before adding any generic identity/scheduler framework — not something to silently work around.

## 23.19 Playback Failure Policy

All browser/media playback failures are renderer-local and non-fatal, extending the already-locked failure policy for image loading (Section 20.21) and timer scheduling (Section 21.20) to audio. This includes: a resolver returning `null`, an unsafe URL, an unsupported codec, a network/load failure, a native media `error` event, a rejected `play()` promise, and an autoplay restriction. None of these may ever become a `RuntimeExecutionError`, mutate `RuntimeState`/`PlayerState`, auto-advance narrative execution, or produce an unhandled promise rejection. No automatic retry system is introduced. A small renderer-local "unavailable" indication is permitted if implementable without expanding the public API, but is not required for narrative correctness.

## 23.20 Asset Resolver Widening

The existing optional public resolver prop widens from:

```ts
resolveAsset?: (ref: string, kind: "background" | "layer") => string | null;
```

to:

```ts
resolveAsset?: (ref: string, kind: "background" | "layer" | "music" | "sfx") => string | null;
```

The same resolver is used for every renderer asset category — no parallel `resolveAudio` prop is added. **This is an intentional public type widening, not a no-op**: a consumer using exhaustive switching over `kind` (e.g. with a `never`-typed exhaustiveness check, the same idiom this project's own source uses throughout) will need to handle the two new members, and may see a genuine compile-time error until they do. This is explicitly recorded as real, narrow, acknowledged source-level impact — not described as "no public API impact."

## 23.21 Asset Resolution Timing

`PresentationState` continues to store authored raw references, never resolved URLs (Section 20.5, 23.5), so resolver invocation remains entirely renderer-local and changing the resolver's identity must never rewrite story/runtime state (Section 20.12). For Music, the currently-authored track resolves through the current resolver immediately before each playback attempt. For Sfx, each authored occurrence resolves independently, at the moment of that occurrence. No resolved URL is ever persisted in `PresentationState`.

## 23.22 Media URL Safety

The existing image-asset URL safety implementation (Section 20.14) is generalized rather than duplicated for Music/Sfx, preserving all existing image safety behavior unchanged. For Music/Sfx, accepted: relative URLs, absolute-path URLs, `http:`, `https:`, `blob:`, and `data:audio/*` specifically. Rejected: `javascript:`, an arbitrary `data:` MIME type, and any other unsupported scheme — the same obfuscation-resistant, WHATWG-`URL`-based approach already locked for images (Section 20.14) and links (Section 19.9). Image assets continue accepting only their already-locked `data:image/*` policy; Background/Layer safety is not weakened by this generalization.

## 23.23 Music Playback Reset

On Restart: the current Music browser element is stopped/paused and its playback state cleared or retargeted as needed, a fresh renderer session is created exactly as already locked (Section 20.23, 21.14, 22.8), and `PresentationState.music` resets to `null`. The initial story does not regain Music until authored execution reaches a Music command again.

## 23.24 Document Replacement

When the `document` prop changes: the fresh renderer session's `music` is `null`, the current Music browser element is stopped, and all active Sfx instances (Section 23.15) are stopped and cleared — old-document media must never continue audibly into the new document. Stopping/cleanup may use ordinary React effect cleanup, since user activation is irrelevant to *stopping* media (only *starting* it, Section 23.17, has that constraint) — mirroring exactly how Pause/Camera timer cancellation already uses effect cleanup on document replacement (Section 21.15, 22.23). This cleanup effect must never initiate new-document playback itself.

## 23.25 Component Unmount

On unmount: the current Music element is stopped, all active Sfx instances are stopped and cleared, and any relevant browser listeners are removed — via ordinary effect cleanup, exactly mirroring Section 21.16/22.11's unmount handling. No state update is required (or attempted) after unmount.

## 23.26 Completed/Error Behavior

Music semantic state and actual Music playback continue through completed and runtime error exactly as persistent visual Presentation state already remains visible through terminal UI (Section 20.25, 22.31) — this is a deliberate consistency choice, not an assumption that audio must behave identically to visuals for any other reason. An already-running Sfx instance is not interrupted merely because terminal UI appears. Only Restart, document replacement, and component unmount perform session-level media cleanup (Section 23.23–23.25).

## 23.27 `TimedPresentationGate` Non-Participation

Music and Sfx do not participate in `TimedPresentationGate` (Section 22.18). `timed-presentation.ts` requires no behavioral change for audio: neither `MusicCommand` nor `SfxCommand` carries any authored duration in the current AST (Section 23.2–23.3), and none is added by this slice.

## 23.28 Reduced Motion / Accessibility

`prefers-reduced-motion` does not control audio and is not consulted for Music/Sfx — no browser "reduced sound" preference exists to infer, and none is invented. No mute UI, global volume UI, audio settings, or autoplay settings are added in this slice. Playback occurs only as a direct consequence of explicit story interaction (Section 23.17), which is itself the primary accessibility-relevant property of this design.

## 23.29 Presentation UI

Music and Sfx remain ordinary non-timed Presentation acknowledgements: acknowledgement text plus an immediately-available Next action, exactly like every other non-timed command (Section 21.22, 22.14). No Continue gate, progress bar, countdown, playback-complete gate, or skip control is added for either.

## 23.30 Pure/Ephemeral Separation

The architecture boundary is locked explicitly:

```text
Pure semantic state:      PresentationState.music
Ephemeral browser state:  Music HTMLAudioElement
                           active Sfx Audio instances (Section 23.15)
                           native media listeners
                           play() Promises
```

No browser media object may ever enter the pure state graph, exactly mirroring the already-locked separation between `PresentationState` and `TimedPresentationGate` (Section 21.7, 22.9).

## 23.31 No Auto-Advance

None of the following may ever call `advancePlayer`/`selectPlayerChoice`: a `play()` success, a `play()` rejection, a media `ended` event, a media `error` event, a Music replacement, or Sfx completion. Only explicit user narrative actions advance execution — extending Section 21.4/22.17's already-locked rule to every audio-related event.

## 23.32 Integration Behavior

Status: informational

An integration scenario, to be exercised with actual compiler source in implementation tests: content → Music A (acknowledgement + Next) → content while Music A continues → Sfx (acknowledgement + Next) → content while the Sfx may finish independently → Music A again (restarts from time 0, per Section 23.8) → content.

## 23.33 Demo Requirements

Status: informational

The embedded demo (Section 19.22) prefers using its existing authored Music reference where possible, adding only the minimum new Sfx directive needed for manual verification. No binary audio asset is added to the repository; if embedded audio is needed for manual playback verification, a tiny renderer-demo-only `data:audio/*` mapping is acceptable, kept out of the published package output exactly like the demo's existing image fixtures (Section 20.27).

## 23.34 Expected Implementation Scope

Status: informational

Implementation remains inside `packages/web-renderer`: likely `src/presentation-state.ts`, `src/asset-safety.ts`, `src/after-text-player.tsx`, possibly one narrow internal audio helper/hook/module, possibly `src/presentation-view.tsx`, plus tests, an integration test, and the demo. No compiler/runtime/player change is expected; if implementation reveals one is genuinely required, that is a blocker to report before proceeding, not to silently work around (Section 23.4).

## 23.35 Testing Requirements

Status: informational

Pure `PresentationState` tests: initial `music === null`; a Music command sets the raw track/volume; a later Music command replaces it; a same-track Music command remains a valid, independent authored transition (Section 23.8); Background/Layer/Camera/Pause/Sfx preserve `music` and Music preserves visual state; input immutability. Music playback tests: first Music attempts playback exactly once; replacement stops/retargets/restarts; same-track Music restarts; the volume mapping (Section 23.9) for `undefined`, in-range, negative, greater-than-one, and non-finite values; resolver-null, unsafe-URL, `play()`-rejection, and media-error handling are all non-fatal and leave the narrative usable; completed/error continue Music; Restart/document-replacement/unmount stop Music; Strict Mode does not duplicate playback. Sfx tests: one authored command creates one playback attempt; consecutive identical commands create independent attempts; overlap is permitted; narrative advancement does not stop Sfx; Restart/document-replacement/unmount stop and clear active Sfx; a naturally-ended or failed instance is removed from cleanup tracking; failures remain non-fatal; Strict Mode does not duplicate playback. Integration: real compiler source exercising Music and Sfx together, confirming plain Next (no timing gate), no auto-advance, and same-track replay. Tests must not assert that the project's test DOM environment actually decodes or audibly plays media (mirroring Section 22.23/22.34's equivalent constraint for CSS animation).

## 23.36 Explicit Deferred Scope

Not implemented in this slice: loop DSL/configuration, a stop command, fade in/out, crossfade, pause/resume Music, seek, playback rate, global volume, mute UI, user audio settings, a preload framework, the Web Audio API, audio sprites, spatial audio, ducking, Sfx pooling, waveform/progress UI, timeline synchronization, editor tooling, or mobile-renderer changes.

## 23.37 Compiler-Hardening Follow-Up (superseded by Section 24)

Status: informational, non-binding

The non-finite numeric-overflow finding already recorded for Pause/Camera (Section 21.2, 22.2, 22.37) is joined by Music `volume` (Section 23.2) as a third confirmed instance of the same compiler numeric-parsing behavior. Renderer-side defenses (Section 23.9) are sufficient for this feature and no compiler change is made in this branch. **Superseded by Section 24**, which now locks the centralized compiler-hardening design this note anticipated.

---

# 24. Compiler Numeric Hardening

Status: LOCKED

Resolves the previously-recorded non-finite numeric-overflow follow-ups from Pause (Section 21.2), Camera (Section 22.2, 22.37), and Music (Section 23.2, 23.37). This section locks a compiler-only design: authored numeric syntax that is lexically valid but converts to a non-finite JavaScript number must be rejected with a deterministic diagnostic, never silently emitted into the semantic AST. It does not change runtime or player semantics, does not change any AST shape, and does not add any range/domain validation beyond finiteness.

## 24.1 Scope

This section covers exactly one correction: closing the gap where a lexically-valid but numerically-unrepresentable authored literal (e.g. an extreme-length digit run) silently becomes `Infinity`/`-Infinity` in the compiled `StoryDocument`. It applies to every current compiler-produced numeric value: expression numeric literals (`@set`, `@if`/`@elseif`/`@when` conditions, Choice-item conditions), Pause duration, Camera `to`, Camera duration, and Music volume. It does not touch accepted lexical grammar, unit requirements, sign handling, rounding policy, or any domain-specific range rule.

## 24.2 The Finite-Number Invariant

```text
Every numeric value emitted into the semantic AST from authored numeric
syntax MUST be a finite JavaScript number.
```

Equivalently, `Number.isFinite(value) === true` must hold for every authored numeric value entering the semantic AST — expression numeric literals, Pause duration, Camera `to`, Camera duration, and Music volume alike. This is a **representability invariant only**, not domain/range validation: it says nothing about whether a value is positive, in `[0, 1]`, or below some maximum — only that it must be a value JavaScript's `number` type can actually represent.

## 24.3 Lexical Validity Is Insufficient

Lexically valid numeric syntax does not imply a valid semantic numeric value. A literal such as several hundred consecutive digits satisfies the existing numeric grammar (a plain, unbounded-length run of digits with an optional decimal part) but overflows `Number`'s finite range during conversion. Such a literal is lexically well-formed and semantically invalid for compiler output — the grammar accepting it is not evidence that the resulting value is usable.

## 24.4 Reject, Never Clamp

If authored numeric syntax is lexically valid but its conversion is non-finite (`Infinity`, `-Infinity`, or `NaN`), the compiler rejects that value with a deterministic diagnostic. It must never clamp to a substitute value — not `Number.MAX_VALUE`, not `0`, not `1`, not any other field-specific default — and must never silently preserve the non-finite value. Silently changing authored numeric semantics would contradict the compiler's own responsibility for "numeric parsing; normalization" (Section 7) — normalization of representation, never silent substitution of a different value than what was authored.

## 24.5 Diagnostic AT1302 — Presentation Numeric Value Not Finite

```text
code:      AT1302
category:  1300s (Presentation) — the next code after AT1301
name:      presentationNumericNotFinite
message:   Numeric value is not representable as a finite number.
```

Used for a non-finite authored numeric value in any Presentation command: Pause duration, Camera `to`, Camera duration, Music volume. One shared code across all four fields, exactly mirroring `AT1301`'s own existing pattern of one code covering every malformed-Presentation-directive case; field/directive context may be woven into the message text at each call site (matching how `AT1301`'s existing message already varies by call site, e.g. `invalid "to" value`, `invalid duration`) without needing a distinct code per field.

## 24.6 Diagnostic AT2005 — Expression Numeric Literal Not Finite

```text
code:      AT2005
category:  2000s (Expressions) — the next code after AT2004
name:      expressionNumericNotFinite
message:   Numeric literal is not representable as a finite number.
```

Used when a lexically-valid expression numeric literal — in `@set`, an `@if`/`@elseif`/`@when` condition, or a Choice-item condition — converts to a non-finite JavaScript number.

## 24.7 Why the Two Codes Remain Separate

`AT1302` and `AT2005` enforce the identical underlying finite-number invariant (Section 24.2) but remain two codes, not one, because the compiler already maintains separate diagnostic families for Presentation grammar/semantics (`AT13xx`) and Expression grammar/semantics (`AT2xxx`) — exactly mirroring the already-existing separation between `AT1301` ("malformed presentation directive") and `AT2001` ("malformed expression"), two different codes for the same *kind* of underlying problem (unparseable syntax) in two different grammar contexts. No new global "numeric" diagnostic family is created; each new code slots into its own existing family.

`AT2001` is deliberately **not** reused for the finite-number case. `AT2001` remains the generic malformed-expression-syntax diagnostic (a token stream that doesn't parse at all); `AT2005` is a distinct condition — a numeric literal that parses successfully as a well-formed token but cannot be represented as a finite number. Keeping them separate lets tooling (including source-editing tools) distinguish "this text isn't a valid expression" from "this number is too large/small to represent," which a shared code would collapse into indistinguishable message-text sniffing.

## 24.8 Expression Validation Location

Expression numeric lexing is unchanged: the lexer continues converting a numeric token's text into its current numeric token representation exactly as today. The finiteness check is a semantic validation performed when the parser is about to construct the `Literal` AST node from that token:

```text
tokenize numeric text
  -> parsePrimary sees the numeric token
  -> validate Number.isFinite(token.numberValue)
  -> construct the Literal node only when finite
```

No redesign of the lexer/token protocol is introduced or required.

## 24.9 Expression Diagnostic Span

`AT2005` uses the exact offending numeric token's own span — not the enclosing `@set` directive, not the enclosing condition, not the enclosing Choice item. The parser already computes a precise token-level span for every `Literal` node it constructs today, so no new span infrastructure is needed; this is the natural, already-available level of precision.

## 24.10 Expression Recovery

A non-finite numeric literal is reported through the existing expression-error pipeline, exactly like any other expression syntax problem discovered at that same parse position — no new recovery semantics are introduced. The surrounding construct therefore follows whichever expression-parse-error recovery it already has today: an invalid `@set` expression follows existing `Set`-node recovery, an invalid `@if`/`@elseif`/`@when` condition follows existing conditional-branch recovery, and an invalid Choice-item condition follows its existing condition recovery. This feature changes the diagnostic's *cause*, never the hosting construct's recovery behavior.

## 24.11 Presentation Validation Strategy

Presentation numeric parsing retains its current grammar exactly as-is. The parser ensures only that a value is finite before it is used to construct the semantic AST command — using Presentation's own existing local parsing helpers, without being forced into a shared abstraction with expression parsing where that would create an unnatural dependency (Section 24.25).

## 24.12 Presentation Diagnostic Span

`AT1302` uses the most precise span currently supported by the Presentation parser without introducing a new token/span-tracking architecture: the same offending-directive span already used by every neighboring Presentation diagnostic (`AT1301`). Presentation parameter tokenization does not currently track individual parameter positions, so a narrower parameter-value-only span is not available without a genuine (and, for this branch, out-of-scope) architectural addition — the directive-level span is the correct, already-supported precision for now.

## 24.13 Duration Final-Value Validation

Duration finiteness must be validated on the **final stored millisecond value**, not merely the raw parsed amount:

```text
amount = Number(raw)
converted = unit === "s" ? amount * 1000 : amount
durationMs = Math.round(converted)

Number.isFinite(durationMs)   -- must be true before durationMs enters the AST
```

This deliberately covers both ways a duration can become non-finite: the raw amount itself overflowing during conversion from text, and a *finite* raw amount overflowing only after the seconds-to-milliseconds multiplication. Checking only the raw parsed amount is insufficient and would miss the second case.

## 24.14 Pause Behavior

Every finite Pause duration compiles exactly as before — required unit, zero duration, fractional seconds, milliseconds rounding, and the existing nonnegative rule are all unchanged. A lexically-valid Pause duration whose final millisecond value is non-finite produces `AT1302` and follows the existing invalid-Presentation-command recovery (Section 24.25). Renderer Pause defenses (Section 21.17–21.20) are unaffected.

## 24.15 Camera Target Behavior

Camera `to=` remains compiler-domain-agnostic: every currently-accepted finite value — positive, zero, negative, fractional — remains accepted exactly as today. The compiler does not adopt the renderer's `finite > 0` visual-domain rule (Section 22.4) as a compiler-level constraint; that rule stays renderer policy. Only a non-finite `to` value produces `AT1302`. Renderer defensive validation (Section 22.5) is unaffected.

## 24.16 Camera Duration Behavior

Unchanged for every finite value, using the same duration final-value invariant as Pause (Section 24.13). A non-finite final millisecond Camera duration produces `AT1302`.

## 24.17 Music Volume Behavior

The compiler continues to perform no `[0, 1]` range validation — finite values such as `-0.5`, `0`, `0.8`, and `1.5` remain valid compiler output exactly as today. Only a non-finite volume value produces `AT1302`. Renderer playback-volume normalization (Section 23.9) is unaffected and continues to provide defense-in-depth.

## 24.18 Expression Finite-Value Compatibility

Every currently-valid finite expression numeric literal remains valid, with no arbitrary authored-magnitude limit introduced: a value close to `Number.MAX_VALUE` remains valid as long as `Number.isFinite(value)` is true. Rejection is based on actual representability, never on source-text length or an arbitrary digit-count ceiling.

## 24.19 Runtime Arithmetic Remains Separate

This invariant applies only to numeric values emitted directly from authored numeric syntax at compile time. It does not replace or weaken runtime's own, already-locked arithmetic-result protection (Section 17: "the result of any arithmetic operation must remain representable as a valid JSON number") — finite authored operands can still produce a non-finite *result* during runtime arithmetic (e.g. a finite value multiplied by another finite value overflowing to `Infinity`), and the runtime must continue handling that case exactly as already locked, unchanged by this section.

## 24.20 Renderer Defense-in-Depth Remains

Compiler hardening does not remove or weaken any renderer-side defensive validation — Camera's invalid/non-finite-target guard (Section 22.5), Pause/Camera's timing-value handling (Section 21.17–21.20), and Music's invalid/non-finite-volume normalization (Section 23.9) all remain exactly as locked. A `StoryDocument` a renderer receives is not guaranteed to have originated from this exact compiler version — it may be hand-constructed, produced by an older compiler predating this hardening, or produced by another compatible producer — so downstream defensive validation remains independently necessary regardless of this section.

## 24.21 NaN Finding

`NaN` is not currently reachable through valid authored numeric lexical forms in the existing numeric grammar (a regex/loop-constrained digit-and-optional-decimal string converted via `Number(...)` can only ever be finite or `±Infinity`, never `NaN`). The invariant is nonetheless expressed generically as `Number.isFinite(...)`, which excludes `NaN` defensively as well, at no extra cost, should it ever become reachable through a future grammar change.

## 24.22 Negative Zero

Existing `-0` behavior is preserved exactly, unchanged and unnormalized by this section. `Number.isFinite(-0)` is `true`, so the finiteness gate correctly passes `-0` through unchanged wherever the existing grammar already allows it.

## 24.23 Scientific Notation

Not added. If the current grammar rejects `1e3`, `1E3`, or `1e-3` for expression literals or Presentation numeric parameters today, it continues rejecting them unchanged — this section is numeric hardening, not a grammar expansion.

## 24.24 Decimal Grammar Edge Cases

Current behavior for forms such as `.5`, `1.`, `00`, `01`, and `-0.5` is preserved exactly as currently implemented, in both the Expression and Presentation numeric grammars, without normalizing any difference between the two. This section changes only whether a converted value must be finite — never which literal forms are lexically accepted.

## 24.25 Shared-Helper Decision

No requirement is locked that Expression and Presentation numeric parsing share one numeric helper. The two paths have materially different parser architecture — Expression parsing works from an already-tokenized numeric token consumed in `parsePrimary`; Presentation parsing works from directive-parameter text consumed by its own local parsing helpers — and each keeps its finiteness check local to preserve existing dependency clarity (Section 21 already establishes `blocks.ts`'s one-directional dependency on `expression-parser.ts`, which this section does not need to deepen). A tiny shared primitive is permitted only if it naturally fits existing module boundaries; no numeric-parsing framework is introduced either way.

## 24.26 Public API Impact

Additive only: `DiagnosticCode` (an already-public exported type) gains two new members, `"AT1302"` and `"AT2005"`. No AST shape changes, no new public compiler function, and no Runtime/Player/Web-Renderer public API change. Generated compiler declarations must expose both new members consistently with the existing public `DiagnosticCode` contract.

## 24.27 Testing Requirements

Status: informational

Compiler tests should cover: every currently-valid finite case for each of the five fields (expression literals including a value near `Number.MAX_VALUE`, Pause duration, Camera `to`, Camera duration, Music volume) continuing to compile unchanged; a raw-literal overflow case for each field producing the correct code (`AT1302` or `AT2005`), correct message, correct span, and correct recovery (the offending command/node omitted, or — for an expression hosting construct — following that construct's own existing recovery); a duration-specific post-conversion-only overflow case (a raw amount that is itself finite but overflows after the seconds-to-milliseconds multiplication) for both Pause and Camera duration; confirmation that a non-finite literal never reaches the compiled `StoryDocument`; and confirmation that unrelated, valid neighboring source in the same document still compiles successfully alongside a rejected directive/expression.

## 24.28 Explicit Deferred Scope

Not implemented in this section: numeric range/domain validation beyond finiteness, Camera `to > 0` compiler enforcement, Music `[0, 1]` compiler enforcement, arbitrary duration maximums, exponent-notation support, arbitrary-precision numbers, bigint, a decimal library, save/load, authoring-tool work, unknown-Presentation-parameter diagnostics, unrelated numeric-grammar cleanup, and removal of any downstream (runtime or renderer) defensive validation.

---

---

# 25. Source Metadata and Source-Tooling Contracts

Status: LOCKED

This section lists the compiler-guaranteed source-location metadata that tools use to make exact, formatting-preserving edits to `.at` source without re-parsing it, and the public helpers for tools that generate `.at` source. These are properties of the compiler's public AST and diagnostics, not of any particular tool: the metadata is complete and deterministic whether or not a tool consumes it, and its availability does not imply that any tool supports editing the corresponding construct.

The subsection numbers are stable and are referenced from source comments; numbers that do not appear here are intentionally not used in this specification.

Common conventions: positions are 1-based line and column with 0-based offsets into the source string (JavaScript string indices, UTF-16 code units); a line terminator is never part of a span unless stated; CRLF input does not shift spans; spans are exact source slices of what the author wrote.

## 25.35 Scene Source Metadata

Status: LOCKED

The compiler guarantees one piece of line-ending metadata on every scene, in addition to `span`, so that source-editing tools can append text at a scene's end without rescanning raw source.

**`SceneNode.followingLineEnding`** is `"\n" | "\r\n" | ""`. It is the exact line-terminator byte sequence immediately following `span.end`:

- `"\n"` or `"\r\n"` when the physical line containing `span.end` ends with that terminator.
- `""` when `span.end` is at true end-of-file with no authored terminator.

Rules:

- It reports only the single immediate terminator. Indentation, blank-line trivia, and any text following that terminator are not part of it and remain outside `span`.
- It is read from the parser's per-line terminator tracking (never from a rescan of the source). It is correct when the body follows YAML frontmatter.
- Every compiler-produced `SceneNode` populates it, including the synthetic leading scene (below). The property is optional on the public type only so that hand-constructed `SceneNode` values remain source-compatible.
- It is a source fact only. It does not affect Runtime, Player, or DSL semantics.

**Scene span end.** An explicit scene's `span` starts at its `@scene` line and ends at the end of its last block, or at the end of the `@scene` line when the scene has no blocks. The span never includes trailing blank lines.

**Synthetic leading scene.** Content before the first `@scene` directive, including an entire `@scene`-less document, forms a scene with id `"main"` (`SYNTHETIC_LEADING_SCENE_ID`). If the body has no content and no explicit scene, `StoryDocument.scenes` still contains one empty `main` scene whose `span` is zero-width at the start of the body (document start when the body is empty), and whose `followingLineEnding` is computed at that position. An explicit `@scene main` alongside a synthetic `main` is reported as `AT1003`.

Verification: `test/scenes.test.ts` (`SceneNode.followingLineEnding`: LF, CRLF, true EOF, empty scene, blank-line separation, frontmatter, synthetic scene).

## 25.36 Presentation Source Metadata

Status: LOCKED

Each compiler-produced `PresentationNode` carries source-analysis fields beside `command` and `span`. They are not part of `PresentationCommand`, are never read by Runtime or Player, and do not change DSL semantics. All are optional on the public type for source-compatibility of hand-constructed nodes; the compiler always populates the fields marked "always". Exact derivation rules are in Section 14 and are not repeated here.

| Field | Meaning |
|---|---|
| `parameterValueSpans` | Record from each recognized named-parameter key to the span of its authored value text only (not `key=`). Always present (empty when no named parameters). |
| `positionalValueSpan` | Span of the single positional token; absent when there are zero or two or more positional tokens. |
| `argumentsEndPosition` | Position after the last non-whitespace character of the argument text, before trailing whitespace and the line terminator. Always present; not derivable from `span.end`. |
| `parameterRemovalSpans` | For a named key authored exactly once, the span whose deletion removes its `key=value` token plus one adjacent separator; absent when the key is absent or duplicated. |
| `contiguousPositionalSpan` | Span covering all positional tokens when they form one uninterrupted run; absent when none exist or a named token is interleaved. |
| `commandRemovalSpan` | Span from `span.start` to `span.end` extended by the directive line's own terminator width (0, 1, or 2). Always present. |

For every optional-span field, absence does not mean the value was not authored; it means no single safe span exists (see Section 14).

**Branch `followingLineEnding`.** `ConditionalBranch` and `VariantBranch` carry `followingLineEnding` with the same type and meaning as `SceneNode.followingLineEnding` (Section 25.35), measured from the branch's `span.end`. `""` is reachable for a branch only when its enclosing conditional or variant is unclosed (`AT1002`) and the branch ends at true end-of-file. Every compiler-produced branch populates it.

Verification: `test/presentation-source-spans.test.ts`; `test/conditional.test.ts` and `test/variant.test.ts` (branch `followingLineEnding`).

## 25.40 Source-Generation Safety Helpers

Status: LOCKED

The compiler's public surface exports two predicates for tools that generate DSL source from structured data. They answer one lexical question: could this raw field, interpolated into generated source, be re-tokenized by the compiler as additional structure with no diagnostic? They are not content validators; content validity remains the parser's and validator's job, reported through their existing diagnostics.

```ts
isChoiceTargetBoundarySafe(value: string): boolean
isPresentationNamedArgumentValueBoundarySafe(value: string): boolean
```

**Exact predicates.**

- `isPresentationNamedArgumentValueBoundarySafe(value)` returns `true` if and only if `value` contains no separator whitespace. Separator whitespace is the regular-expression class `\s` (`SEPARATOR_WHITESPACE_SOURCE`).
- `isChoiceTargetBoundarySafe(value)` returns `true` if and only if `value` contains no separator whitespace and contains no unescaped `->`. An arrow is unescaped when the character before `-` is not a backslash, so `north\->south` is safe and `north->south` is not.

Both are deliberately conservative. A `true` result means only that the value cannot change token boundaries; it can still be invalid content (`"123"` as a choice target; `"bananas"` as a volume). No syntactically valid unconditional choice target contains separator whitespace, so the choice predicate never rejects a value that could have been valid.

**Parser behavior protected.**

- A choice item is split at the last unescaped `->` on the line (`findLastUnescapedArrow`), so display text may contain `\->`. Items with no unescaped arrow, or whose tail does not match the target pattern, report `AT1005`.
- The tail after the arrow must match `CHOICE_TAIL_PATTERN`: an identifier `[A-Za-z][A-Za-z0-9_-]*`, optionally followed by separator whitespace, `if`, separator whitespace, and a condition. A target containing separator whitespace could therefore be read as an implicit `if` condition, and one containing an unescaped arrow could move the item/target split.
- Presentation arguments are tokenized on separator whitespace (`tokenizePresentationArgs`); a token of the form `key=value` is a distinct named parameter. A value containing separator whitespace could therefore inject or truncate a parameter.

**Consistency with the parser.** The predicates and the parser both take the separator-whitespace definition and the last-unescaped-arrow scan from one shared, dependency-free lexical module, and `CHOICE_TAIL_PATTERN` is built from the same whitespace source string. The predicates and the parser's tokenization therefore cannot diverge.

**Stability.** Both functions are public since 0.1.0 and their behavior is stable within 0.x minor versions. Widening the set of rejected values is a breaking change.

Verification: `test/serializer-safety.test.ts`; `test/choice.test.ts` (AT1005 cases).

## 25.41 Choice Item Source Metadata

Status: LOCKED

Every `ChoiceItem` carries source metadata so that source-editing tools can make exact, formatting-preserving edits without re-parsing.

**Fields.** A `ChoiceItem` has exactly these source-location fields:

```text
span                    SourceSpan   (always present)
conditionSourceSpan?    SourceSpan   (optional)
```

`ChoiceItem` has no source span for its display `text` or its `target`. `text` and `target` are normalized values (the display text is trimmed and `\->` is unescaped to `->`), not source slices.

**`span`.** The span of the item's whole physical line: it starts at column 1 of the line (including any indentation and the `-` or `*` bullet) and ends after the last content character, excluding the line terminator.

**`conditionSourceSpan`.**

- It is present if and only if the item's tail has the form `target if <condition text>`. In that case it covers exactly the authored `<condition text>`: no `if` keyword, no separator whitespace on either side, no line terminator. Parentheses, internal spacing and string quotes are preserved verbatim, for example `(a || b) && c` or `has_key  &&  flag`.
- It is `undefined` for an unconditional item.
- It is determined by the item's syntactic shape, not by whether the condition parses. If the condition text is malformed, the compiler reports `AT2001`, the item is retained with `condition === undefined`, and `conditionSourceSpan` is still present and covers the malformed text (for example `1 +`). A consumer MUST NOT infer "no condition authored" from `condition === undefined`; it MUST test `conditionSourceSpan`.
- Consumers MUST NOT substitute `condition.span`. The expression parser does not widen the span of a parenthesized sub-expression to include its parentheses, so `condition.span` can omit an opening `(` when parentheses wrap only part of the condition (for example `(a + b) * c`).

**Malformed items (`AT1005`).** Inside `@choice`, a non-blank line beginning with optional whitespace, `-` or `*`, and whitespace is a choice-item candidate. Lines that do not match that shape are skipped silently and produce no item and no diagnostic. A candidate that fails to parse as a complete item produces an `AT1005` error (`Malformed choice item: ...`) and is dropped: no `ChoiceItem` is appended, and the remaining items are unaffected. `AT1005` is reported when:

- the line contains no unescaped `->` (the diagnostic span is the whole line); or
- the text after the final unescaped `->` is not a valid `target` or `target if <condition>` tail (the diagnostic span covers exactly the trimmed tail text, not the whole line).

A syntactically valid target that names no scene is not `AT1005`; it is reported as `AT1004` and the item is retained.

**CRLF.** Lines are split on `\n`, and a `\r` immediately before `\n` belongs to the terminator. Item text and spans never include the `\r`. All offsets are absolute offsets into the original source, unnormalized.

Verification: `test/choice.test.ts` (`conditionSourceSpan`, malformed items, CRLF).

## 25.43 Variant Branch Source Metadata

Status: LOCKED

Each `VariantBranch` carries source metadata so that source-editing tools can make exact, formatting-preserving edits without re-parsing.

**Fields.**

```text
kind                   "when" | "otherwise"
branchId               string
condition              ExpressionNode | undefined
span                   SourceSpan
followingLineEnding?   "\n" | "\r\n" | ""
conditionSourceSpan?   SourceSpan
```

**`conditionSourceSpan`.**

- It is present if and only if `kind === "when"` and the `@when` directive has non-empty arguments. It covers exactly the authored condition text: no `@when`, no separator whitespace, no trailing header whitespace, no line terminator. Parentheses and internal whitespace are preserved verbatim.
- It is `undefined` for `@otherwise`, and for a `@when` with no arguments (which also reports `AT2001`).
- As with choice items, it is a syntactic fact, independent of whether the condition parses. When the condition is malformed, `AT2001` is reported, `condition` is `undefined`, and `conditionSourceSpan` is still present.
- Consumers MUST NOT substitute `condition.span` (see 25.41).

**`span`.** A branch span starts at column 1 of its `@when`/`@otherwise` line and ends at the end of its last child block, or at the end of the directive line if the branch has no blocks. Blank lines between the last block and the next branch marker are outside the span.

**`followingLineEnding`.** The exact line terminator that immediately follows `span.end`: `"\n"`, `"\r\n"`, or `""` when `span.end` is at the end of the source with no terminator (reachable only when the enclosing `@variant` is unclosed, which also reports `AT1002`). It is a local source fact: only the single terminator after the span is reported, never blank lines after it. When the last block of the branch is a nested Conditional or Variant, the value is the terminator after that nested construct's complete span. It is declared optional on the public type only so that hand-constructed nodes remain valid; the compiler populates it on every branch it produces. It does not change `span`.

**Branch ordering (`AT1104`).** `@otherwise` matches unconditionally, so any branch after it is unreachable. For every `Variant` (at any nesting depth), the compiler reports one `AT1104` error per branch that appears after the first `@otherwise`, in authored order. This includes a later `@when` and a duplicate `@otherwise`. The diagnostic span is the offending branch's `span`. The check is validation only: all branches remain in the AST in authored order, and `branchId` assignment is unchanged (`<id>:<n>` counts `@when` branches in authored order; the `@otherwise` branch is `<id>:otherwise`).

**Related diagnostics.** `AT1101` (duplicate variant id) and `AT1102` (variant with no `@when` branch) are independent of branch ordering and are reported in addition to `AT1104` when they apply.

**CRLF.** `conditionSourceSpan` offsets are exact absolute offsets and never include `\r`. `followingLineEnding` is `"\r\n"` at a CRLF branch boundary.

Verification: `test/variant.test.ts` (`VariantBranch.followingLineEnding`, `AT1104`, `VariantBranch.conditionSourceSpan`).

## 25.46 Variant Id Source Span

Status: LOCKED

`VariantNode` carries `readonly idSourceSpan: SourceSpan`, a required field. It records the exact source range of the `@variant` header's id text, so source-editing tools can make exact, formatting-preserving edits without re-parsing. Positions are 1-based line and column and 0-based offsets into the source string (JavaScript string indices; `column = index in line + 1`).

**Semantics.**

* `id` is the directive argument of the `@variant` line after the keyword and its separator whitespace, with trailing whitespace removed. It preserves internal whitespace, Unicode, and any punctuation.
* A non-empty `id` has an `idSourceSpan` that covers exactly the argument text. It excludes `@variant`, the separator whitespace before the id, any trailing header whitespace, and the line terminator. `source.slice(start.offset, end.offset)` equals the argument text. For `@variant   my variant` followed by trailing spaces, it slices to `my variant`.
* The span is on the `@variant` line only. A nested Variant has its own independent `idSourceSpan`. `VariantNode.span` still covers the whole block, header through `@end`.
* The field is never `undefined`. When the id is empty, both for a bare `@variant` and for `@variant` followed only by spaces or tabs, the span is zero-width (`start.offset === end.offset`), positioned immediately after the `@variant` keyword (column 9 on that line). Both forms yield the identical position. A zero-width span is a valid coordinate and carries no separator. A tool that inserts text there must supply its own separating whitespace.
* CRLF line endings do not shift the span. The line terminator is never part of the span or of `id`.
* The compiler does not validate variant ids. An empty id, internal spaces, and Unicode ids compile without diagnostics, and the span is populated in all of these cases.
* Malformed input does not change the rule. A Variant that is unclosed or lacks branches still receives an `idSourceSpan` from its header line, alongside the diagnostics those errors produce.

Verification: `packages/compiler/test/variant.test.ts` (`VariantNode.idSourceSpan`).

## 25.49 Heading Content Source Span

Status: LOCKED

**Field.** `HeadingNode.contentSourceSpan: SourceSpan` is non-optional. Every `Heading` has one, including an empty ATX heading.

**Definition.** `contentSourceSpan` covers the exact authored heading content. It excludes:

- the opening `#` marker run and the separator whitespace after it;
- a recognized ATX closing-hash sequence (see below) and the whitespace before it;
- trailing heading whitespace;
- for Setext, the underline line, its indentation and trailing whitespace, and the line terminator before it;
- the line terminator.

Offsets are absolute, unnormalized source offsets. Consumers should treat this span as the only patch target for heading-content edits and MUST NOT rebuild source from `children`, which does not preserve delimiter choice, escaping, spacing, or closing-hash and underline syntax.

**Non-empty heading.** The span runs from the start of the first inline child to the end of the last inline child. Inline markup delimiters belong to the content (`### Hello *world* ###` yields `Hello *world*`).

**ATX closing hashes.** A closing run of `#` is recognized, and excluded from content, only when it is preceded by whitespace (space or tab) and ends the line. Hashes with no preceding whitespace (`### Heading###`) and a `#` that is not at the end of the line (`### Heading # text`) remain content. Multiple spaces or a tab before the closing run are excluded along with it.

**Empty ATX heading** (`#`, `# `, `### ###`, `###### ######`, and closing runs longer than the opening marker). The span is zero-width (`start` equals `end`, same line, column and offset). The position is found by starting immediately after the opening marker run and skipping contiguous separator whitespace, bounded by the end of the heading line. Therefore:

- for a bare marker (`#`), it is immediately after the marker;
- for a marker followed by whitespace (`# `, `###   `), it is after all of that whitespace;
- for a marker, whitespace and a closing run (`### ###`), it is immediately before the first closing `#`.

**Setext.** The content is the text line (or lines) above the underline; indentation of up to three spaces is excluded, and the underline line is never part of the span. A Setext heading with no content line is not a heading (the underline parses as a paragraph), so a Setext heading never has an empty content span.

**CRLF.** The terminator is never included: the character at `contentSourceSpan.end.offset` is `\r` when the line ends in `\r\n` and the span ends at the line end. Offsets are in UTF-16 code units of the source string, so astral characters count as two units.

Verification: `test/heading-content-span.test.ts`.

## 25.50 Heading Level Source Span

Status: LOCKED

**Field.** `HeadingNode.levelSourceSpan: SourceSpan` is non-optional and non-zero-width for every heading. It covers exactly the authored level marker, and nothing else.

**ATX.** The span is the opening `#` run: it starts at the first `#` of the heading and is `depth` characters long. For `###   Heading ###` it covers `###`. It excludes separator whitespace, content, closing hashes, trailing whitespace, and the line terminator. `depth` equals the length of the span (1 to 6).

**Setext.** The span is the underline character run on the final line of the heading (`=` for depth 1, `-` for depth 2). It excludes the content line, the line terminator before the underline, underline indentation (up to three spaces), underline trailing whitespace, and the line terminator after the underline. The span is on the underline's line and its length is the authored underline length, which need not equal the content length or `depth`. `depth` is 1 for a `=` underline and 2 for a `-` underline.

**Relation to `depth`.** `depth` is derived from the level marker. Replacing exactly the text in `levelSourceSpan` with a different valid marker (a `#` run of length 1 to 6, or a `=`/`-` run) changes `depth` and preserves the authored heading style and content. Consumers MUST NOT change heading level by editing any other part of the heading.

**Style detection.** A heading is ATX when `span.start.line === span.end.line`, and Setext otherwise.

**Independence.** Inline markup, non-ASCII content (including Korean and emoji), and CRLF do not affect the span. With CRLF the terminator is excluded: the character at `levelSourceSpan.end.offset` is `\r`.

Verification: `test/heading-level-span.test.ts`.

## 25.51 Conditional Branch Source Metadata and Ordering

Status: LOCKED

Each `ConditionalBranch` carries source metadata so that source-editing tools can make exact, formatting-preserving edits without re-parsing.

**Fields.**

```text
kind                   "if" | "elseif" | "else"
condition              ExpressionNode | undefined
blocks                 StoryBlock[]
span                   SourceSpan
followingLineEnding?   "\n" | "\r\n" | ""
conditionSourceSpan?   SourceSpan
```

**`conditionSourceSpan`.** It mirrors `VariantBranch.conditionSourceSpan` (25.43). It is present if and only if `kind` is `"if"` or `"elseif"` and the directive has non-empty arguments, and it covers exactly the authored condition text (no directive name, separator whitespace, trailing whitespace or terminator; a tab separator is accepted; internal spacing, parentheses and string quotes are preserved). It is `undefined` for `@else` (never a zero-width span), and for `@if`/`@elseif` with no arguments (which reports `AT2001`). It is present even when the condition fails to parse. Consumers MUST NOT substitute `condition.span`. The span is correct for conditionals nested in other conditional or variant branches.

**`span` and `followingLineEnding`.** A branch span starts at column 1 of its `@if`/`@elseif`/`@else` line and ends at the end of its last child block, or at the end of the directive line if the branch has no blocks. `followingLineEnding` has the same definition as `VariantBranch.followingLineEnding` (25.43): the single terminator after `span.end`, `"\n"`, `"\r\n"`, or `""` at an unterminated end of source (reachable only when the enclosing conditional is unclosed, which also reports `AT1002`). Blank lines between a branch and the next marker are outside the span and are not reported. For a nested conditional or variant that is the branch's last block, it is the terminator after the nested construct's complete span. For an empty branch it is the terminator of the branch's own marker line. The value is also correct when the story follows YAML frontmatter. It does not change `span`.

**Ordering.** A conditional is ordered as:

```text
@if
zero or more @elseif
optional @else
@end
```

`@else` matches unconditionally, so any branch after it is unreachable. For every `Conditional` (at any nesting depth, including inside variant branches), the compiler reports one `AT1006` error for each branch that appears after the first `@else`, in authored order. This includes a later `@elseif` and a duplicate `@else`. The diagnostic span is exactly the offending branch's `span`. An `@elseif` that appears before the `@else` is not reported. The rule is validation only: all branches remain in the AST in authored order, and nothing else about parsing or the AST changes. Line endings are irrelevant to the rule.

**CRLF.** `conditionSourceSpan` offsets are exact absolute offsets and never include `\r`; `followingLineEnding` is `"\r\n"` at a CRLF boundary.

Verification: `test/conditional.test.ts` (`ConditionalBranch.followingLineEnding`, `AT1006`, `ConditionalBranch.conditionSourceSpan`).

## 25.53 Goto Target Source Span

Status: LOCKED

`GotoNode` carries `readonly targetSourceSpan: SourceSpan`, a required field (never `undefined`). `GotoNode.span` continues to cover the whole directive line.

**Semantics.**

* For a non-empty target, the span covers exactly the authored argument of the `@goto` line. It excludes the keyword, the separator whitespace (spaces or tabs) before the target, trailing whitespace, and the line terminator. Slicing the source with the span yields the authored target text.
* `target` is the argument text with surrounding whitespace trimmed. It is not normalized: it is case-sensitive, it may contain internal spaces and Unicode, and quote characters are part of the text. Scene resolution (AT1004 for an unknown scene) is separate from the span.
* An empty target (`@goto`, or `@goto` followed only by spaces or tabs) yields `target === ""`, an AT1004 diagnostic, and a zero-width `targetSourceSpan` positioned immediately after the keyword: column 6 of the `@goto` line, offset = line start offset + 5. Trailing whitespace after a bare `@goto` does not move it. The zero-width span is metadata only. A tool that inserts text there must supply its own separating whitespace.
* A Goto nested in an `@if` branch or a Variant branch has its own span with offsets relative to the whole source.
* CRLF line endings do not shift the span.

Verification: `packages/compiler/test/goto-target-span.test.ts`.

## 25.54 Set Source Metadata

Status: LOCKED

`SetNode` carries two required fields, `nameSourceSpan: SourceSpan` and `expressionSourceSpan: SourceSpan`. They exist so source-editing tools can make exact, formatting-preserving edits without re-parsing. `name`, `expression`, and `span` are unchanged; `span` covers the whole directive line.

**Semantics.**

* `nameSourceSpan` covers exactly the variable name as authored, starting at the first character after the `@set` separator. It excludes whitespace around `=`.
* `expressionSourceSpan` covers exactly the authored expression text: from the first non-whitespace character after `=` through the last non-whitespace character of the line. It excludes trailing whitespace and the line terminator, and it includes internal whitespace and grouping parentheses. For `@set x = (a + b) * c` it covers `(a + b) * c`.
* `expressionSourceSpan` is not taken from `expression.span`. The root of a parenthesized expression excludes its grouping parentheses, so `expression.span` can be narrower than the authored expression. No grouping node exists in the expression AST.
* A `@set` that does not match `name = expression` (missing name, `=`, or expression), or whose expression has a syntax error, emits AT2001 and no `SetNode`. A form mismatch is reported on the whole directive line. An expression syntax error is reported at the offending position inside the expression. Because no node is emitted in these cases, both spans are always present on an emitted `SetNode`, and no zero-width recovery span exists for Set.
* A `@set` name matches `[A-Za-z_][A-Za-z0-9_]*` (ASCII only).
* Nested Sets inside Conditional and Variant branches carry correct whole-source offsets. CRLF line endings do not shift either span.
* The metadata adds no new diagnostics. Identifier references in expressions are not checked at compile time.

Verification: `packages/compiler/test/set-source-spans.test.ts`.

## 25.55 Reserved Set Variable Names

Status: LOCKED

The words `true`, `false`, and `null` are literals in the expression language. The expression lexer always tokenizes them as literals, never as identifiers, so a variable with one of these names could be assigned but never read. The compiler therefore rejects them as `@set` names.

**Rule.**

* `@set true = <expr>`, `@set false = <expr>`, and `@set null = <expr>` emit AT2001 with the message `Malformed expression: "<name>" is a reserved word and cannot be a variable name`. The diagnostic span is `nameSourceSpan` of the rejected directive (the name characters only, not the whole line). No `SetNode` is emitted for that line, and surrounding blocks are unaffected. This applies at any nesting depth (scene level, Conditional branches including `@else`, Variant branches). One diagnostic is emitted per rejected directive. No new diagnostic code is used.
* The check runs after the name is matched and before the right-hand side is parsed. When the name is rejected, the right-hand side is not parsed, so a malformed right-hand side produces no second diagnostic.
* If the line does not match `name = expression` at all (for example `@set true` or `@set true =`), the generic form diagnostic on the whole line is emitted instead of the reserved-name diagnostic.
* Matching is case-sensitive and exact. `TRUE`, `True`, `NULL`, `visited`, `undefined`, `if`, `else`, `elseif`, `and`, `or`, `not`, and names that merely contain or begin with a reserved word (`trueValue`, `falseCount`, `nullish`) remain valid `@set` names.
* The reserved list is shared inside the parser between the expression lexer and the `@set` check, so the two cannot drift. It is parser-internal and is not part of the public API.
* Expression behavior is unchanged: `true`, `false`, and `null` remain literals in expressions, and `visited(...)` is unaffected.

**`__proto__`.** `__proto__` matches the name grammar and is accepted as a `@set` name; a `SetNode` with `name === "__proto__"` is emitted. This is safe at runtime: the assignment creates an own data property through a computed key rather than invoking the prototype setter, reads are guarded by an own-property check, `Object.prototype` is not modified, and inherited names such as `constructor` remain unknown identifiers until assigned. Frontmatter `state:` keys are validated separately and reject `__proto__` (see Section 12).

Verification: `packages/compiler/test/set-reserved-names.test.ts`; `packages/compiler/test/frontmatter-state-keys.test.ts` (`@set __proto__` is accepted; frontmatter `__proto__` is rejected).

---

# 26. AI

Status: FUTURE

AI is not part of the current core architecture.

Potential future uses may include:

* presentation suggestions;
* scene breakdown;
* asset assistance;
* continuity analysis.

The core authoring format must remain deterministic and usable without AI.

---

# 27. Explicit Non-Goals for Current Development

Do not build yet:

```text
visual node editor
cloud backend
accounts
authentication
collaboration
asset marketplace
AI story generation
image generation
voice generation
mobile application
multiplayer
general-purpose scripting
full visual novel engine compatibility
```

---

# 28. Change Discipline

Stable decisions in this document must not be silently changed during implementation.

If a task reveals that a `LOCKED` decision is unsuitable:

1. stop treating the change as a simple implementation detail;
2. explicitly describe the conflict;
3. propose the replacement;
4. record the accepted decision in this document before allowing architecture to drift.

`PROVISIONAL` sections may evolve more freely but changes should still be documented when they affect public contracts.

---

# 29. Source-of-Truth Order

When documents disagree, use this precedence:

1. `docs/CORE_SPEC.md`
2. an explicit accepted design decision made after the latest revision of this specification
3. the current public contract of the packages (exported API as recorded by the API baselines, and the test suites)
4. the README files
5. informal notes or assumptions

---

# 30. Reserved

Status: RESERVED

The section number is reserved and stable. The development roadmap is maintained outside this specification.
