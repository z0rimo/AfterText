import { describe, expect, it } from "vitest";
import { compile } from "@aftertext/compiler";
import { createRuntimeState } from "@aftertext/runtime";
import { createPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

describe("createPlayer", () => {
  it("current is null — no narrative execution has occurred", () => {
    const document = compileDoc("@scene s\nHi.\n");
    const player = createPlayer(document);
    expect(player.current).toBeNull();
  });

  it("seeds runtimeState identically to createRuntimeState — entry scene, StoryState, ReaderState", () => {
    const source = ["---", "entry: middle", "state:", "  timeline: 0", "---", "@scene intro", "A.", "", "@scene middle", "B."].join(
      "\n"
    );
    const document = compileDoc(source);
    const player = createPlayer(document);

    expect(player.runtimeState).toEqual(createRuntimeState(document));
    expect(player.runtimeState.navigation).toEqual({ sceneId: "middle" });
    expect(player.runtimeState.story).toEqual({ timeline: 0 });
  });

  it("Reader Memory starts empty — creation is not itself an experience", () => {
    const document = compileDoc("@scene s\nHi.\n");
    const player = createPlayer(document);
    expect(player.runtimeState.reader).toEqual({ visitedScenes: {}, seenVariants: {} });
  });

  it("starts at the runtime's initial cursor", () => {
    const document = compileDoc("@scene s\nHi.\n");
    const player = createPlayer(document);
    expect(player.cursor).toEqual([]);
  });

  it("does not mutate the document it was given", () => {
    const document = compileDoc("@scene s\nHi.\n");
    const before = JSON.parse(JSON.stringify(document));
    createPlayer(document);
    expect(document).toEqual(before);
  });

  it("performs no story execution — story state matches the document's declared initial state exactly, nothing more", () => {
    const document = compile(["---", "state:", "  a: 1", "---", "@scene s", "@set a = 2", "Hi."].join("\n")).document;
    const player = createPlayer(document);
    // If creation somehow ran the @set automatically, `a` would be 2.
    expect(player.runtimeState.story).toEqual({ a: 1 });
  });
});
