import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

async function start(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Start" }));
}

describe("content rendering", () => {
  it("renders a Paragraph as <p>", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc("@scene s\nHello there.\n")} />);
    await start(user);

    const paragraph = screen.getByText("Hello there.");
    expect(paragraph.tagName).toBe("P");
  });

  it("renders a Heading at the correct level", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc("@scene s\n## Chapter Two\n")} />);
    await start(user);

    expect(screen.getByRole("heading", { level: 2, name: "Chapter Two" })).toBeInTheDocument();
  });

  it("renders nested inline formatting (Emphasis, Strong, InlineCode, LineBreak)", async () => {
    const user = userEvent.setup();
    const source = ["@scene s", "Plain *emphasis* and **strong** and `code` and a break.  ", "Second line."].join(
      "\n"
    );
    render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);

    expect(screen.getByText("emphasis").tagName).toBe("EM");
    expect(screen.getByText("strong").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(document.querySelector("br")).not.toBeNull();
  });

  it("Next progresses to the following content", async () => {
    const user = userEvent.setup();
    render(<AfterTextPlayer document={compileDoc("@scene s\nFirst.\n\nSecond.\n")} />);
    await start(user);
    expect(screen.getByText("First.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Second.")).toBeInTheDocument();
    expect(screen.queryByText("First.")).not.toBeInTheDocument();
  });
});

describe("links", () => {
  it("renders a safe https link as a clickable anchor", async () => {
    const user = userEvent.setup();
    const source = ["@scene s", "Visit [our site](https://example.com) today."].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);

    const link = screen.getByRole("link", { name: "our site" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("does not render an unsafe javascript: scheme as an active anchor, but keeps its text visible", async () => {
    const user = userEvent.setup();
    const source = ["@scene s", "Click [here](javascript:alert(1)) maybe."].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);

    expect(screen.queryByRole("link", { name: "here" })).not.toBeInTheDocument();
    expect(screen.getByText(/click here maybe\./i)).toBeInTheDocument();
  });

  it("never introduces a raw-HTML rendering path — HTML-looking text stays literal, inert text", async () => {
    const user = userEvent.setup();
    const source = ["@scene s", "Type `<script>alert(1)</script>` literally."].join("\n");
    render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);

    // Rendered as the literal contents of a <code> element, not interpreted
    // as an actual <script> tag anywhere in the DOM.
    expect(screen.getByText("<script>alert(1)</script>").tagName).toBe("CODE");
    expect(document.querySelector("script")).toBeNull();
  });
});
