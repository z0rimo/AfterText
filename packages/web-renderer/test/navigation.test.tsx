import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

describe("navigation rendering", () => {
  const SOURCE = ["@scene a", "@goto b", "@scene b", "Arrived."].join("\n");

  it("navigation is a visible, distinct state with an explicit Continue action", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc(SOURCE)} />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByText("Arrived.")).not.toBeInTheDocument();
  });

  it("does not auto-advance past navigation without user interaction", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc(SOURCE)} />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    // Give any stray effect a chance to run; the target content must still
    // not have appeared on its own.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText("Arrived.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("explicit Continue performs exactly one advance, entering the target scene", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc(SOURCE)} />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Arrived.")).toBeInTheDocument();
  });
});
