import { expect } from "vitest";
import { compile, type CompileResult, type Diagnostic } from "../src/index.js";

export function compileOk(source: string): CompileResult {
  const result = compile(source);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  expect(errors, `expected no diagnostics, got: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  return result;
}

export function codesOf(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}
