/**
 * The asynchronous preparation contract, from the polled job to the callback.
 *
 * `job.data.result` used to be cast through `unknown` into
 * `PublicationPreparation`, so a worker whose result drifted still compiled and
 * only broke in front of an operator. The backend now builds that result from a
 * named Pydantic model and the hook names the same shape, which is what these
 * tests hold in place.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicationPreparation } from "../api/publish";
import { usePreparePublicationPlans, useQueueApprovedPlans } from "./usePublish";

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  preparePublicationPlans: vi.fn(),
  queueApprovedPlans: vi.fn(),
}));

vi.mock("../api/jobs", () => ({
  getJob: mocks.getJob,
  getActiveJobs: vi.fn(),
}));

vi.mock("../api/publish", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/publish")>();
  return {
    ...actual,
    preparePublicationPlans: mocks.preparePublicationPlans,
    queueApprovedPlans: mocks.queueApprovedPlans,
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PREPARATION: PublicationPreparation = {
  site_id: 4,
  selected_suggestions: 2,
  plans: [
    {
      id: 55,
      status: "prepared",
      plan_hash: "a".repeat(64),
      source_article_id: 10,
      source_url: "https://example.com/source",
      links: [
        {
          position: 0,
          suggestion_id: 1,
          target_url: "https://example.com/target",
          anchor_text: "solar panel",
          placement_context: "solar panel costs",
          outcome: "inserted",
        },
      ],
    },
  ],
  errors: [
    {
      source_article_id: 99,
      source_url: "https://example.com/broken",
      message: "post is gone",
    },
  ],
  has_more: true,
};

beforeEach(() => {
  mocks.getJob.mockReset();
  mocks.preparePublicationPlans.mockReset();
  mocks.queueApprovedPlans.mockReset();
  mocks.preparePublicationPlans.mockResolvedValue({ job_id: "prepare-1", job_run_id: 7 });
});

afterEach(() => vi.clearAllMocks());

describe("usePreparePublicationPlans", () => {
  it("delivers the succeeded job's result as a typed preparation", async () => {
    mocks.getJob.mockResolvedValue({
      job_id: "prepare-1",
      status: "succeeded",
      result: PREPARATION,
      progress: null,
      progress_at: null,
      error: null,
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => usePreparePublicationPlans(), { wrapper });

    result.current.mutate(4, { onSuccess });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(PREPARATION));
    await waitFor(() => expect(result.current.data).toEqual(PREPARATION));
    // Every field the review reads survives the round trip, including the
    // passage and the two counts a batch must never conflate.
    const delivered = onSuccess.mock.calls[0][0] as PublicationPreparation;
    expect(delivered.plans[0].links[0].placement_context).toBe("solar panel costs");
    expect(delivered.errors[0].message).toBe("post is gone");
    expect(delivered.has_more).toBe(true);
    expect(result.current.isPending).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("reports a failed job as an error rather than an empty preparation", async () => {
    mocks.getJob.mockResolvedValue({
      job_id: "prepare-1",
      status: "failed",
      result: null,
      progress: null,
      progress_at: null,
      error: "wordpress refused the request",
    });
    const onError = vi.fn();
    const { result } = renderHook(() => usePreparePublicationPlans(), { wrapper });

    result.current.mutate(4, { onError });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect((onError.mock.calls[0][0] as Error).message).toBe(
      "wordpress refused the request",
    );
    // A failed job has no result, and nothing may present one anyway.
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("stops loading when the preparation status poll fails", async () => {
    mocks.getJob.mockRejectedValue(new Error("status poll failed"));
    const onError = vi.fn();
    const { result } = renderHook(() => usePreparePublicationPlans(), { wrapper });

    result.current.mutate(4, { onError });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect((onError.mock.calls[0][0] as Error).message).toBe("status poll failed");
    expect(result.current.isError).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  it("reports the enqueue itself failing, before any job exists", async () => {
    mocks.preparePublicationPlans.mockRejectedValue(new Error("engine unreachable"));
    const onError = vi.fn();
    const { result } = renderHook(() => usePreparePublicationPlans(), { wrapper });

    result.current.mutate(4, { onError });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(mocks.getJob).not.toHaveBeenCalled();
  });
});

describe("useQueueApprovedPlans", () => {
  it("queues a named subset and refreshes everything the job moves", async () => {
    mocks.queueApprovedPlans.mockResolvedValue({});
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useQueueApprovedPlans(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate({ siteId: 4, planIds: [55] });

    await waitFor(() => expect(mocks.queueApprovedPlans).toHaveBeenCalledWith(4, [55]));
    await waitFor(() =>
      expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual(
        expect.arrayContaining([
          ["suggestions"],
          ["publish", "pending"],
          ["sites"],
          ["jobs"],
        ]),
      ),
    );
  });

  it("recovers a site's approved plans without naming any of them", async () => {
    mocks.queueApprovedPlans.mockResolvedValue({});
    const { result } = renderHook(() => useQueueApprovedPlans(), { wrapper });

    // The reload path: the browser no longer knows which plans it approved, so
    // the backend's documented site-wide behavior is the whole contract.
    result.current.mutate({ siteId: 4 });

    await waitFor(() =>
      expect(mocks.queueApprovedPlans).toHaveBeenCalledWith(4, undefined),
    );
  });
});
