// Public API baseline for the four published packages.
//
// Extracts what a consumer of `dist/` actually sees — the exports reachable
// from `dist/index.d.ts` (values AND type-only exports), their structural
// shape, and the runtime keys of `dist/index.js` — and compares them with the
// reviewed baseline committed at `packages/<name>/api-baseline.json`.
//
// Deliberately lightweight: it walks exported declarations with the
// TypeScript checker the repo already depends on (no API Extractor, no
// generated report files) and canonicalises them into short, sorted,
// human-readable lines, so a baseline diff reads like an API review.
//
// Tracked per export (`kind` + sorted `members` lines):
//   function / const : call signatures by parameter TYPES (optionality, rest)
//                      and return type — parameter names are not API
//   interface        : type parameters, bases, every property (readonly,
//                      optional, type), method, call/construct/index signature
//   type alias       : type parameters, union/intersection members, object
//                      shape, tuple and other targets
//   class            : constructors, public instance and static members
//   enum             : member names and values
// Also tracked:
//   referencedTypes  : types declared inside the same package that are
//                      reachable from an export but are NOT root exports
//                      (consumers see them through the export). Types from
//                      other packages or libraries are referenced by name
//                      only; those packages carry their own baselines.
//   packageExports   : the package.json `exports` map
// Not tracked: private/protected members, JSDoc, declaration order, member
// layout formatting, and parameter/type-parameter documentation.
//
// Usage: `npm run api:update` after an intentional public API change.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";

export const PACKAGES = ["compiler", "runtime", "player", "web-renderer"];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function packageDir(name, root = repoRoot) {
  return path.join(root, "packages", name);
}

export function baselinePath(name, root = repoRoot) {
  return path.join(packageDir(name, root), "api-baseline.json");
}

const VALUE_KINDS = new Set(["function", "const", "class", "enum", "namespace"]);
const TEXT_FLAGS = ts.TypeFormatFlags.NoTruncation;

