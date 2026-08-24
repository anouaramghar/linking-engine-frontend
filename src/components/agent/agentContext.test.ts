import { describe, expect, it } from "vitest";

import { getAgentViewContext } from "./agentContext";

describe("getAgentViewContext", () => {
  it("turns queue URL state into a readable scope and API context", () => {
    const context = getAgentViewContext(
      "/queue",
      "?site=7&status=pending&min=85&origin=content_pool&unique=1",
    );

    expect(context.scope).toBe(
      "Review queue · Pending · Site #7 · Content pool · Unique targets · Score ≥ 85%",
    );
    expect(context.filters).toEqual({
      site: "7",
      status: "pending",
      min: "85",
      origin: "content_pool",
      unique: "1",
    });
    expect(context.suggestions[0]?.prompt).toContain("oldest");
  });

  it("keeps the route context and starter prompts aligned", () => {
    const context = getAgentViewContext("/publish/42", "");

    expect(context.href).toBe("/publish/42");
    expect(context.scope).toBe("Publication · Site #42");
    expect(context.suggestions.map(({ label }) => label)).toEqual([
      "Ready now",
      "Blocked edits",
      "Next change",
    ]);
  });
});
