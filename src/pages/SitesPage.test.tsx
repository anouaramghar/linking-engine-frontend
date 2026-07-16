import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SitesPage from "./SitesPage";

vi.mock("../hooks/useSites", () => ({
  useSites: () => ({ data: [] }),
  useStats: () => ({ data: [] }),
  useDeleteSite: () => ({ mutate: vi.fn() }),
}));

afterEach(cleanup);

describe("SitesPage scheduler copy", () => {
  it("identifies RQ as the re-crawl scheduler", () => {
    render(<SitesPage />);

    expect(document.body.textContent).toContain("Scheduled re-crawls run through RQ.");
    expect(document.body.textContent?.toLowerCase()).not.toContain("celery");
  });
});