// Machine-specific `import("/abs/path/dist/x").Name` qualifiers are dropped so
// the baseline is identical on every machine and CI runner.
const stripImports = (text) => text.replace(/import\("[^"]*"\)\./g, "");

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function kindsOf(flags) {
  const kinds = [];
  if (flags & ts.SymbolFlags.Function) kinds.push("function");
  if (flags & ts.SymbolFlags.Class) kinds.push("class");
  if (flags & ts.SymbolFlags.Enum) kinds.push("enum");
  if (flags & ts.SymbolFlags.Variable) kinds.push("const");
  if (flags & ts.SymbolFlags.ValueModule) kinds.push("namespace");
  if (flags & ts.SymbolFlags.Interface) kinds.push("interface");
  if (flags & ts.SymbolFlags.TypeAlias) kinds.push("type");
  return kinds.length > 0 ? kinds : ["unknown"];
}

class Describer {
  constructor(checker, location, distDir, rootSymbols) {
    this.checker = checker;
    this.location = location;
    this.distDir = distDir;
    this.rootSymbols = rootSymbols;
    this.referenced = new Map();
    this.seenSymbols = new Set();
    this.seenTypes = new Set();
  }

  text(type) {
    return stripImports(this.checker.typeToString(type, this.location, TEXT_FLAGS));
  }

  // ---- canonical type text ------------------------------------------------

  member(type) {
    // Anonymous function types print as `(ParamTypes) => Return` (no names).
    const signatures = type.getCallSignatures();
    const named = ts.SymbolFlags.Interface | ts.SymbolFlags.Class | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum;
    if (signatures.length > 0 && type.getProperties().length === 0 && !(type.symbol && type.symbol.flags & named)) {
      return signatures.map((signature) => this.signature(signature)).join(" | ");
    }
    return this.text(type);
  }

  canonical(type, { optional = false } = {}) {
    this.track(type);
    if (!type.isUnion()) return this.member(type);
    let parts = type.types.map((member) => {
      const text = this.member(member);
      return member.getCallSignatures().length > 0 && text.startsWith("(") ? `(${text})` : text;
    });
    if (optional) parts = parts.filter((part) => part !== "undefined");
    // `boolean` is `true | false`; union member order depends on checker
    // internals, so members are sorted to keep the baseline stable.
    if (parts.includes("true") && parts.includes("false")) {
      parts = parts.filter((part) => part !== "true" && part !== "false").concat("boolean");
    }
    return [...new Set(parts)].sort(byText).join(" | ");
  }

  signature(signature) {
    const params = signature.getParameters().map((parameter) => {
      const declaration = parameter.valueDeclaration;
      const isParameter = declaration !== undefined && ts.isParameter(declaration);
      const rest = isParameter && declaration.dotDotDotToken !== undefined;
      const optional = isParameter && (declaration.questionToken !== undefined || declaration.initializer !== undefined);
      const type = this.checker.getTypeOfSymbolAtLocation(parameter, this.location);
      return `${rest ? "..." : ""}${this.canonical(type, { optional })}${optional ? "?" : ""}`;
    });
    const returnType = signature.getReturnType();
    const typeParameters = (signature.typeParameters ?? []).map((tp) => this.typeParameterText(tp.symbol?.declarations?.[0]));
    return `${typeParameters.length > 0 ? `<${typeParameters.join(", ")}>` : ""}(${params.join(", ")}) => ${this.canonical(returnType)}`;
  }

  typeParameterText(declaration) {
    if (declaration === undefined || !ts.isTypeParameterDeclaration(declaration)) return "?";
    const constraint = declaration.constraint
      ? ` extends ${this.canonical(this.checker.getTypeFromTypeNode(declaration.constraint))}`
      : "";
    const fallback = declaration.default ? ` = ${this.canonical(this.checker.getTypeFromTypeNode(declaration.default))}` : "";
    return `${declaration.name.text}${constraint}${fallback}`;
  }

  // ---- reachability (transitive, same-package, non-exported types) --------

  track(type) {
    if (this.seenTypes.has(type)) return;
    this.seenTypes.add(type);
    if (type.aliasSymbol) {
      this.consider(type.aliasSymbol);
      for (const argument of type.aliasTypeArguments ?? []) this.track(argument);
    }
    if (type.isUnionOrIntersection()) {
      for (const member of type.types) this.track(member);
      return;
    }
    if (type.flags & ts.TypeFlags.EnumLike) {
      const symbol = type.symbol;
      if (symbol) this.consider(symbol.flags & ts.SymbolFlags.EnumMember ? symbol.parent : symbol);
      return;
    }
    if (!(type.flags & ts.TypeFlags.Object)) return;
    if (type.objectFlags & ts.ObjectFlags.Reference) {
      for (const argument of this.checker.getTypeArguments(type)) this.track(argument);
    }
    const symbol = type.symbol;
    if (symbol && symbol.name !== "__type" && symbol.name !== "__object") {
      this.consider(symbol);
    } else {
      for (const property of type.getProperties()) {
        this.track(this.checker.getTypeOfSymbolAtLocation(property, this.location));
      }
      for (const signature of [...type.getCallSignatures(), ...type.getConstructSignatures()]) this.signature(signature);
      for (const info of this.checker.getIndexInfosOfType(type)) this.track(info.type);
    }
  }

  consider(symbol) {
    if (!symbol) return;
    const resolved = symbol.flags & ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(symbol) : symbol;
    if (this.rootSymbols.has(resolved) || this.seenSymbols.has(resolved)) return;
    const declarable = ts.SymbolFlags.Interface | ts.SymbolFlags.Class | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum;
    if (!(resolved.flags & declarable)) return;
    const file = resolved.declarations?.[0]?.getSourceFile().fileName;
    if (file === undefined || !path.resolve(file).startsWith(this.distDir + path.sep)) return; // other package / library
    this.seenSymbols.add(resolved);
    if (this.referenced.has(resolved.name)) {
      throw new Error(`api-surface: two different non-exported types are named "${resolved.name}"; rename one or export it.`);
    }
    this.referenced.set(resolved.name, this.describeSymbol(resolved));
  }

  // ---- declaration shapes -------------------------------------------------

  describeSymbol(resolved) {
    const kinds = kindsOf(resolved.flags);
    const members = [];
    const flags = resolved.flags;

    if (flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable)) {
      const type = this.checker.getTypeOfSymbolAtLocation(resolved, this.location);
      this.track(type);
      const signatures = type.getCallSignatures();
      if (signatures.length > 0) {
        for (const signature of signatures) members.push(`signature ${this.signature(signature)}`);
      } else if (flags & ts.SymbolFlags.Variable) {
        const text = this.text(type);
        if (text.startsWith("{")) members.push(...this.objectMembers(type));
        else members.push(`type ${this.canonical(type)}`);
      }
    }
    if (flags & ts.SymbolFlags.Interface) {
      const declared = this.checker.getDeclaredTypeOfSymbol(resolved);
      members.push(...this.typeParameterLines(resolved), ...this.baseLines(declared), ...this.objectMembers(declared));
    }
    if (flags & ts.SymbolFlags.Class) {
      const declared = this.checker.getDeclaredTypeOfSymbol(resolved);
      const staticSide = this.checker.getTypeOfSymbolAtLocation(resolved, this.location);
      members.push(...this.typeParameterLines(resolved), ...this.baseLines(declared));
      for (const signature of staticSide.getConstructSignatures()) members.push(`constructor ${this.signature(signature)}`);
      members.push(...this.objectMembers(declared, "instance "));
      members.push(
        ...this.objectMembers(staticSide, "static ").filter((line) => !/ prototype: /.test(line) && !line.startsWith("new "))
      );
    }
    if (flags & ts.SymbolFlags.TypeAlias) {
      const declared = this.checker.getDeclaredTypeOfSymbol(resolved);
      members.push(...this.typeParameterLines(resolved), ...this.aliasLines(declared));
    }
    if (flags & ts.SymbolFlags.Enum) {
      for (const [name, member] of resolved.exports ?? []) {
        const declaration = member.valueDeclaration;
        const value = declaration && ts.isEnumMember(declaration) ? this.checker.getConstantValue(declaration) : undefined;
        members.push(`member ${name} = ${JSON.stringify(value ?? null)}`);
      }
    }
    return { kind: kinds.join("+"), members: [...new Set(members)].sort(byText) };
  }

  typeParameterLines(symbol) {
    const declaration = symbol.declarations?.find(
      (d) => ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d) || ts.isClassDeclaration(d)
    );
    return (declaration?.typeParameters ?? []).map((tp) => `typeParam ${this.typeParameterText(tp)}`);
  }

  baseLines(declared) {
    return this.checker.getBaseTypes(declared).map((base) => {
      this.track(base);
      return `extends ${this.text(base)}`;
    });
  }

  aliasLines(declared) {
    this.track(declared);
    if (declared.isUnion()) return [...new Set(declared.types.map((t) => `union ${this.member(t)}`))];
    if (declared.isIntersection()) return declared.types.map((t) => `intersection ${this.member(t)}`);
    const isTuple = this.checker.isTupleType(declared);
    const isPlainObject =
      declared.flags & ts.TypeFlags.Object &&
      !isTuple &&
      (declared.symbol?.name === "__type" || declared.symbol?.name === "__object");
    if (isPlainObject) return this.objectMembers(declared);
    return [`type ${this.checker.typeToString(declared, this.location, TEXT_FLAGS | ts.TypeFormatFlags.InTypeAlias)}`.replace(
      /import\("[^"]*"\)\./g,
      ""
    )];
  }

  objectMembers(type, prefix = "") {
    const lines = [];
    for (const property of type.getProperties()) {
      const name = property.name;
      if (name.startsWith("__@") || name.startsWith("#")) continue;
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      const modifiers = declaration ? ts.getCombinedModifierFlags(declaration) : 0;
      if (modifiers & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;
      const readonly = (modifiers & ts.ModifierFlags.Readonly) !== 0;
      const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
      const isMethod = declaration !== undefined && (ts.isMethodSignature(declaration) || ts.isMethodDeclaration(declaration));
      const propertyType = this.checker.getTypeOfSymbolAtLocation(property, this.location);
      lines.push(
        `${prefix}${readonly ? "readonly " : ""}${isMethod ? "method" : "property"} ${name}${optional ? "?" : ""}: ${this.canonical(propertyType, { optional })}`
      );
    }
    for (const signature of type.getCallSignatures()) lines.push(`${prefix}call ${this.signature(signature)}`);
    if (!prefix.startsWith("static")) {
      for (const signature of type.getConstructSignatures()) lines.push(`${prefix}new ${this.signature(signature)}`);
    }
    for (const info of this.checker.getIndexInfosOfType(type)) {
      lines.push(`${prefix}${info.isReadonly ? "readonly " : ""}index [${this.canonical(info.keyType)}]: ${this.canonical(info.type)}`);
    }
    return lines;
  }
}

