import { describe, expect, it } from "vitest";

import {
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

  it("marks browser calls so the authenticated proxy can reject bare form CSRF", () => {
    expect(api.defaults.headers[LINKMESH_CLIENT_HEADER]).toBe(LINKMESH_CLIENT_VALUE);
  });
});
