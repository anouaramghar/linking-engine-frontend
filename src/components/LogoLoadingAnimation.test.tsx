import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import LogoLoadingAnimation, { LogoLoadingIndicator } from "./LogoLoadingAnimation";

afterEach(cleanup);

describe("LogoLoadingAnimation", () => {
  it("renders the animated SVG with status role and custom label", () => {
    const { container } = render(<LogoLoadingAnimation label="Crawling site content..." size="md" />);

    const svg = screen.getByRole("status", { name: "Crawling site content..." });
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("24");
    expect(container.querySelector(".logo-anim-node-solid")).not.toBeNull();
    expect(container.querySelector(".logo-anim-node-hollow")).not.toBeNull();
    expect(container.querySelector(".logo-anim-link")).not.toBeNull();
  });

  it("supports numeric sizes and static mode", () => {
    const { container } = render(<LogoLoadingAnimation size={32} static />);

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(container.querySelector(".logo-anim-svg")).toBeNull();
  });

  it("renders LogoLoadingIndicator with label text", () => {
    render(<LogoLoadingIndicator text="Reading source article" />);

    expect(screen.getByText("Reading source article")).not.toBeNull();
    expect(screen.getByRole("status", { name: "Reading source article" })).not.toBeNull();
  });
});
