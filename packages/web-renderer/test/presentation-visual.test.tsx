import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AfterTextPlayer } from "../src/index.js";
import { compileDoc } from "./helpers.js";

// `<img alt="">` is intentionally decorative (docs/CORE_SPEC.md Section
// 20.15/20.16), so it is exposed under the ARIA role "presentation", not
// "img" — `getByRole("img")` can never find it. These tests query the
// rendered DOM directly instead of by accessible role.
function images(container: HTMLElement): HTMLImageElement[] {
  return Array.from(container.querySelectorAll("img"));
}

function image(container: HTMLElement): HTMLImageElement {
  const found = images(container);
  expect(found).toHaveLength(1);
  return found[0]!;
}

async function start(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Start" }));
}

describe("Presentation application timing", () => {
  it("Background is visible in the same render that exposes its Presentation result", async () => {
    const user = userEvent.setup();
    const document = compileDoc("@scene s\n@background room.jpg\n");
    const { container } = render(<AfterTextPlayer document={document} />);

    await start(user);
    // No extra act()/flush needed — this render already shows the image.
    expect(image(container)).toHaveAttribute("src", "room.jpg");
  });

  it("a quoted Background path (docs/CORE_SPEC.md Section 14) reaches the renderer already decoded, with no source quote delimiters", async () => {
    const user = userEvent.setup();
    const document = compileDoc('@scene s\n@background "night city.png"\n');
    const { container } = render(<AfterTextPlayer document={document} />);

    await start(user);
    expect(image(container)).toHaveAttribute("src", "night city.png");
  });

  it("Layer is visible in the same render that exposes it", async () => {
    const user = userEvent.setup();
    const document = compileDoc("@scene s\n@layer alice.png\n");
    const { container } = render(<AfterTextPlayer document={document} />);

    await start(user);
    expect(image(container)).toHaveAttribute("src", "alice.png");
  });
});

describe("Presentation persistence", () => {
  const SOURCE = ["@scene s", "@background room.jpg", "After.", "", "Second."].join("\n");

  it("Background persists into later content", async () => {
    const user = userEvent.setup();
    const { container } = render(<AfterTextPlayer document={compileDoc(SOURCE)} />);
    await start(user); // presentation
    await user.click(screen.getByRole("button", { name: "Next" })); // "After."

    expect(screen.getByText("After.")).toBeInTheDocument();
    expect(image(container)).toHaveAttribute("src", "room.jpg");
  });

  it("Background persists into Choice", async () => {
    const user = userEvent.setup();
    const source = ["@scene s", "@background room.jpg", "@choice", "- Go -> t", "@end", "", "@scene t", "T."].join(
      "\n"
    );
    const { container } = render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
    expect(image(container)).toHaveAttribute("src", "room.jpg");
  });

  it("Background persists through Navigation", async () => {
    const user = userEvent.setup();
    const source = ["@scene s", "@background room.jpg", "@goto t", "@scene t", "T."].join("\n");
    const { container } = render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(image(container)).toHaveAttribute("src", "room.jpg");
  });

  it("completed does not clear the visual state", async () => {
    const user = userEvent.setup();
    const source = ["@scene s", "@background room.jpg", "The end."].join("\n");
    const { container } = render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);
    await user.click(screen.getByRole("button", { name: "Next" })); // "The end."
    await user.click(screen.getByRole("button", { name: "Next" })); // completed

    expect(screen.getByText("Story complete.")).toBeInTheDocument();
    expect(image(container)).toHaveAttribute("src", "room.jpg");
  });

  it("a runtime error does not clear the visual state", async () => {
    const user = userEvent.setup();
    const source = [
      "---",
      "state:",
      "  divisor: 0",
      "---",
      "@scene s",
      "@background room.jpg",
      "@set x = 10 / divisor"
    ].join("\n");
    const { container } = render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user); // presentation
    await user.click(screen.getByRole("button", { name: "Next" })); // error

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(image(container)).toHaveAttribute("src", "room.jpg");
  });
});

