import { describe, expect, it } from "vitest";

import { API_TIMEOUT_MS, api } from "./client";

describe("API client", () => {
  it("times out stalled requests instead of leaving queries pending forever", () => {
    expect(api.defaults.timeout).toBe(API_TIMEOUT_MS);
    expect(API_TIMEOUT_MS).toBe(30_000);
  });
});
