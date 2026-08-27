import { describe, expect, it } from "vitest";

import {
  normalizeTraceabilityDraft,
  traceabilityFiltersFromDraft,
  traceabilitySearchParams,
  traceabilityStateFromSearchParams,
  type TraceabilityFilterDraft,
} from "./traceabilityFilters";

const draft: TraceabilityFilterDraft = {
  traceId: " trace-abc ",
  actor: " editor ",
  eventType: "exposed",
  status: "pending",
  siteId: 7,
  dateFrom: "2026-08-01",
  dateTo: "2026-08-10",
};

describe("traceability filter state", () => {
  it("normalizes the draft into the API filter contract", () => {
    expect(traceabilityFiltersFromDraft(draft)).toEqual({
      trace_id: "trace-abc",
      actor: "editor",
      event_type: "exposed",
      status: "pending",
      site_id: 7,
      date_from: new Date("2026-08-01T00:00:00").toISOString(),
      date_to: new Date("2026-08-10T23:59:59.999").toISOString(),
    });
  });

  it("round-trips applied filters and pagination through the URL", () => {
    const params = traceabilitySearchParams(draft, 50);
    const restored = traceabilityStateFromSearchParams(params);

    expect(restored.draft).toEqual(normalizeTraceabilityDraft(draft));
    expect(restored.filters).toEqual(traceabilityFiltersFromDraft(draft));
    expect(restored.offset).toBe(50);
  });

  it("ignores malformed dates in shared URLs instead of throwing", () => {
    const params = new URLSearchParams({
      date_from: "2026-02-31",
      date_to: "not-a-date",
    });

    expect(() => traceabilityStateFromSearchParams(params)).not.toThrow();
    expect(traceabilityStateFromSearchParams(params)).toMatchObject({
      draft: { dateFrom: "", dateTo: "" },
      filters: {},
    });
  });
});
