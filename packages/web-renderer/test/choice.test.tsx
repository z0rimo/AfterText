import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

const WITH_KEY = [
  "---",
  "state:",
  "  has_key: false",
  "---",
  "@scene start",
  "@choice",
  "- Open the door -> room",
  "- Use the key -> basement if has_key",
  "@end",
  "",
  "@scene room",
  "You entered the room.",
  "",
  "@scene basement",
  "You entered the basement."
].join("\n");

describe("choice rendering", () => {
  it("renders exactly the available items (filtered ones absent)", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc(WITH_KEY)} />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByRole("button", { name: "Open the door" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use the key" })).not.toBeInTheDocument();
  });

  it("selecting an item uses its supplied index and follows Player's navigation behavior", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc(WITH_KEY)} />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    await user.click(screen.getByRole("button", { name: "Open the door" }));
    // Navigation is explicit in this slice — a Continue action appears
    // rather than the target scene's content directly.
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("You entered the room.")).toBeInTheDocument();
  });
});
