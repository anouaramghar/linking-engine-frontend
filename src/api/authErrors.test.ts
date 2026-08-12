import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { startErrorMessage } from "./auth";

const withStatus = (status: number) =>
  new AxiosError("failed", undefined, undefined, undefined, {
    status,
    statusText: "",
    data: null,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

describe("startErrorMessage", () => {
  it("says nothing when the login start succeeded", () => {
    expect(startErrorMessage(null)).toBeNull();
  });

  it("blames the operator's clicking, not the deployment, on a rate limit", () => {
    // The proxy answers 429 and the API answers 503 for "not configured". They
    // arrive at the same button, and swapping them tells someone who clicked
    // twice to go edit environment variables.
    expect(startErrorMessage(withStatus(429))).toMatch(/too many/i);
    expect(startErrorMessage(withStatus(429))).not.toMatch(/TELEGRAM_BOT_TOKEN/);
  });

  it("names the missing configuration when the API reports it", () => {
    expect(startErrorMessage(withStatus(503))).toMatch(/TELEGRAM_BOT_TOKEN/);
  });

  it("still explains itself for an unexpected failure", () => {
    expect(startErrorMessage(withStatus(500))).toMatch(/could not start sign-in/i);
    expect(startErrorMessage(new Error("network down"))).toMatch(/could not start sign-in/i);
  });
});