describe("Branch-specific Presentation", () => {
  const SOURCE = [
    "@scene start",
    "@background room-a.jpg",
    "@choice",
    "- Change it -> changed",
    "- Leave it -> unchanged",
    "@end",
    "",
    "@scene changed",
    "@background room-b.jpg",
    "Changed.",
    "",
    "@scene unchanged",
    "Same."
  ].join("\n");

  it("the selected branch's Background replacement takes effect", async () => {
    const user = userEvent.setup();
    const { container } = render(<AfterTextPlayer document={compileDoc(SOURCE)} />);
    await start(user); // presentation (room-a.jpg)
    await user.click(screen.getByRole("button", { name: "Next" })); // -> choice
    await user.click(screen.getByRole("button", { name: "Change it" }));
    await user.click(screen.getByRole("button", { name: "Continue" })); // navigation
    await user.click(screen.getByRole("button", { name: "Next" })); // presentation -> content

    expect(screen.getByText("Changed.")).toBeInTheDocument();
    expect(image(container)).toHaveAttribute("src", "room-b.jpg");
  });

  it("a branch with no replacement preserves the previous Background, unaffected by the other branch", async () => {
    const user = userEvent.setup();
    const { container } = render(<AfterTextPlayer document={compileDoc(SOURCE)} />);
    await start(user); // presentation (room-a.jpg)
    await user.click(screen.getByRole("button", { name: "Next" })); // -> choice
    await user.click(screen.getByRole("button", { name: "Leave it" }));
    await user.click(screen.getByRole("button", { name: "Continue" })); // navigation

    expect(screen.getByText("Same.")).toBeInTheDocument();
    expect(image(container)).toHaveAttribute("src", "room-a.jpg");
  });
});

describe("Reset behavior", () => {
  it("Restart clears Background and Layer", async () => {
    const user = userEvent.setup();
    const document = compileDoc("@scene s\n@background room.jpg\n@layer alice.png\nThe end.\n");
    const { container } = render(<AfterTextPlayer document={document} />);
    await start(user);
    await user.click(screen.getByRole("button", { name: "Next" })); // presentation -> presentation (layer)
    await user.click(screen.getByRole("button", { name: "Next" })); // -> content
    await user.click(screen.getByRole("button", { name: "Next" })); // -> completed

    expect(images(container)).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Restart" }));

    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(images(container)).toHaveLength(0);
  });

  it("a new document prop clears Background and Layer", async () => {
    const user = userEvent.setup();
    const first = compileDoc("@scene s\n@background room.jpg\nHi.\n");
    const second = compileDoc("@scene s\nHi again.\n");

    const { container, rerender } = render(<AfterTextPlayer document={first} />);
    await start(user);
    expect(images(container)).toHaveLength(1);

    rerender(<AfterTextPlayer document={second} />);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(images(container)).toHaveLength(0);
  });

  it("changing resolveAsset alone does not restart the Player or clear PresentationState", async () => {
    const user = userEvent.setup();
    const document = compileDoc("@scene s\n@background room.jpg\nHi.\n");
    const upper = (ref: string): string => ref.toUpperCase();

    const { container, rerender } = render(<AfterTextPlayer document={document} />);
    await start(user);
    expect(image(container)).toHaveAttribute("src", "room.jpg");

    rerender(<AfterTextPlayer document={document} resolveAsset={upper} />);

    // Still mid-story (not reset to Start), and the SAME background is now
    // resolved through the new resolver without any story replay.
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(image(container)).toHaveAttribute("src", "ROOM.JPG");
  });
});

