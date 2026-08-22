import { describe, expect, it } from "vitest";

import {
  AGENT_CHAT_TIMEOUT_MS,
  API_TIMEOUT_MS,
  LINKMESH_CLIENT_HEADER,
  LINKMESH_CLIENT_VALUE,
  api,
} from "./client";

describe("API client", () => {
  it("times out stalled requests instead of leaving queries pending forever", () => {
    expect(api.defaults.timeout).toBe(API_TIMEOUT_MS);
    expect(API_TIMEOUT_MS).toBe(30_000);
  });

  it("gives the assistant longer than one request's worth of budget", () => {
    // Chat is a multi-turn loop: a tool call, its result, then a reply. Each
    // turn is a separate model call, so the shared 30s budget aborted the
    // panel while the engine was still working and about to answer.
    expect(AGENT_CHAT_TIMEOUT_MS).toBeGreaterThan(API_TIMEOUT_MS);
    expect(AGENT_CHAT_TIMEOUT_MS).toBe(120_000);
  });

  it("marks browser calls so the authenticated proxy can reject bare form CSRF", () => {
    expect(api.defaults.headers[LINKMESH_CLIENT_HEADER]).toBe(
      LINKMESH_CLIENT_VALUE,
    );
  });
});
