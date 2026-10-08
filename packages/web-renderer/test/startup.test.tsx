import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

describe("startup", () => {
  it("initial render shows a Start button and no story content", () => {
    const document = compileDoc("@scene s\nHi.\n");
    render(<AfterTextPlayer document={document} />);

    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.queryByText("Hi.")).not.toBeInTheDocument();
  });

  it("Start performs exactly the first Player progression", async () => {
    const user = userEvent.setup();
    const document = compileDoc("@scene s\nFirst.\n\nSecond.\n");
    render(<AfterTextPlayer document={document} />);

    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByText("First.")).toBeInTheDocument();
    expect(screen.queryByText("Second.")).not.toBeInTheDocument();
  });
});