/** Reads the consumer-visible surface of one package from its built `dist/`. */
export async function extractSurface(name, root = repoRoot) {
  const dir = packageDir(name, root);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const distDir = path.resolve(dir, "dist");
  const declarationFile = path.join(distDir, "index.d.ts");
  const scriptFile = path.join(distDir, "index.js");
  for (const file of [declarationFile, scriptFile]) {
    if (!fs.existsSync(file)) {
      throw new Error(`${manifest.name}: ${path.relative(root, file)} is missing — run \`npm run build\` first.`);
    }
  }

  const program = ts.createProgram([declarationFile], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true,
    noEmit: true,
    types: []
  });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(declarationFile);
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const rootExports = checker.getExportsOfModule(moduleSymbol);
  const resolve = (symbol) => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  const describer = new Describer(checker, sourceFile, distDir, new Set(rootExports.map(resolve)));

  const exports = {};
  for (const symbol of [...rootExports].sort((a, b) => byText(a.name, b.name))) {
    exports[symbol.name] = describer.describeSymbol(resolve(symbol));
  }
  // Describing exports can discover more non-exported types; the map is filled during traversal.
  const referencedTypes = Object.fromEntries([...describer.referenced.entries()].sort(([a], [b]) => byText(a, b)));

  const runtimeKeys = Object.keys(await import(pathToFileURL(scriptFile).href)).sort(byText);

  return { package: manifest.name, packageExports: manifest.exports ?? null, exports, referencedTypes, runtimeKeys };
}

