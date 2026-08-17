import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExternalLinkPolicyModal from "./ExternalLinkPolicyModal";

const mocks = vi.hoisted(() => ({
  policy: {
    data: {
      site_id: 7,
      external_links_enabled: true,
      require_https: true,
      min_trust_score: 60,
      min_domain_age_days: 0,
      trusted_tlds: ["org"],
      allowlist_domains: ["wikipedia.org"],
      blocklist_domains: [],
      competitor_domains: [],
      owned_domain_protection: true as const,
      expired_suggestions: 0,
      updated_by: "editor",
      updated_at: "2026-08-06T09:00:00Z",
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  sources: {
    data: [{
      site_id: 11,
      site_name: "Wikipedia",
      domain: "wikipedia.org",
      trust_score: 100,
      eligible: true,
      eligible_articles: 12,
      blocked_articles: 1,
      reasons: [],
    }],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  update: { isPending: false, mutateAsync: vi.fn() },
  counts: {
    web_search: { pending: 4, approved: 3 },
    content_pool: { pending: 2, approved: 1 },
  } as Record<string, { pending: number; approved: number }>,
}));

vi.mock("../../hooks/useSites", () => ({
  useExternalLinkPolicy: () => mocks.policy,
  useExternalSourceEvaluations: () => mocks.sources,
  useUpdateExternalLinkPolicy: () => mocks.update,
}));

vi.mock("../../hooks/useSuggestions", () => ({
  useSuggestionCounts: (filters: { targetOrigin?: string }) => ({
    data: filters.targetOrigin ? mocks.counts[filters.targetOrigin] : undefined,
  }),
}));

const site = {
  id: 7,
  name: "Editorial",
  base_url: "https://editorial.example",
  platform: "wordpress" as const,
  crawl_frequency: "manual",
  suggestion_mode: "experimental" as const,
  suggestion_mode_managed: true,
  suggestion_comparison_enabled: false,
  suggestion_slots_available: 3,
  created_at: "2026-08-01T09:00:00Z",
  last_ingestion_status: null,
};

beforeEach(() => {
  mocks.update.isPending = false;
  mocks.update.mutateAsync.mockReset();
});

afterEach(cleanup);

describe("ExternalLinkPolicyModal", () => {
  it("explains hard guards and previews source trust", () => {
    render(<ExternalLinkPolicyModal site={site} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText(/Owned-domain protection is always on/)).not.toBeNull();
    expect((screen.getByRole("spinbutton", {
      name: /Minimum trust score/,
    }) as HTMLInputElement).value).toBe("60");
    expect(screen.getByText("Wikipedia")).not.toBeNull();
    expect(screen.getByText("100/100")).not.toBeNull();
    expect(document.body.textContent).toContain("12 eligible");
    expect(document.body.textContent).toContain("1 blocked");
  });

  it("saves normalized form-shaped policy values", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    mocks.update.mutateAsync.mockResolvedValue({ expired_suggestions: 2 });
    render(<ExternalLinkPolicyModal site={site} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: /Minimum trust score/ }), {
      target: { value: "75" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Competitor domains/ }), {
      target: { value: "competitor.example, rival.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Save and expire blocked suggestions" }),
    );
    await waitFor(() => expect(mocks.update.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        min_trust_score: 75,
        competitor_domains: ["competitor.example", "rival.example"],
      }),
    ));
    expect(onSaved).toHaveBeenCalledWith(
      "External link policy saved. 2 blocked suggestions expired.",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("names every tightening change and what it puts at risk before saving", () => {
    render(<ExternalLinkPolicyModal site={site} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Enable external suggestions/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Blocked domains/ }), {
      target: { value: "spam.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));

    const confirmation = screen.getByRole("alert");
    expect(confirmation.textContent).toContain("External suggestions are being turned off");
    expect(confirmation.textContent).toContain("Newly blocked: spam.example.");
    // 4 + 2 pending and 3 + 1 approved, across both outward target kinds.
    expect(confirmation.textContent).toContain("6 pending and 4 approved");
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled();
  });

  it("saves a loosened policy without a confirmation step", async () => {
    mocks.update.mutateAsync.mockResolvedValue({ expired_suggestions: 0 });
    render(<ExternalLinkPolicyModal site={site} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: /Minimum trust score/ }), {
      target: { value: "40" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));

    await waitFor(() => expect(mocks.update.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ min_trust_score: 40 }),
    ));
  });
});
