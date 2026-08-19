import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import type { EvaluationMetrics } from "../api/evaluation";
import EvaluationPage from "./EvaluationPage";

const useEvaluationMetrics = vi.hoisted(() => vi.fn());
const useEvaluationSuggestions = vi.hoisted(() => vi.fn());
const useSites = vi.hoisted(() => vi.fn());
const getEvaluationCsv = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useEvaluation", () => ({
  useEvaluationMetrics,
  useEvaluationSuggestions,
}));
vi.mock("../hooks/useSites", () => ({ useSites }));
vi.mock("../api/evaluation", () => ({ getEvaluationCsv }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const metrics: EvaluationMetrics = {
  generated_at: "2026-08-05T12:00:00Z",
  site_id: null,
  date_from: "2026-07-06T12:00:00Z",
  date_to: "2026-08-05T12:00:00Z",
  cohort_definition:
    "The date range selects suggestions generated during that period; outcomes describe that cohort.",
  provenance: {
    surface: "operational_telemetry",
    schema_version: "evaluation_metrics_v2",
    commit: "abc1234",
    evidence_cutoff: "2026-08-05T11:00:00Z",
    individual_labels: 70,
    bulk_labels: 30,
    label_provenance:
      "70 decisions made row by row, 30 made by a bulk rule. Both are counted in the rates on this page; only the first are individual labels.",
    sample_state: "more_individual_labels_required",
    sites_meeting_label_target: 0,
    individual_label_target: 100,
    baseline_site_target: 3,
    limitations: [
      "Operational telemetry, not an evidence artifact.",
      "Acceptance is not correctness.",
    ],
    supports_ranking_decisions: false,
  },
  editorial: {
    suggestions_total: 120,
    pending: 20,
    accepted: 60,
    rejected: 40,
    decisions: 100,
    acceptance_rate: 0.6,
    rejection_rate: 0.4,
    average_decision_hours: 7.5,
    median_decision_hours: 5,
    decision_time_sample: 100,
  },
  exposure: {
    suggestions: 120,
    exposed: 90,
    unseen: 30,
    exposure_rate: 0.75,
    exposed_decisions: 75,
    unseen_decisions: 25,
    exposed_acceptance_rate: 0.64,
  },
  rejection_reasons: [
    { reason: "wrong_target", count: 12 },
    { reason: "unspecified", count: 8 },
  ],
  graph_impact: {
    suggestions_with_graph_context: 80,
    graph_adjusted_suggestions: 20,
    exposed_graph_suggestions: 60,
    accepted_or_published_graph_suggestions: 35,
    orphan_targets_accepted: 10,
    underlinked_targets_accepted: 15,
  },
  placement: { generated: 50, successful: 35, success_rate: 0.7 },
  publication: {
    completed: 20,
    succeeded: 18,
    failed: 2,
    success_rate: 0.9,
    failure_rate: 0.1,
  },
  orphans: { active_articles: 500, remaining: 125, reduced_by_linkmesh: 22 },
  comparison: {
    previous_from: "2026-06-06T12:00:00Z",
    previous_to: "2026-07-06T12:00:00Z",
    suggestions_change_rate: 0.2,
    acceptance_rate_change: 0.1,
    placement_success_rate_change: -0.05,
    publication_success_rate_change: null,
  },
  trend: [
    {
      bucket_start: "2026-07-07",
      generated: 50,
      accepted: 20,
      rejected: 10,
      applied: 5,
      acceptance_rate: 0.6667,
    },
    {
      bucket_start: "2026-07-14",
      generated: 70,
      accepted: 40,
      rejected: 30,
      applied: 13,
      acceptance_rate: 0.5714,
    },
  ],
  orphan_trend: [
    { snapshot_date: "2026-08-05", active_articles: 500, remaining: 125 },
  ],
  methods: [
    {
      method: "hybrid_bm25",
      suggestions: 80,
      pending: 10,
      accepted: 49,
      rejected: 21,
      applied: 16,
      acceptance_rate: 0.7,
      average_semantic_score: 0.84,
    },
    {
      method: "baseline_cosine",
      suggestions: 40,
      pending: 10,
      accepted: 11,
      rejected: 19,
      applied: 2,
      acceptance_rate: 0.3667,
      average_semantic_score: 0.76,
    },
  ],
  score_ranges: [
    {
      label: "80-89%",
      minimum: 80,
      maximum: 89,
      suggestions: 40,
      pending: 10,
      accepted: 24,
      rejected: 6,
      acceptance_rate: 0.8,
    },
  ],
  sites: [
    {
      site_id: 1,
      site_name: "Example site",
      suggestions: 120,
      pending: 20,
      accepted: 60,
      rejected: 40,
      applied: 18,
      acceptance_rate: 0.6,
    },
  ],
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

const renderPage = (entry = "/evaluation") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <EvaluationPage />
      <LocationProbe />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));
  useEvaluationMetrics.mockReset();
  useEvaluationSuggestions.mockReset();
  useSites.mockReset();
  getEvaluationCsv.mockReset();
  useEvaluationMetrics.mockReturnValue({
    data: metrics,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  useEvaluationSuggestions.mockReturnValue({
    data: {
      total: 1,
      limit: 50,
      offset: 0,
      items: [
        {
          id: 7,
          trace_id: "trace-7",
          site_id: 1,
          site_name: "Example site",
          source_title: "Source article",
          target_title: "Target article",
          method: "hybrid_bm25",
          score: 0.91,
          status: "approved",
          occurred_at: "2026-08-05T10:00:00Z",
        },
      ],
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  useSites.mockReturnValue({
    data: [
      { id: 1, name: "Example site", platform: "wordpress" },
      { id: 2, name: "Content pool", platform: "pool" },
    ],
  });
});

describe("EvaluationPage", () => {
  it("renders live filters, comparisons, trends and metric definitions", () => {
    renderPage();

    expect(screen.getByRole("combobox", { name: "Date range" }).className).toContain(
      "field",
    );
    expect(screen.getByRole("combobox", { name: "Site" }).className).toContain("field");
    expect(screen.getAllByLabelText("What this metric means")).toHaveLength(9);
    expect(screen.getByText("Editor acceptance")).not.toBeNull();
    expect(screen.getByText("Median decision time")).not.toBeNull();
    expect(screen.getByText("Placement success")).not.toBeNull();
    expect(screen.getByText("Publishing success")).not.toBeNull();
    expect(screen.getByText("Exposure and labels")).not.toBeNull();
    expect(screen.getByText("Graph impact and rejection reasons")).not.toBeNull();
    expect(screen.getByText("Wrong target")).not.toBeNull();
    expect(screen.getAllByText("60%").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("+10.0 pp vs previous")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Acceptance rate over time" })).not.toBeNull();
    expect(
      screen.getByRole("table", { name: "Acceptance rate data over time" }),
    ).not.toBeNull();
    expect(screen.getByRole("table", { name: "Ranking method comparison" })).not.toBeNull();
    expect(screen.getByRole("table", { name: "Editor acceptance by semantic score" })).not.toBeNull();
    expect(screen.getByRole("table", { name: "Suggestions by site" })).not.toBeNull();
    expect(screen.getByText(/First snapshot recorded/)).not.toBeNull();
    expect(screen.getByText("How these metrics are calculated")).not.toBeNull();
    expect(screen.getByText(metrics.cohort_definition)).not.toBeNull();
    expect(screen.getByText("Hybrid BM25")).not.toBeNull();
    expect(screen.getByText("Cosine baseline")).not.toBeNull();
    expect(document.body.textContent).not.toContain("Soon");
    expect(document.body.textContent).not.toContain("GraphSAGE");
  });

  it("states that the page is telemetry and shows its provenance and limitations", () => {
    renderPage();

    expect(screen.getByText("Operational telemetry")).not.toBeNull();
    expect(screen.getByText("Not evidence for ranking or model changes")).not.toBeNull();
    expect(screen.getByText(/More individual labels required/)).not.toBeNull();
    expect(screen.getByText(/0 of 3 sites at the label target/)).not.toBeNull();
    expect(screen.getByText(/70 individual, 30 from bulk rules/)).not.toBeNull();
    expect(screen.getByText(/evaluation_metrics_v2 · commit abc1234/)).not.toBeNull();
    expect(screen.getByText("What these numbers cannot settle (2)")).not.toBeNull();
    expect(screen.getByText("Acceptance is not correctness.")).not.toBeNull();
  });

  it("stores selected date and site filters in the URL and query contract", () => {
    renderPage();

    fireEvent.change(screen.getByRole("combobox", { name: "Date range" }), {
      target: { value: "7d" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Site" }), {
      target: { value: "1" },
    });

    expect(screen.getByTestId("location").textContent).toContain("range=7d");
    expect(screen.getByTestId("location").textContent).toContain("site=1");
    expect(useEvaluationMetrics).toHaveBeenLastCalledWith({
      site_id: 1,
      date_from: "2026-07-29T12:00:00.000Z",
      date_to: "2026-08-05T12:00:00.000Z",
    });
  });

  it("opens a drill-down with the suggestions behind a metric", () => {
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "View matching suggestions" })[0]);

    expect(screen.getByRole("dialog", { name: "Accepted suggestions" })).not.toBeNull();
    expect(screen.getByText("Source article")).not.toBeNull();
    expect(screen.getByText("Target article")).not.toBeNull();
    expect(useEvaluationSuggestions).toHaveBeenCalledWith(
      "accepted",
      expect.objectContaining({ date_from: "2026-07-06T12:00:00.000Z" }),
    );
  });

  it("exports the filtered cohort as CSV", async () => {
    vi.useRealTimers();
    const blob = new Blob(["suggestion_id\n7"], { type: "text/csv" });
    getEvaluationCsv.mockResolvedValue(blob);
    const createObjectURL = vi.fn(() => "blob:evaluation");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage("/evaluation?range=all&site=1");

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => expect(getEvaluationCsv).toHaveBeenCalledWith({ site_id: 1 }));
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    await waitFor(
      () => expect(revokeObjectURL).toHaveBeenCalledWith("blob:evaluation"),
      { timeout: 1_500 },
    );
  });

  it("reports a failed CSV export instead of failing silently", async () => {
    vi.useRealTimers();
    getEvaluationCsv.mockRejectedValue(new Error("network unavailable"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("CSV export failed"));
  });

  it("shows an empty state when no score ranges are available", () => {
    useEvaluationMetrics.mockReturnValue({
      data: { ...metrics, score_ranges: [] },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("No scored decisions were recorded in this period.")).not.toBeNull();
  });

  it("uses an unavailable value when a metric has no sample", () => {
    useEvaluationMetrics.mockReturnValue({
      data: {
        ...metrics,
        editorial: {
          ...metrics.editorial,
          decisions: 0,
          accepted: 0,
          rejected: 0,
          acceptance_rate: null,
          rejection_rate: null,
          average_decision_hours: null,
          median_decision_hours: null,
          decision_time_sample: 0,
        },
        placement: { generated: 0, successful: 0, success_rate: null },
        publication: {
          completed: 0,
          succeeded: 0,
          failed: 0,
          success_rate: null,
          failure_rate: null,
        },
      },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("No editorial decisions yet")).not.toBeNull();
    expect(screen.getByText("No placements generated yet")).not.toBeNull();
    expect(screen.getByText("No completed publications yet")).not.toBeNull();
  });

  it("keeps enough precision for very low live acceptance rates", () => {
    useEvaluationMetrics.mockReturnValue({
      data: {
        ...metrics,
        editorial: { ...metrics.editorial, acceptance_rate: 0.0036 },
      },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByText("0.36%")).not.toBeNull();
  });

  it("retries a failed metrics request", () => {
    const refetch = vi.fn();
    useEvaluationMetrics.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      refetch,
    });

    renderPage();
    expect(screen.getByRole("alert").textContent).toContain("Evaluation metrics could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
