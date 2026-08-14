import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageStateProvider } from "../hooks/usePageState";
import TraceabilityPage from "./TraceabilityPage";

const mocks = vi.hoisted(() => ({
  filters: {} as Record<string, unknown>,
  copy: vi.fn(),
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => ({
    data: [
      {
        id: 7,
        name: "Editorial site",
        platform: "wordpress",
      },
    ],
  }),
}));

vi.mock("../hooks/useTraceability", () => ({
  useTraceEvents: (filters: Record<string, unknown>) => {
    mocks.filters = filters;
    return {
      data: {
        total: 1,
        limit: 50,
        offset: 0,
        items: [
          {
            id: 12,
            suggestion_id: 34,
            trace_id: "trace-abc",
            event_type: "publish_attempt_failed",
            actor: "system:publication",
            details: {
              attempt: 2,
              reason: "WordPress returned 403",
              terminal: true,
            },
            created_at: "2026-08-10T09:30:00Z",
            suggestion_status: "failed",
            site_id: 7,
            site_name: "Editorial site",
            source_title: "Source article",
            target_title: "Target article",
            publish_error: "WordPress returned 403",
          },
        ],
      },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
}));

vi.mock("../api/traceability", () => ({
  getTraceEventsCsv: vi.fn(),
}));

beforeEach(() => {
  mocks.filters = {};
  mocks.copy.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.copy.mockResolvedValue(undefined) },
  });
});

afterEach(cleanup);

describe("TraceabilityPage", () => {
  it("shows full publication history and applies the audit filters", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.copy.mockResolvedValue(undefined) },
    });
    render(<TraceabilityPage />, { wrapper: MemoryRouter });

    expect(screen.getByText("Publishing error: WordPress returned 403")).not.toBeNull();
    await user.click(screen.getByText("Full event details"));
    expect(screen.getByText(/"attempt": 2/)).not.toBeNull();
    expect(screen.getByText(/"terminal": true/)).not.toBeNull();

    await user.type(screen.getByLabelText("Trace ID"), "trace-abc");
    await user.type(screen.getByLabelText("Actor"), "publication");
    await user.selectOptions(screen.getByLabelText("Event"), "publish_attempt_failed");
    await user.selectOptions(screen.getByLabelText("Current status"), "failed");
    await user.selectOptions(screen.getByLabelText("Site"), "7");
    await user.type(screen.getByLabelText("From"), "2026-08-01");
    await user.type(screen.getByLabelText("To"), "2026-08-10");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(mocks.filters).toMatchObject({
      trace_id: "trace-abc",
      actor: "publication",
      event_type: "publish_attempt_failed",
      status: "failed",
      site_id: 7,
    });
    expect(mocks.filters.date_from).toBe(
      new Date("2026-08-01T00:00:00").toISOString(),
    );
    expect(mocks.filters.date_to).toBe(
      new Date("2026-08-10T23:59:59.999").toISOString(),
    );

    await user.click(screen.getByRole("button", { name: "Copy trace ID" }));
    expect(mocks.copy).toHaveBeenCalledWith("trace-abc");
    expect(screen.getByRole("button", { name: "Copied" })).not.toBeNull();
  });

  it("still holds the audit filters after a trip to another page", async () => {
    // The shell the app renders: the provider outlives the route, the page does
    // not. Filling in seven fields and losing them to a look at the site they
    // name is the whole complaint this is here to keep fixed.
    function Shell() {
      const [onTrace, setOnTrace] = useState(true);
      return (
        <MemoryRouter>
          <PageStateProvider>
            <button type="button" onClick={() => setOnTrace((current) => !current)}>
              Switch page
            </button>
            {onTrace ? <TraceabilityPage /> : <p>Sites</p>}
          </PageStateProvider>
        </MemoryRouter>
      );
    }

    const user = userEvent.setup();
    render(<Shell />);

    await user.type(screen.getByLabelText("Trace ID"), "trace-abc");
    await user.selectOptions(screen.getByLabelText("Site"), "7");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(mocks.filters).toMatchObject({ trace_id: "trace-abc", site_id: 7 });

    await user.click(screen.getByRole("button", { name: "Switch page" }));
    expect(screen.queryByLabelText("Trace ID")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Switch page" }));

    expect(screen.getByLabelText<HTMLInputElement>("Trace ID").value).toBe("trace-abc");
    expect(screen.getByLabelText<HTMLSelectElement>("Site").value).toBe("7");
    // The applied filters come back too, so the results below them are the ones
    // that were being read rather than an unfiltered first page.
    expect(mocks.filters).toMatchObject({ trace_id: "trace-abc", site_id: 7 });
  });
});
