import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToolTrace } from "./AgentEvidence";

describe("ToolTrace", () => {
  it("turns a registry trace into readable evidence with a deep link", () => {
    render(
      <ToolTrace
        name="get_queue_counts"
        outcome={{ pending: 12, approved: 4, site_id: 7 }}
        currentHref="/queue?status=pending"
      />,
    );

    expect(screen.getByText("Review queue")).not.toBeNull();
    expect(screen.getByText("12 pending")).not.toBeNull();
    expect(screen.getByText("Pending")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Open review queue" }).getAttribute("href")).toBe(
      "/queue?status=pending&site=7",
    );
    expect(screen.getByText("get_queue_counts")).not.toBeNull();
  });
});
