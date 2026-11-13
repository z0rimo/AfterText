import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

async function start(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Start" }));
}

function images(container: HTMLElement): HTMLImageElement[] {
  return Array.from(container.querySelectorAll("img"));
}

describe("Dialogue rendering", () => {
  it("renders the speaker, body, and a Next control", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc("@scene s\n@say speaker=Alice\nHello.\n")} />);
    await start(user);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Hello.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("preserves speaker case exactly as authored", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc("@scene s\n@say speaker=aLiCe\nHello.\n")} />);
    await start(user);

    expect(screen.getByText("aLiCe")).toBeInTheDocument();
  });

  it("reuses the existing inline-Markdown rendering for the body (emphasis/strong/inline code/link)", async () => {
    const user = userEvent.setup();
    const source = [
      "@scene s",
      "@say speaker=Alice",
      "Plain *emphasis* and **strong** and `code` and a [link](https://example.com)."
    ].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);

    expect(screen.getByText("emphasis").tagName).toBe("EM");
    expect(screen.getByText("strong").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute("href", "https://example.com");
  });

  it("Next advances to the following result", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc("@scene s\n@say speaker=Alice\nHello.\n")} />);
    await start(user);
    expect(screen.getByText("Hello.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Story complete.")).toBeInTheDocument();
  });

  it("two consecutive Dialogue results: the second replaces the first, no accumulation", async () => {
    const user = userEvent.setup();
    const source = ["@scene s", "@say speaker=Alice", "First.", "", "@say speaker=Bob", "Second."].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("First.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Second.")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.queryByText("First.")).not.toBeInTheDocument();
  });

  it("Dialogue advances to ordinary narration, with no speaker UI", async () => {
    const user = userEvent.setup();
    const source = ["@scene s", "@say speaker=Alice", "Hello.", "", "Narration follows."].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);
    expect(screen.getByText("Alice")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Narration follows.")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("ordinary narration advances to Dialogue, with the speaker now visible", async () => {
    const user = userEvent.setup();
    const source = ["@scene s", "Narration first.", "", "@say speaker=Alice", "Hello."].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);
    expect(screen.getByText("Narration first.")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Hello.")).toBeInTheDocument();
  });

  it("Dialogue Next reaches a following Choice normally", async () => {
    const user = userEvent.setup();
    const source = [
      "@scene s",
      "@say speaker=Alice",
      "Choose.",
      "",
      "@choice",
      "- Go -> t",
      "@end",
      "",
      "@scene t",
      "Arrived."
    ].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);
    expect(screen.getByText("Alice")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });

  it("renders independent of a visible Sprite: the Sprite stays visible while the Dialogue speaker/body render", async () => {
    const user = userEvent.setup();
    const source = [
      "@scene s",
      "@sprite show id=alice image=alice-neutral.svg position=left",
      "",
      "@say speaker=Alice",
      "Hello."
    ].join("\n");
    const { container } = render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);
    // The Sprite Presentation suspends first.
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(images(container)).toHaveLength(1);
    expect(images(container)[0]).toHaveAttribute("src", "alice-neutral.svg");
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Hello.")).toBeInTheDocument();
  });
});
