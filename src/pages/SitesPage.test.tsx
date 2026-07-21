import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SitesPage from "./SitesPage";

vi.mock("../hooks/useSites", () => ({
  useSites: () => ({ data: [] }),
  useDeleteSite: () => ({ mutate: vi.fn() }),
}));

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