describe("resolveAsset", () => {
  it("defaults to identity when omitted", async () => {
    const user = userEvent.setup();
    const { container } = render(<AfterTextPlayer document={compileDoc("@scene s\n@background room.jpg\n")} />);
    await start(user);
    expect(image(container)).toHaveAttribute("src", "room.jpg");
  });

  it("uses a custom resolver, receiving the correct kind", async () => {
    const user = userEvent.setup();
    const seen: Array<{ ref: string; kind: string }> = [];
    const resolveAsset = (ref: string, kind: "background" | "layer" | "music" | "sfx"): string => {
      seen.push({ ref, kind });
      return `/assets/${ref}`;
    };
    const document = compileDoc("@scene s\n@background room.jpg\n@layer alice.png\n");
    const { container } = render(<AfterTextPlayer document={document} resolveAsset={resolveAsset} />);
    await start(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(images(container).map((img) => img.getAttribute("src"))).toEqual(["/assets/room.jpg", "/assets/alice.png"]);
    // resolveAsset is a pure, deterministic function of (ref, kind) — it may
    // be invoked more than once per value (e.g. once per render), but every
    // invocation for a given slot must carry the correct ref/kind pair.
    expect(seen).toContainEqual({ ref: "room.jpg", kind: "background" });
    expect(seen).toContainEqual({ ref: "alice.png", kind: "layer" });
    expect(seen.every((call) => (call.ref === "room.jpg" ? call.kind === "background" : call.kind === "layer"))).toBe(
      true
    );
  });

  it("a resolver returning null shows a non-fatal fallback, not a broken image", async () => {
    const user = userEvent.setup();
    const document = compileDoc("@scene s\n@background room.jpg\n");
    const { container } = render(<AfterTextPlayer document={document} resolveAsset={() => null} />);
    await start(user);

    expect(images(container)).toHaveLength(0);
    expect(screen.getByText(/unavailable: room\.jpg/)).toBeInTheDocument();
  });

  it("an unsafe resolved URL never becomes an image source", async () => {
    const user = userEvent.setup();
    const document = compileDoc("@scene s\n@background room.jpg\n");
    const { container } = render(
      <AfterTextPlayer document={document} resolveAsset={() => "javascript:alert(1)"} />
    );
    await start(user);

    expect(images(container)).toHaveLength(0);
    expect(screen.getByText(/unavailable: room\.jpg/)).toBeInTheDocument();
  });
});

describe("Asset load failure", () => {
  it("a failed image load renders the fallback and never produces a RuntimeExecutionError", async () => {
    const user = userEvent.setup();
    const document = compileDoc("@scene s\n@background room.jpg\n");
    const { container } = render(<AfterTextPlayer document={document} />);
    await start(user);

    fireEvent.error(image(container));

    expect(images(container)).toHaveLength(0);
    expect(screen.getByText(/unavailable: room\.jpg/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a replacement asset does not inherit a stale failure state", async () => {
    const user = userEvent.setup();
    const source = ["@scene s", "@background room-a.jpg", "@background room-b.jpg", "Hi."].join("\n");
    const { container } = render(<AfterTextPlayer document={compileDoc(source)} />);
    await start(user);

    fireEvent.error(image(container));
    expect(images(container)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Next" })); // second @background

    // The new asset gets a fresh chance to load — not permanently hidden
    // by the previous asset's failure.
    expect(image(container)).toHaveAttribute("src", "room-b.jpg");
  });
});

describe("Deferred Presentation commands remain unchanged", () => {
  // Pause and Camera are intentionally excluded — Pause is always a real
  // timing gate (Section 21) and Camera now updates persistent zoom state
  // and, with an explicit duration, is also a real timing gate (Section
  // 22); see test/timed-presentation.test.ts and test/camera.test.tsx.
  // Music/Sfx remain the only commands with zero renderer-visible effect.
  it.each([
    ["@music theme.mp3", "Music: theme.mp3"],
    ["@sfx click.wav", "Sfx: click.wav"]
  ])("%s stays acknowledged, requires Next, and creates no visual", async (directive, expectedText) => {
    const user = userEvent.setup();
    const { container } = render(<AfterTextPlayer document={compileDoc(`@scene s\n${directive}\n`)} />);
    await start(user);

    expect(screen.getByText(expectedText)).toBeInTheDocument();
    expect(images(container)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });
});
