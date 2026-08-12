import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLogout, useSession } from "./useSession";

const logout = vi.fn();
const getSession = vi.fn();

vi.mock("../api/auth", () => ({
  getSession: () => getSession(),
  logout: () => logout(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** jsdom's own `location` is non-writable, so it has to be replaced outright. */
const assign = vi.fn();
vi.stubGlobal("location", { assign });

afterEach(() => vi.clearAllMocks());

describe("useLogout", () => {
  it("leaves the page once the session has ended", async () => {
    // The regression: the session ended on the server but the tab stayed put,
    // so the operator went on looking at a dashboard they were signed out of.
    logout.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLogout(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("still leaves when the request fails, rather than stranding the operator", async () => {
    logout.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useLogout(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });
});

describe("useSession", () => {
  it("treats only a 401 as signed out", async () => {
    getSession.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeNull());
    expect(result.current.isError).toBe(false);
  });

  it("keeps a backend outage distinct from signed out", async () => {
    getSession.mockRejectedValue({ isAxiosError: true, response: { status: 500 } });

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
