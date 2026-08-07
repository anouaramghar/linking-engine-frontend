import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLogout } from "./useSession";

const logout = vi.fn();

vi.mock("../api/auth", () => ({
  getSession: vi.fn(),
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
