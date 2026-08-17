import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getEvaluationCsv,
  getEvaluationMetrics,
  getEvaluationSuggestions,
} from "./evaluation";

const get = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({ api: { get } }));

beforeEach(() => get.mockReset());

describe("evaluation API", () => {
  it("loads metrics with the selected cohort filters", async () => {
    const metrics = { generated_at: "2026-08-05T12:00:00Z" };
    const filters = {
      site_id: 7,
      date_from: "2026-07-06T12:00:00Z",
      date_to: "2026-08-05T12:00:00Z",
    };
    get.mockResolvedValue({ data: metrics });

    await expect(getEvaluationMetrics(filters)).resolves.toEqual(metrics);
    expect(get).toHaveBeenCalledWith("/evaluation/metrics", { params: filters });
  });

  it("loads one drill-down metric with the same filters", async () => {
    const filters = { site_id: 7 };
    get.mockResolvedValue({ data: { total: 0, items: [] } });

    await getEvaluationSuggestions("accepted", filters);

    expect(get).toHaveBeenCalledWith("/evaluation/suggestions", {
      params: { site_id: 7, metric: "accepted", limit: 50, offset: 0 },
    });
  });

  it("downloads the filtered CSV as a blob", async () => {
    const blob = new Blob(["suggestion_id\n1"]);
    get.mockResolvedValue({ data: blob });

    await expect(getEvaluationCsv({ site_id: 7 })).resolves.toBe(blob);
    expect(get).toHaveBeenCalledWith("/evaluation/export.csv", {
      params: { site_id: 7 },
      responseType: "blob",
    });
  });
});
