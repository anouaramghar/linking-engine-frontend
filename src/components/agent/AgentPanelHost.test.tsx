import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentPanelHost from "./AgentPanelHost";

vi.mock("./AgentPanel", () => ({
  default: ({ initialOpen }: { initialOpen?: boolean }) => (
    <div data-testid="agent-panel" data-initial-open={String(initialOpen)}>
      Panel
    </div>
  ),
}));

afterEach(cleanup);

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("AgentPanelHost", () => {
  it("loads the panel closed after mount so the avatar launcher needs no click", async () => {
    render(<AgentPanelHost currentPath="/queue" />);

    expect((await screen.findByTestId("agent-panel")).getAttribute("data-initial-open")).toBe(
      "false",
    );
  });

  it("loads immediately for a signed MCP action link", async () => {
    window.history.replaceState(null, "", "/#mcp-action=receipt");

    render(<AgentPanelHost currentPath="/queue" />);

    expect((await screen.findByTestId("agent-panel")).getAttribute("data-initial-open")).toBe(
      "true",
    );
  });
});
