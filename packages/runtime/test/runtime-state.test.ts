import { describe, expect, it } from "vitest";
import { compile } from "@aftertext/compiler";
import type { RuntimeState } from "../src/index.js";
import { createRuntimeState, recordSceneVisit, recordVariantSeen } from "../src/index.js";

describe("createRuntimeState", () => {
  it("seeds story state from the document's initial state", () => {
    const { document } = compile(
      ["---", "state:", "  timeline: 0", "  saw_person: false", "---", "@scene intro", "Hi."].join("\n")
    );
    const runtime = createRuntimeState(document);
    expect(runtime.story).toEqual({ timeline: 0, saw_person: false });
  });

  it("starts navigation at the document's normalized entry scene", () => {
    const { document } = compile(
      ["---", "entry: middle", "---", "@scene intro", "A.", "", "@scene middle", "B."].join("\n")
    );
    const runtime = createRuntimeState(document);
    expect(runtime.navigation).toEqual({ sceneId: "middle" });
  });

  it("falls back to the compiler's resolved entryScene when entry is omitted", () => {
    const { document } = compile(["@scene intro", "A."].join("\n"));
    const runtime = createRuntimeState(document);
    expect(runtime.navigation.sceneId).toBe(document.entryScene);
    expect(runtime.navigation.sceneId).toBe("intro");
  });

  it("starts reader state empty", () => {
    const { document } = compile("@scene s\nHi.\n");
    const runtime = createRuntimeState(document);
    expect(runtime.reader).toEqual({ visitedScenes: {}, seenVariants: {} });
  });

  it("returns a story state that is a fresh copy, not a live reference to the compiler's initialState", () => {
    const { document } = compile(
      ["---", "state:", "  timeline: 0", "---", "@scene s", "Hi."].join("\n")
    );
    const runtime = createRuntimeState(document);

    // `StoryState` is now readonly at the type level (Runtime semantic-state
    // hardening), so this guarantee is no longer expressible as "mutate and
    // observe no effect elsewhere" — object-identity independence is the
    // direct way to prove createRuntimeState still performs a real copy
    // rather than aliasing document.initialState.
    expect(runtime.story).not.toBe(document.initialState);
    expect(runtime.story).toEqual(document.initialState);
  });
});

describe("RuntimeState serialization", () => {
  it("round-trips through JSON.stringify/JSON.parse without loss", () => {
    const { document } = compile(
      [
        "---",
        "state:",
        "  timeline: 1",
        "  saw_person: true",
        "  note: null",
        "---",
        "@scene intro",
        "Hi."
      ].join("\n")
    );

    let runtime: RuntimeState = createRuntimeState(document);
    runtime = { ...runtime, reader: recordSceneVisit(runtime.reader, "intro") };
    runtime = { ...runtime, reader: recordVariantSeen(runtime.reader, "alice-status", "alice-status:0") };

    const roundTripped: RuntimeState = JSON.parse(JSON.stringify(runtime));

    expect(roundTripped).toEqual(runtime);
  });
});
