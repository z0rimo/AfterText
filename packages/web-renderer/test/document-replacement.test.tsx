import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

describe("document replacement", () => {
  it("supplying a different StoryDocument resets to the initial Start state, discarding old progress", async () => {
    const user = userEvent.setup();
    const first = compileDoc("@scene s\nFirst story content.\n");
    const second = compileDoc("@scene s\nSecond story content.\n");

    const { rerender } = render(<AfterTextPlayer document={first} />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("First story content.")).toBeInTheDocument();

    rerender(<AfterTextPlayer document={second} />);

    // Reset to the pre-Start state — the new document's content is not
    // shown until Start is pressed again, and the old content is gone.
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.queryByText("First story content.")).not.toBeInTheDocument();
    expect(screen.queryByText("Second story content.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Second story content.")).toBeInTheDocument();
  });

  it("re-rendering with the SAME document identity does not reset in-progress state", async () => {
    const user = userEvent.setup();
    const storyDocument = compileDoc("@scene s\nFirst.\n\nSecond.\n");

    const { rerender } = render(<AfterTextPlayer document={storyDocument} />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("First.")).toBeInTheDocument();

    rerender(<AfterTextPlayer document={storyDocument} />);
    // Still mid-story — the same document identity is not a "new" document.
    expect(screen.getByText("First.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  });
});
