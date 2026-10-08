import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

describe("completed state", () => {
  it("renders a completion message with Restart", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc("@scene s\nThe end.\n")} />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Story complete.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart" })).toBeInTheDocument();
  });

  it("Restart returns to Start with a fresh session", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc("@scene s\nThe end.\n")} />);
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Restart" }));

    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.queryByText("Story complete.")).not.toBeInTheDocument();

    // A fresh Player session: Start reproduces "The end." exactly as the
    // very first run did, proving no stale progress carried over.
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("The end.")).toBeInTheDocument();
  });
});

describe("error state", () => {
  const SOURCE = ["---", "state:", "  divisor: 0", "---", "@scene s", "@set x = 10 / divisor"].join("\n");

  it("shows the error kind and message, without throwing", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc(SOURCE)} />);

    await expect(user.click(screen.getByRole("button", { name: "Start" }))).resolves.not.toThrow();

    expect(screen.getByText(/division-by-zero/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("Restart on the error screen creates a fresh session", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc(SOURCE)} />);
    await user.click(screen.getByRole("button", { name: "Start" }));

    await user.click(screen.getByRole("button", { name: "Restart" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });
});
