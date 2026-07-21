import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SitesPage from "./SitesPage";

const mocks = vi.hoisted(() => ({
  sites: {
    data: [] as unknown[],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => mocks.sites,
  useDeleteSite: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  Object.assign(mocks.sites, {
    data: [],
    isPending: false,
    isError: false,
    isFetching: false,
  });
});

afterEach(cleanup);

describe("SitesPage scheduler copy", () => {
  it("identifies RQ as the re-crawl scheduler", () => {
    render(<SitesPage />);

    expect(document.body.textContent).toContain("Scheduled re-crawls run through RQ.");
    expect(document.body.textContent?.toLowerCase()).not.toContain("celery");
  });

  it("does not expose unsupported future or fleet actions", () => {
    render(<SitesPage />);

    expect(document.body.textContent).not.toContain("GNN");
    expect(document.body.textContent).not.toContain("External links");
    expect(document.body.textContent).not.toContain("Generate anchors");
    expect(document.body.textContent).not.toContain("Crawl all");
    expect(document.body.textContent).not.toContain("Analyze all");
  });
});

describe("SitesPage load states", () => {
  it("tells a failed load apart from an empty account", () => {
    mocks.sites.isError = true;
    render(<SitesPage />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Your sites could not be loaded",
    );
    expect(document.body.textContent).not.toContain("No sites are connected yet");
  });

  it("offers a retry that refetches", () => {
    mocks.sites.isError = true;
    render(<SitesPage />);

    screen.getByRole("button", { name: "Try again" }).click();
    expect(mocks.sites.refetch).toHaveBeenCalled();
  });

  it("shows a placeholder instead of an empty list while loading", () => {
    mocks.sites.isPending = true;
    render(<SitesPage />);

    expect(screen.getByLabelText("Loading sites")).not.toBeNull();
    expect(document.body.textContent).not.toContain("No sites are connected yet");
  });

  it("invites a first site once the load succeeds with nothing", () => {
    render(<SitesPage />);

    expect(document.body.textContent).toContain("No sites are connected yet");
  });
});