/** The part of a surface that is stored in (and compared with) the baseline. */
export function toBaseline(surface) {
  return {
    package: surface.package,
    packageExports: surface.packageExports,
    exports: surface.exports,
    referencedTypes: surface.referencedTypes
  };
}

function flatten(surface) {
  const flat = {};
  for (const [name, entry] of Object.entries(surface.exports)) flat[name] = entry;
  for (const [name, entry] of Object.entries(surface.referencedTypes ?? {})) flat[`(referenced) ${name}`] = entry;
  return flat;
}

/**
 * Compares a reviewed baseline with an actual surface.
 * `changed` entries carry the kind change (e.g. type-only → value) and the
 * member lines that were removed from / added to the entry.
 */
export function diffSurfaces(baseline, actual) {
  const before = flatten(baseline);
  const after = flatten(actual);
  const removed = [];
  const added = [];
  const changed = [];
  for (const [name, entry] of Object.entries(before)) {
    if (!(name in after)) {
      removed.push(name);
      continue;
    }
    const next = after[name];
    const removedMembers = entry.members.filter((line) => !next.members.includes(line));
    const addedMembers = next.members.filter((line) => !entry.members.includes(line));
    if (entry.kind !== next.kind || removedMembers.length > 0 || addedMembers.length > 0) {
      changed.push({ name, kindFrom: entry.kind, kindTo: next.kind, removedMembers, addedMembers });
    }
  }
  for (const name of Object.keys(after)) {
    if (!(name in before)) added.push(name);
  }
  const packageExportsChanged = JSON.stringify(baseline.packageExports) !== JSON.stringify(actual.packageExports);
  return { removed, added, changed, packageExportsChanged };
}

export function isEmptyDiff(diff) {
  return diff.removed.length === 0 && diff.added.length === 0 && diff.changed.length === 0 && !diff.packageExportsChanged;
}

/** Declarations and the runtime module must agree on which names are values. */
export function findDeclarationRuntimeMismatches(surface) {
  const declaredValues = Object.entries(surface.exports)
    .filter(([, entry]) => entry.kind.split("+").some((kind) => VALUE_KINDS.has(kind)))
    .map(([exportName]) => exportName)
    .sort(byText);
  const missingAtRuntime = declaredValues.filter((exportName) => !surface.runtimeKeys.includes(exportName));
  const undeclaredAtRuntime = surface.runtimeKeys.filter((exportName) => !declaredValues.includes(exportName));
  return { missingAtRuntime, undeclaredAtRuntime };
}

export function formatDiff(name, diff) {
  const lines = [`@aftertext/${name}: public API differs from packages/${name}/api-baseline.json`];
  for (const exportName of diff.removed) lines.push(`  - removed: ${exportName}`);
  for (const exportName of diff.added) lines.push(`  + added:   ${exportName}`);
  for (const change of diff.changed) {
    lines.push(`  ~ changed: ${change.name}${change.kindFrom !== change.kindTo ? ` (${change.kindFrom} -> ${change.kindTo})` : ""}`);
    for (const line of change.removedMembers) lines.push(`      - ${line}`);
    for (const line of change.addedMembers) lines.push(`      + ${line}`);
  }
  if (diff.packageExportsChanged) lines.push("  ~ package.json `exports` map changed");
  lines.push("If this change is intentional, review it and run `npm run api:update`.");
  return lines.join("\n");
}

export function readBaseline(name, root = repoRoot) {
  return JSON.parse(fs.readFileSync(baselinePath(name, root), "utf8"));
}

export function writeBaseline(name, surface, root = repoRoot) {
  fs.writeFileSync(baselinePath(name, root), `${JSON.stringify(toBaseline(surface), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--update")) {
    console.error("Usage: node scripts/api-surface.mjs --update   (run `npm run build` first; see `npm run api:update`)");
    process.exit(2);
  }
  for (const name of PACKAGES) {
    const surface = await extractSurface(name);
    writeBaseline(name, surface);
    const referenced = Object.keys(surface.referencedTypes).length;
    console.log(`wrote packages/${name}/api-baseline.json (${Object.keys(surface.exports).length} exports, ${referenced} referenced types)`);
  }
}
