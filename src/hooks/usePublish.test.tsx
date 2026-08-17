/**
 * The asynchronous preparation contract, from the polled job to the callback.
 *
 * `job.data.result` used to be cast through `unknown` into
 * `PublicationPreparation`, so a worker whose result drifted still compiled and
 * only broke in front of an operator. The backend now builds that result from a
 * named Pydantic model and the hook names the same shape, which is what these
 * tests hold in place.
 */
import { StrictMode, useEffect, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, waitFor } from "@testing-library/react";
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

  it("drops a stale job when the route no longer names one", async () => {
    mocks.getJob.mockResolvedValue({
      job_id: "prepare-old",
      status: "running",
      result: null,
      progress: null,
      progress_at: null,
      error: null,
    });
    const { result, rerender } = renderHook(
      ({ jobId }: { jobId: string | null }) => usePreparePublicationPlans(jobId),
      { initialProps: { jobId: "prepare-old" as string | null }, wrapper },
    );

    await waitFor(() => expect(result.current.isPending).toBe(true));
    rerender({ jobId: null });

    await waitFor(() => expect(result.current.jobId).toBeNull());
    expect(result.current.isPending).toBe(false);
  });

  /**
   * The exact shape of the hang Amir hit on 2026-08-13: the review page starts
   * this preparation from an effect the moment it arrives, and the answer must
   * survive the remount React performs in the same commit. It did not while the
   * enqueue was a `useMutation`, because an observer that loses its last
   * listener detaches from the mutation it started. The POST was accepted, the
   * job succeeded in about a second, and the operator read "Reading up to 10
   * source articles" until they reloaded the page.
   */
  it("delivers a preparation started from a mount effect under StrictMode", async () => {
    mocks.getJob.mockResolvedValue({
      job_id: "prepare-1",
      status: "succeeded",
      result: PREPARATION,
      progress: null,
      progress_at: null,
      error: null,
    });
    const onQueued = vi.fn();
    const onSuccess = vi.fn();

    function OnArrival() {
      const prepare = usePreparePublicationPlans(null);
      const attempted = useRef(false);
      useEffect(() => {
        if (attempted.current) return;
        attempted.current = true;
        prepare.mutate(4, { onQueued, onSuccess });
        // The ref is the guard. Re-running this is what the page does too.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <div>{prepare.isPending ? "preparing" : "settled"}</div>;
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { findAllByText } = render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <OnArrival />
        </QueryClientProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(PREPARATION));
    // The job id has to reach the caller as well: it is what the page writes
    // into the route, and the only thing that makes a reload recover the batch
    // instead of paying for the live reads a second time.
    expect(onQueued).toHaveBeenCalledWith("prepare-1");
    expect((await findAllByText("settled")).length).toBeGreaterThan(0);
  });

  it("reports the enqueue itself failing, before any job exists", async () => {
    mocks.preparePublicationPlans.mockRejectedValue(new Error("engine unreachable"));
    const onError = vi.fn();
    const { result } = renderHook(() => usePreparePublicationPlans(), { wrapper });

    result.current.mutate(4, { onError });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(mocks.getJob).not.toHaveBeenCalled();
  });

  it("reuses an accepted preparation when the page remounts", async () => {
    let resolveAccepted!: (value: { job_id: string; job_run_id: number }) => void;
    mocks.preparePublicationPlans.mockImplementation(
      () => new Promise((resolve) => (resolveAccepted = resolve)),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const provider = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const first = renderHook(() => usePreparePublicationPlans(null, "4:all"), { wrapper: provider });

    first.result.current.mutate(4);
    await waitFor(() => expect(mocks.preparePublicationPlans).toHaveBeenCalledTimes(1));
    resolveAccepted({ job_id: "prepare-1", job_run_id: 7 });
    await waitFor(() => expect(first.result.current.jobId).toBe("prepare-1"));
    first.unmount();

    const second = renderHook(() => usePreparePublicationPlans(null, "4:all"), { wrapper: provider });
    second.result.current.mutate(4);

    await waitFor(() => expect(second.result.current.jobId).toBe("prepare-1"));
    expect(mocks.preparePublicationPlans).toHaveBeenCalledTimes(1);
  });

  it("allows an explicit reset to prepare the same scope again", async () => {
    mocks.preparePublicationPlans.mockResolvedValue({ job_id: "prepare-1", job_run_id: 7 });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const provider = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePreparePublicationPlans(null, "4:all"), {
      wrapper: provider,
    });

    result.current.mutate(4);
    await waitFor(() => expect(result.current.jobId).toBe("prepare-1"));
    result.current.reset();
    result.current.mutate(4);

    await waitFor(() => expect(mocks.preparePublicationPlans).toHaveBeenCalledTimes(2));
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
