import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

describe("presentation rendering", () => {
  // Pause is excluded here — it alone is always a real timing gate
  // (Section 21) and never shows an immediate Next action; see
  // test/timed-presentation.test.ts / test/pause.test.tsx for its full
  // lifecycle. The Camera row below is durationless (no `duration=`), so
  // it correctly keeps the plain immediate-Next behavior (Section 22.14);
  // a timed Camera is covered separately in test/camera.test.tsx.
  it.each([
    ["@background room.jpg", "Background: room.jpg"],
    ["@layer alice.png", "Layer: alice.png"],
    ["@music theme.mp3", "Music: theme.mp3"],
    ["@sfx click.wav", "Sfx: click.wav"],
    ["@camera zoom to=1.5", "Camera zoom to 1.5"]
  ])("acknowledges %s without throwing, showing a readable description", async (directive, expectedText) => {
    const user = userEvent.setup();
    const storyDocument = compileDoc(`@scene s\n${directive}\n`);
    render(<AfterTextPlayer document={storyDocument} />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByText(expectedText)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("acknowledges @pause 2s without throwing, but shows no Next/Continue action while locked (Section 21.3)", async () => {
    const user = userEvent.setup();
    const storyDocument = compileDoc("@scene s\n@pause 2s\n");
    render(<AfterTextPlayer document={storyDocument} />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByText("Pause: 2000ms")).toBeInTheDocument();
    expect(screen.getByText("Waiting…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("does not auto-advance past a Presentation result", async () => {
    const user = userEvent.setup();
    const storyDocument = compileDoc("@scene s\n@background room.jpg\nAfter.\n");
    render(<AfterTextPlayer document={storyDocument} />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText("After.")).not.toBeInTheDocument();
  });

  it("Next continues past a Presentation result", async () => {
    const user = userEvent.setup();
    const storyDocument = compileDoc("@scene s\n@background room.jpg\nAfter.\n");
    render(<AfterTextPlayer document={storyDocument} />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("After.")).toBeInTheDocument();
  });
});
