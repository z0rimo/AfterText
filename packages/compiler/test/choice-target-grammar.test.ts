import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { codesOf } from "./helpers.js";

// Contract for CORE_SPEC "Choice target grammar": the scene id namespace is
// wider than the unquoted Choice target grammar.
describe("scene ids vs the unquoted Choice target grammar", () => {
  it.each(["my scene", "방", "café", "a.b"])(
    "scene id %j is valid for @scene and @goto but not as a Choice target",
    (id) => {
      expect(codesOf(compile(`@scene ${id}\nx`).diagnostics)).toEqual([]);
      expect(codesOf(compile(`@goto ${id}\n@scene ${id}\nx`).diagnostics)).toEqual([]);
      const viaChoice = compile(`@choice\n- Go -> ${id}\n@end\n@scene ${id}\nx`);
      expect(codesOf(viaChoice.diagnostics)).toEqual(["AT1005"]);
    }
  );

  it("reads `room if dark` after the arrow as target `room` with a condition", () => {
    const { document } = compile("@choice\n- Go -> room if dark\n@end\n@scene room if dark\nx");
    const choice = document.scenes[0]!.blocks[0]!;
    if (choice.type !== "Choice") throw new Error("expected Choice");
    expect(choice.items[0]).toMatchObject({ target: "room", condition: { type: "Identifier", name: "dark" } });
  });
});
