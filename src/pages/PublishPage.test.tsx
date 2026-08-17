import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicationPlan } from "../api/publish";
import PublishPage from "./PublishPage";

const SITE = {
  id: 1,
  name: "Example site",
  base_url: "https://example.com",
  platform: "wordpress",
  crawl_frequency: "daily",
  created_at: "2026-07-16T10:00:00Z",
  last_ingestion_status: "completed",
};

const SECOND_SITE = { ...SITE, id: 2, name: "Other site" };

const mocks = vi.hoisted(() => ({
  getPlanHtml: vi.fn(),
  prepareMutate: vi.fn(),
  prepareReset: vi.fn(),
  approveMutate: vi.fn(),
  queueMutate: vi.fn(),
  reviewMutate: vi.fn(),
  pendingPublication: [] as {
    site_id: number;
    selected_suggestions: number;
    approved_plans: number;
    can_publish?: boolean;
  }[],
  pendingSite: undefined as
    | {
        site_id: number;
        site_name: string;
        platform: string;
        selected_suggestions: number;
        approved_plans: number;
        can_publish?: boolean;
      }
    | undefined,
  /** What a preparation answers with, per site id. */
  preparedData: {} as Record<number, unknown>,
  prepareError: false,
  prepareJobId: null as string | null,
  prepareHookData: undefined as unknown,
  prepareHookError: false,
  sitesQuery: {} as Record<string, unknown>,
  pendingQuery: {} as Record<string, unknown>,
  activeSiteQuery: {} as Record<string, unknown>,
}));

vi.mock("../api/publish", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/publish")>();
  return { ...actual, getPublicationPlanHtml: mocks.getPlanHtml };
});

vi.mock("../hooks/useSites", () => ({
  useSites: () => ({
    data: [SITE, SECOND_SITE],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...mocks.sitesQuery,
  }),
}));

vi.mock("../hooks/usePublish", () => ({
  usePendingPublication: () => ({
    data: mocks.pendingPublication.map((site) => ({
      ...site,
      site_name: site.site_id === 1 ? SITE.name : SECOND_SITE.name,
      platform: "wordpress",
    })),
    totalSites: mocks.pendingPublication.length,
    totalSelectedSuggestions: mocks.pendingPublication.reduce(
      (total, site) => total + site.selected_suggestions,
      0,
    ),
    totalApprovedPlans: mocks.pendingPublication.reduce(
      (total, site) => total + site.approved_plans,
      0,
    ),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...mocks.pendingQuery,
  }),
  usePendingPublicationSite: (siteId: number | null) => ({
    data:
      siteId === null
        ? undefined
        : mocks.pendingSite?.site_id === siteId
          ? mocks.pendingSite
        : (() => {
            const pending = mocks.pendingPublication.find((site) => site.site_id === siteId);
            if (!pending) return undefined;
            return {
              ...pending,
              site_name: siteId === 1 ? SITE.name : SECOND_SITE.name,
              platform: "wordpress",
            };
          })(),
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...mocks.activeSiteQuery,
  }),
  usePreparePublicationPlans: () => ({
    data: mocks.prepareHookData,
    jobId: mocks.prepareJobId,
    progress: null,
    isPending: false,
    isError: mocks.prepareHookError,
    mutate: mocks.prepareMutate,
    reset: mocks.prepareReset,
  }),
  useApprovePlans: () => ({ mutate: mocks.approveMutate, isPending: false }),
  useQueueApprovedPlans: () => ({ mutate: mocks.queueMutate, isPending: false }),
}));

vi.mock("../hooks/useSuggestions", () => ({
  useReview: () => ({ mutate: mocks.reviewMutate, isPending: false }),
}));

// The bytes never travel on the plan itself; advanced review fetches them.
const PLAN_HTML = {
  original_html: "<p>solar panel costs</p>",
  updated_html: '<p><a href="/target">solar panel</a> costs</p>',
};

const PLAN: PublicationPlan = {
  id: 55,
  status: "prepared" as const,
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
      outcome: "inserted" as const,
    },
  ],
};

const SECOND_PLAN = {
  ...PLAN,
  id: 56,
  plan_hash: "b".repeat(64),
  source_article_id: 11,
  source_url: "https://example.com/other-source",
  links: [{ ...PLAN.links[0], suggestion_id: 2 }],
};

const preparedFor = (
  site: number,
  overrides: Record<string, unknown> = {},
  plans = [PLAN],
) => {
  const selectedSuggestions =
    typeof overrides.selected_suggestions === "number" ? overrides.selected_suggestions : 1;
  mocks.pendingPublication = [
    ...mocks.pendingPublication.filter((entry) => entry.site_id !== site),
    { site_id: site, selected_suggestions: selectedSuggestions, approved_plans: 0 },
  ];
  mocks.preparedData[site] = {
    site_id: site,
    selected_suggestions: 1,
    plans,
    errors: [],
    has_more: false,
    ...overrides,
  };
};

/**
 * Approval has its own address, so a test enters it the way an operator does:
 * by visiting the site's URL. The queue route is mounted so that "back to the
 * queue" is a real destination rather than a dead link.
 */
const renderPublish = (entry = "/publish/1") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/queue" element={<div>Review queue</div>} />
        <Route path="/publish" element={<PublishPage />} />
        <Route path="/publish/:siteId" element={<PublishPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.prepareMutate.mockReset();
  mocks.prepareReset.mockReset();
  mocks.approveMutate.mockReset();
  mocks.queueMutate.mockReset();
  mocks.reviewMutate.mockReset();
  mocks.getPlanHtml.mockReset();
  mocks.pendingPublication = [];
  mocks.pendingSite = undefined;
  mocks.preparedData = {};
  mocks.prepareError = false;
  mocks.prepareJobId = null;
  mocks.prepareHookData = undefined;
  mocks.prepareHookError = false;
  mocks.sitesQuery = {};
  mocks.pendingQuery = {};
  mocks.activeSiteQuery = {};
  mocks.getPlanHtml.mockResolvedValue({
    id: PLAN.id,
    plan_hash: PLAN.plan_hash,
    ...PLAN_HTML,
  });
  // The real mutation answers through its callbacks, and the page stores what
  // it is handed — one preparation per site.
  mocks.prepareMutate.mockImplementation((siteId: number, options) => {
    if (mocks.prepareError) {
      options?.onError?.(new Error("wordpress is down"));
      return;
    }
    options?.onSuccess?.(mocks.preparedData[siteId]);
  });
  mocks.reviewMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
});

afterEach(cleanup);

describe("PublishPage site list", () => {
  it("says there is nothing to approve and sends the operator back to the queue", () => {
    renderPublish("/publish");

    expect(document.body.textContent).toContain("Nothing is waiting for review");
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
  });

  it("lists each site holding selected links, without preparing any of them", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 4, approved_plans: 0 },
      { site_id: 2, selected_suggestions: 9, approved_plans: 0 },
    ];
    renderPublish("/publish");

    expect(document.body.textContent).toContain("Example site");
    expect(document.body.textContent).toContain("4 links selected");
    expect(document.body.textContent).toContain("9 links selected");
    expect(
      screen.getByRole("searchbox", { name: "Search sites waiting for publication review" })
        .className,
    ).toContain("field");
    // Reading the live articles costs a request per source article, so it waits
    // for the operator to choose a site.
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
  });

  it("marks exact-edit review as required", () => {
    preparedFor(1);
    renderPublish("/publish");

    expect(document.body.textContent).toContain("Required");
    expect(document.body.textContent).toContain("Exact edits are shown before approval");
    expect(document.body.textContent).not.toContain("Optional");
  });

  it("offers no review for a site with no WordPress account", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 3, approved_plans: 0, can_publish: false },
    ];
    renderPublish("/publish");

    expect(screen.queryByRole("link", { name: "Review exact edits" })).toBeNull();
    expect(document.body.textContent).toContain("No WordPress account is connected");
  });

  it("keeps one preparation per site, and says which sites are read", async () => {
    const user = userEvent.setup();
    preparedFor(1);
    preparedFor(2);
    renderPublish("/publish/1");

    expect(mocks.prepareMutate).toHaveBeenCalledTimes(1);
    await screen.findByText(PLAN.source_url);
    await user.click(screen.getByRole("link", { name: "All sites waiting" }));
    expect(document.body.textContent).toContain("Prepared");

    await user.click(screen.getAllByRole("link", { name: "Back to the edits" })[0]);

    // Reading the live articles a second time for a site already read is the
    // cost this cache exists to refuse.
    expect(mocks.prepareMutate).toHaveBeenCalledTimes(1);
    await screen.findByText(PLAN.source_url);
  });

  it("keeps the ticks of a site the operator walked away from", async () => {
    const user = userEvent.setup();
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    preparedFor(2);
    renderPublish("/publish/1");

    await user.click(
      await screen.findByRole("checkbox", {
        name: `Include the edit to ${SECOND_PLAN.source_url} in approval`,
      }),
    );
    await user.click(screen.getByRole("link", { name: "All sites waiting" }));
    await user.click(screen.getAllByRole("link", { name: "Back to the edits" })[0]);

    await screen.findByText("1 of 2 selected");
  });

  it("prepares the next site after the previous site's job finished", async () => {
    const user = userEvent.setup();
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 2, approved_plans: 0 },
      { site_id: 2, selected_suggestions: 1, approved_plans: 0 },
    ];
    mocks.prepareJobId = "prepare-1";
    mocks.prepareHookData = {
      site_id: 1,
      selected_suggestions: 2,
      plans: [PLAN],
      errors: [],
      has_more: false,
    };
    mocks.prepareMutate.mockImplementation(() => undefined);
    renderPublish("/publish/1?job=prepare-1");

    await user.click(screen.getByRole("link", { name: "All sites waiting" }));
    await user.click(screen.getAllByRole("link", { name: "Review exact edits" })[1]);

    expect(mocks.prepareMutate).toHaveBeenCalledWith(2, expect.anything());
  });

  it("does not prepare a site that holds nothing", () => {
    renderPublish("/publish/1");

    expect(document.body.textContent).toContain("no links waiting for review");
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
  });
});

/** One more article for a batch, distinct in every field a test reads. */
const extraPlan = (n: number): PublicationPlan => ({
  ...PLAN,
  id: 60 + n,
  plan_hash: String(n % 10).repeat(64),
  source_article_id: 20 + n,
  source_url: `https://example.com/source-${n}`,
  links: [{ ...PLAN.links[0], suggestion_id: 100 + n }],
});

/** One pane of the exact-HTML diff, line by line, as the operator reads it. */
const codeLines = (label: string) =>
  Array.from(
    screen.getByRole("region", { name: `${label} HTML code` }).querySelectorAll("code"),
  ).map((node) => node.textContent);

/** The lit part of that pane — what this approval writes, and nothing else. */
const marked = (label: string) =>
  Array.from(
    screen
      .getByRole("region", { name: `${label} HTML code` })
      .querySelectorAll('[class*="bg-success/25"], [class*="bg-error/25"]'),
  )
    .map((node) => node.textContent)
    .join("");

const readEveryChange = async (user: ReturnType<typeof userEvent.setup>) => {
  let next = screen.queryByRole("button", { name: "Read the next change" });
  while (next) {
    await user.click(next);
    next = screen.queryByRole("button", { name: "Read the next change" });
  }
};

describe("PublishPage approval", () => {
  // jsdom implements no layout, so it ships no scrollIntoView.
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("requires an explicit review action before approval", () => {
    preparedFor(1, {}, [PLAN, extraPlan(1), extraPlan(2), extraPlan(3)]);
    renderPublish();

    expect(document.body.textContent).toContain("0 of 4 read");
    expect(screen.getAllByRole("button", { name: "Show the change" })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Read the next change" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Approve and queue 4 exact edits" })).toBeNull();
    expect(mocks.approveMutate).not.toHaveBeenCalled();
  });

  it("reviews one selected article at a time", async () => {
    const user = userEvent.setup();
    preparedFor(1, {}, [PLAN, SECOND_PLAN, extraPlan(1)]);
    renderPublish();

    await user.click(screen.getByRole("button", { name: "Read the next change" }));

    expect(document.body.textContent).toContain("1 of 3 read");
    expect(screen.getByRole("button", { name: "Read the next change" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Hide the change" })).not.toBeNull();
  });

  it("does not expose approval for a single article until it is opened", async () => {
    preparedFor(1);
    renderPublish();

    expect(document.body.textContent).toContain("0 of 1 read");
    expect(screen.queryByRole("button", { name: "Approve and queue 1 exact edit" })).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Show the change" }));
    expect(screen.getByRole("button", { name: "Approve and queue 1 exact edit" })).not.toBeNull();
  });

  it("scrolls to the article opened by Read the next change", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    renderPublish();

    await user.click(screen.getByRole("button", { name: "Read the next change" }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("1 of 2 read");
  });

  it("keeps a reviewed article reviewed after it is closed", async () => {
    const user = userEvent.setup();
    preparedFor(1);
    renderPublish();

    await user.click(screen.getByRole("button", { name: "Show the change" }));
    await user.click(screen.getByRole("button", { name: "Hide the change" }));
    expect(document.body.textContent).toContain("Exact artifact reviewed");
    expect(screen.getByRole("button", { name: "Approve and queue 1 exact edit" })).not.toBeNull();
  });

  it("keeps selection separate from the reviewed changes", async () => {
    const user = userEvent.setup();
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    renderPublish();

    await readEveryChange(user);

    const box = screen.getByRole("checkbox", {
      name: `Include the edit to ${SECOND_PLAN.source_url} in approval`,
    });

    await user.click(box);

    expect(
      screen
        .getByRole("button", { name: "Approve and queue 1 exact edit" })
        .hasAttribute("disabled"),
    ).toBe(false);

    await user.click(box);

    expect(screen.getByRole("button", { name: "Approve and queue 2 exact edits" })).not.toBeNull();
  });

  it("calls the review step required, never recommended", () => {
    preparedFor(1);
    renderPublish();

    expect(document.body.textContent).toContain("Review exact edits");
    expect(document.body.textContent).not.toContain("recommended");
  });

  it("approves without anyone opening the raw HTML", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    preparedFor(1);
    renderPublish();

    await readEveryChange(user);
    await user.click(screen.getByRole("button", { name: "Approve and queue 1 exact edit" }));

    // The human-readable change is the required surface. Raw before/after HTML
    // is an advanced tool, and no approval may depend on reading it.
    expect(mocks.getPlanHtml).not.toHaveBeenCalled();
    expect(mocks.approveMutate).toHaveBeenCalled();
  });

  it("reviews a site beyond the fleet list without loading the first thousand sites", () => {
    mocks.pendingSite = {
      site_id: 1001,
      site_name: "Site one thousand and one",
      platform: "wordpress",
      selected_suggestions: 2,
      approved_plans: 0,
    };
    mocks.preparedData[1001] = {
      site_id: 1001,
      selected_suggestions: 2,
      plans: [PLAN],
      errors: [],
      has_more: false,
    };

    renderPublish("/publish/1001");

    expect(document.body.textContent).toContain("Site one thousand and one");
    expect(mocks.prepareMutate).toHaveBeenCalledWith(1001, expect.anything());
  });

  it("prepares the site named in the address, once", () => {
    preparedFor(1);
    renderPublish("/publish/1");

    expect(mocks.prepareMutate).toHaveBeenCalledWith(1, expect.anything());
    expect(mocks.prepareMutate).toHaveBeenCalledTimes(1);
  });

  /**
   * "Review exact edit" on one queue row asks about one link, and the scope has
   * to reach the engine. A plan's hash covers a whole source article, so an
   * article holding three selected links is one artifact that publishes all
   * three: hiding two rows in the dashboard would narrow the page and not the
   * approval.
   */
  it("asks the engine to prepare only the named link", () => {
    preparedFor(1, { selected_suggestions: 2 }, [SECOND_PLAN]);
    renderPublish("/publish/1?suggestion=2");

    expect(mocks.prepareMutate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ suggestionIds: [2] }),
    );
  });

  it("prepares the whole site when the address names no link", () => {
    preparedFor(1);
    renderPublish("/publish/1");

    expect(mocks.prepareMutate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ suggestionIds: undefined }),
    );
  });

  /**
   * One preparation runs per site at a time, so a request naming a link can be
   * joined to a batch job already running for that site. What comes back is
   * then wider than what was asked for, and only the named link may be put in
   * front of the operator as their review.
   */
  it("shows only the named link's article when a wider batch comes back", () => {
    preparedFor(1, { selected_suggestions: 2 }, [PLAN, SECOND_PLAN]);
    renderPublish("/publish/1?suggestion=2");

    expect(
      (screen.getByRole("checkbox", {
        name: `Include the edit to ${SECOND_PLAN.source_url} in approval`,
      }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      screen.queryByRole("checkbox", {
        name: `Include the edit to ${PLAN.source_url} in approval`,
      }),
    ).toBeNull();
    expect(document.body.textContent).toContain("This review is for one link");
  });

  it("reads the site's whole batch only when the operator asks for it", async () => {
    const user = userEvent.setup();
    preparedFor(1, { selected_suggestions: 3 }, [SECOND_PLAN]);
    renderPublish("/publish/1?suggestion=2");

    expect(document.body.textContent).toContain(
      "2 selected links on this site are outside this review",
    );
    await user.click(screen.getByRole("button", { name: "Review every selected link" }));

    // The other articles were never read, so widening the review is a fresh
    // preparation and a fresh set of live requests — not a filter being lifted.
    expect(mocks.prepareMutate).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ suggestionIds: undefined }),
    );
  });

  /**
   * The engine renders one link per artifact when asked, so this only happens
   * on the joined-batch path above. It still has to be said: a plan's hash
   * covers the whole article, and approving it publishes every link in it.
   */
  it("says which other links go live with a one-link review", () => {
    preparedFor(1, {}, [
      {
        ...PLAN,
        links: [
          PLAN.links[0],
          { ...PLAN.links[0], position: 1, suggestion_id: 7, target_url: "https://example.com/second" },
        ],
      },
    ]);
    renderPublish("/publish/1?suggestion=7");

    expect(document.body.textContent).toContain(
      "Approving this article also publishes 1 other selected link",
    );
  });

  it("explains a named link that could not be prepared", () => {
    preparedFor(1, { selected_suggestions: 2 }, [PLAN]);
    renderPublish("/publish/1?suggestion=999");

    // An empty page claiming to be about a link explains nothing.
    expect(document.body.textContent).toContain("That link was not prepared");
    expect(
      screen.getByRole("checkbox", {
        name: `Include the edit to ${PLAN.source_url} in approval`,
      }),
    ).toBeTruthy();
  });

  it("loads exact WordPress HTML only when advanced review asks for it", async () => {
    preparedFor(1);
    renderPublish();

    const exactHtmlToggle = screen.getByTitle("View exact HTML (advanced)");
    expect(exactHtmlToggle.className).toContain("border-hairline-control");
    expect(exactHtmlToggle.className).toContain("ml-auto");
    expect(exactHtmlToggle.querySelector("svg")).not.toBeNull();
    expect(document.body.textContent).not.toContain("View exact HTML (advanced)");
    expect(mocks.getPlanHtml).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(exactHtmlToggle);

    await screen.findByRole("region", { name: "Before approval HTML code" });
    expect(codeLines("Before approval")).toEqual(["<p>solar panel costs</p>"]);
    expect(codeLines("After approval")).toEqual([
      '<p><a href="/target">solar panel</a> costs</p>',
    ]);
    expect(screen.getAllByText("HTML · read-only")).toHaveLength(2);
    expect(mocks.getPlanHtml).toHaveBeenCalledWith(1, 55);
    expect(document.body.textContent).not.toContain(PLAN.plan_hash.slice(0, 12));
  });

  /**
   * A page of markup with a dozen changed characters in it is not reviewable by
   * eye. What the approval writes has to be lit, and only that: a mark that
   * covered the whole line would be as good as no mark at all.
   */
  it("marks the exact anchor the approval writes", async () => {
    preparedFor(1);
    renderPublish();

    const user = userEvent.setup();
    await user.click(screen.getByTitle("View exact HTML (advanced)"));
    await screen.findByRole("region", { name: "After approval HTML code" });

    expect(marked("After approval")).toBe('<a href="/target">solar panel</a>');
    expect(marked("Before approval")).toBe("solar panel");
    // The count is the same claim in numbers, for the reviewer who only skims.
    expect(document.body.textContent).toContain("+1");
    expect(document.body.textContent).toContain("−1");
  });

  it("preserves HTML indentation in the code panes", async () => {
    const originalHtml = "<article>\n  <p>solar panel costs</p>\n</article>";
    const updatedHtml =
      '<article>\n  <p><a href="/target">solar panel</a> costs</p>\n</article>';
    mocks.getPlanHtml.mockResolvedValue({
      id: PLAN.id,
      plan_hash: PLAN.plan_hash,
      original_html: originalHtml,
      updated_html: updatedHtml,
    });
    preparedFor(1);
    renderPublish();

    const user = userEvent.setup();
    await user.click(screen.getByTitle("View exact HTML (advanced)"));

    await screen.findByRole("region", { name: "Before approval HTML code" });
    expect(codeLines("Before approval")).toEqual(originalHtml.split("\n"));
    expect(codeLines("After approval")).toEqual(updatedHtml.split("\n"));
  });

  it("never says the content may still change after approval", () => {
    preparedFor(1);
    renderPublish();

    expect(document.body.textContent).not.toMatch(/may (still )?change/i);
    expect(document.body.textContent).not.toContain("before publication");
  });

  it("sends only the displayed plans and hashes, then queues them", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    preparedFor(1);
    renderPublish();

    await readEveryChange(user);
    await user.click(screen.getByRole("button", { name: /^Approve and queue 1 exact edit$/ }));

    expect(mocks.approveMutate).toHaveBeenCalledWith(
      { siteId: 1, plans: [{ id: 55, plan_hash: PLAN.plan_hash }] },
      expect.anything(),
    );
    expect(mocks.queueMutate).toHaveBeenCalledWith(
      { siteId: 1, planIds: [55] },
      expect.anything(),
    );
  });

  it("approves only the article a one-link review named", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    preparedFor(1, { selected_suggestions: 2 }, [PLAN, SECOND_PLAN]);
    renderPublish("/publish/1?suggestion=2");

    await readEveryChange(user);
    await user.click(screen.getByRole("button", { name: /^Approve and queue 1 exact edit$/ }));

    // The article the operator never saw is as absent from the request as an
    // unticked one: a narrowed view must narrow the decision as well.
    expect(mocks.approveMutate).toHaveBeenCalledWith(
      { siteId: 1, plans: [{ id: SECOND_PLAN.id, plan_hash: SECOND_PLAN.plan_hash }] },
      expect.anything(),
    );
    expect(mocks.queueMutate).toHaveBeenCalledWith(
      { siteId: 1, planIds: [SECOND_PLAN.id] },
      expect.anything(),
    );
  });

  it("confirms the queued job where the operator is standing", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    mocks.queueMutate.mockImplementation((_variables, options) => {
      // Queueing spends the batch, so the site leaves the pending list on the
      // refetch the mutation sets off. The confirmation has to survive that.
      mocks.pendingPublication = [];
      options?.onSuccess?.();
    });
    preparedFor(1);
    renderPublish();

    await readEveryChange(user);
    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    expect(document.body.textContent).toContain("The publish job is queued");
    // The batch is spent, so the approval control must not still be offered.
    expect(screen.queryByRole("button", { name: /^Approve and queue/ })).toBeNull();
  });

  it("does not queue anything when the approval fails", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) =>
      options?.onError?.(new Error("nope")),
    );
    preparedFor(1);
    renderPublish();

    await readEveryChange(user);
    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    expect(mocks.queueMutate).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("nothing was published");
  });

  it("shows a refused approval in place, with the way to read the new version", async () => {
    const user = userEvent.setup();
    const conflict = { response: { status: 409 } };
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onError?.(conflict));
    preparedFor(1);
    renderPublish();

    await readEveryChange(user);
    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    // This message used to be written to the queue page underneath a modal,
    // where the operator could not see it at all.
    expect(document.body.textContent).toContain("Nothing was approved");
    mocks.prepareMutate.mockClear();
    await user.click(screen.getByRole("button", { name: "Reload the review" }));

    expect(mocks.prepareMutate).toHaveBeenCalledWith(1, expect.anything());
  });

  it("keeps an approved-but-not-queued batch truthful and retryable", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    mocks.queueMutate.mockImplementation((_variables, options) =>
      options?.onError?.(new Error("redis is down")),
    );
    preparedFor(1);
    renderPublish();

    await readEveryChange(user);
    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    expect(document.body.textContent).toContain("approved but not queued");
    // The retry queues only; it must not ask for the same approval twice.
    mocks.approveMutate.mockClear();
    mocks.queueMutate.mockClear();
    await user.click(screen.getByRole("button", { name: "Queue approved edits" }));

    expect(mocks.approveMutate).not.toHaveBeenCalled();
    expect(mocks.queueMutate).toHaveBeenCalledWith(
      { siteId: 1, planIds: [55] },
      expect.anything(),
    );
  });

  it("cannot approve more than what is on screen, whatever else remains", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    preparedFor(1, {
      has_more: true,
      errors: [
        {
          source_article_id: 99,
          source_url: "https://example.com/broken",
          message: "post is gone",
        },
      ],
    });
    renderPublish();

    await readEveryChange(user);
    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    // One plan was shown; `has_more` and the failed source describe work that is
    // explicitly not in this request.
    expect(mocks.approveMutate).toHaveBeenCalledWith(
      { siteId: 1, plans: [{ id: 55, plan_hash: PLAN.plan_hash }] },
      expect.anything(),
    );
    expect(document.body.textContent).toContain("left out of this batch");
  });

  it("ticks every prepared article, so nothing but reading stands in the way", async () => {
    const user = userEvent.setup();
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    renderPublish();

    expect(document.body.textContent).toContain("2 of 2 selected");
    await readEveryChange(user);

    expect(
      screen.getByRole("button", { name: /^Approve and queue 2 exact edits$/ }),
    ).not.toBeNull();
  });

  it("approves only the articles left ticked, and says what it held back", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    renderPublish();

    await readEveryChange(user);
    await user.click(
      screen.getByRole("checkbox", {
        name: `Include the edit to ${SECOND_PLAN.source_url} in approval`,
      }),
    );

    expect(document.body.textContent).toContain("1 article stays unpublished");
    await user.click(screen.getByRole("button", { name: /^Approve and queue 1 exact edit$/ }));

    // The unticked article is as absent from the request as a failed source is.
    expect(mocks.approveMutate).toHaveBeenCalledWith(
      { siteId: 1, plans: [{ id: 55, plan_hash: PLAN.plan_hash }] },
      expect.anything(),
    );
    expect(mocks.queueMutate).toHaveBeenCalledWith(
      { siteId: 1, planIds: [55] },
      expect.anything(),
    );
  });

  it("cannot approve when every article is unticked", async () => {
    const user = userEvent.setup();
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    renderPublish();

    await user.click(screen.getByRole("checkbox", { name: "Select all prepared articles" }));

    expect(
      screen.getByRole("button", { name: /^Approve and queue 0 exact edits$/ }),
    ).toHaveProperty("disabled", true);
    expect(mocks.approveMutate).not.toHaveBeenCalled();
  });

  it("retries the queue with the subset that was approved, not the whole batch", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    mocks.queueMutate.mockImplementation((_variables, options) =>
      options?.onError?.(new Error("redis is down")),
    );
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    renderPublish();

    await readEveryChange(user);
    await user.click(
      screen.getByRole("checkbox", {
        name: `Include the edit to ${SECOND_PLAN.source_url} in approval`,
      }),
    );
    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    mocks.queueMutate.mockClear();
    await user.click(screen.getByRole("button", { name: "Queue approved edits" }));

    // Plan 56 was never approved, so naming it in the retry would be a 409 and
    // the operator would be stuck with an approval they could not queue.
    expect(mocks.queueMutate).toHaveBeenCalledWith(
      { siteId: 1, planIds: [55] },
      expect.anything(),
    );
  });

  it("shows the change as the sentence it lands in, not only as HTML", async () => {
    const user = userEvent.setup();
    preparedFor(1);
    renderPublish();
    await user.click(screen.getByRole("button", { name: "Show the change" }));

    // The prepared passage gives the operator readable context; the exact HTML
    // view below remains the authoritative artifact for approval.
    expect(document.body.textContent).toContain("solar panel costs");
    expect(screen.getByText("solar panel").tagName).toBe("MARK");
    expect(document.body.textContent).toContain(
      "The marked words become the link. The wording of the article does not change.",
    );
  });

  it("describes a Read also block as an end-of-article placement", async () => {
    const user = userEvent.setup();
    const blockPlan: PublicationPlan = {
      ...PLAN,
      links: [{ ...PLAN.links[0], outcome: "block" }],
    };
    preparedFor(1, {}, [blockPlan]);
    renderPublish();

    expect(document.body.textContent).toContain("at end of article");
    expect(document.body.textContent).not.toContain('on “solar panel”');

    await user.click(screen.getByRole("button", { name: "Show the change" }));

    expect(document.querySelector("mark")).toBeNull();
    expect(document.body.textContent).toContain(
      "An in-text placement was not available, so this link is added to the Read also block at the end of the article.",
    );
    expect(document.body.textContent).not.toContain(
      "The marked words become the link. The wording of the article does not change.",
    );
  });

  it("prints a link once, not in a summary list and again in a change panel", () => {
    preparedFor(1);
    renderPublish();

    // An open article used to write its target twice — once in a summary list
    // and once in the change panel — so a batch of ten said everything twice.
    expect(screen.getAllByText(PLAN.links[0].target_url)).toHaveLength(1);
  });

  it("counts a link the article already carries apart from the ones it writes", () => {
    preparedFor(1, {}, [
      {
        ...PLAN,
        links: [
          PLAN.links[0],
          {
            position: 1,
            suggestion_id: 2,
            target_url: "https://example.com/known",
            anchor_text: null,
            outcome: "already_present" as const,
          },
        ],
      },
    ]);
    renderPublish();

    // An already-present link writes nothing, so counting it as an edit would
    // promise more change than the job delivers.
    expect(document.body.textContent).toContain("Already present");
    expect(document.body.textContent).toContain("1 link to write · 1 already present");
  });

  it("keeps a change readable when the passage cannot be located", async () => {
    const user = userEvent.setup();
    preparedFor(1, {}, [
      { ...PLAN, links: [{ ...PLAN.links[0], placement_context: undefined }] },
    ]);
    renderPublish();
    await user.click(screen.getByRole("button", { name: "Show the change" }));

    expect(document.body.textContent).toContain(
      'A link to https://example.com/target is added on "solar panel"',
    );
  });

  it("requires opening every article in a larger batch", async () => {
    const user = userEvent.setup();
    const plans = [1, 2, 3, 4].map((offset) => ({
      ...PLAN,
      id: 60 + offset,
      source_url: `https://example.com/source-${offset}`,
      links: [{ ...PLAN.links[0], suggestion_id: offset }],
    }));
    preparedFor(1, {}, plans);
    renderPublish();

    expect(screen.getAllByRole("button", { name: "Show the change" })).toHaveLength(4);
    await readEveryChange(user);
    expect(document.body.textContent).toContain("4 of 4 read");
    expect(screen.getByRole("button", { name: "Approve and queue 4 exact edits" })).not.toBeNull();
  });

  it("keeps unopened changes from being treated as reviewed", () => {
    preparedFor(1, {}, [PLAN, SECOND_PLAN, { ...PLAN, id: 57 }, { ...PLAN, id: 58 }]);
    renderPublish();

    expect(document.body.textContent).toContain("0 of 4 read");
    expect(screen.queryByRole("button", { name: "Approve and queue 4 exact edits" })).toBeNull();
  });

  it("returns one link to the queue and prepares the article again", async () => {
    const user = userEvent.setup();
    preparedFor(1, { selected_suggestions: 2 }, [PLAN, SECOND_PLAN]);
    renderPublish();

    mocks.prepareMutate.mockClear();
    await user.click(
      screen.getByRole("button", {
        name: `Remove the link to ${PLAN.links[0].target_url} from ${PLAN.source_url} and return it to the queue`,
      }),
    );

    // A plan's hash covers the whole article, so the link cannot be dropped from
    // the approval on its own: it goes back to pending and the article is
    // rendered again without it.
    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      { id: 1, status: "pending" },
      expect.anything(),
    );
    expect(mocks.prepareMutate).toHaveBeenCalledWith(1, expect.anything());
    expect(document.body.textContent).toContain("went back to the review queue");
  });

  it("returns a focused link to the queue without preparing it again", async () => {
    const user = userEvent.setup();
    preparedFor(1);
    renderPublish("/publish/1?suggestion=1");

    mocks.prepareMutate.mockClear();
    await user.click(
      screen.getByRole("button", {
        name: `Remove the link to ${PLAN.links[0].target_url} from ${PLAN.source_url} and return it to the queue`,
      }),
    );

    expect(mocks.prepareMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Review queue")).not.toBeNull();
  });

  it("treats an empty site after removing its last batch link as success", async () => {
    const user = userEvent.setup();
    mocks.reviewMutate.mockImplementation((_variables, options) => {
      mocks.pendingPublication = [];
      mocks.activeSiteQuery = {
        error: { response: { status: 404 } },
        isError: true,
      };
      options?.onSuccess?.();
    });
    preparedFor(1);
    renderPublish();

    mocks.prepareMutate.mockClear();
    await user.click(screen.getByRole("button", { name: /^Remove the link/ }));

    expect(mocks.prepareMutate).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("went back to the review queue");
    expect(document.body.textContent).toContain("This site has no links waiting for review");
    expect(document.body.textContent).not.toContain("The review could not be loaded");
  });

  it("says a link is already publishing rather than removing it", async () => {
    const user = userEvent.setup();
    mocks.reviewMutate.mockImplementation((_variables, options) =>
      options?.onError?.({ response: { status: 409 } }),
    );
    preparedFor(1);
    renderPublish();

    mocks.prepareMutate.mockClear();
    await user.click(screen.getByRole("button", { name: /^Remove the link/ }));

    expect(document.body.textContent).toContain("already publishing");
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
  });

  it("reports a failed load without pretending an article changed", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 2, approved_plans: 0 },
    ];
    mocks.prepareError = true;
    renderPublish();

    expect(document.body.textContent).toContain("The edits could not be prepared");
    expect(document.body.textContent).toContain("No article was changed");
  });

  it("shows retry when the preparation status cannot be read", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 2, approved_plans: 0 },
    ];
    mocks.prepareJobId = "prepare-1";
    mocks.prepareHookError = true;
    renderPublish("/publish/1?job=prepare-1");

    expect(document.body.textContent).toContain("The edits could not be prepared");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows a finished preparation even when its callback was lost", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 2, approved_plans: 0 },
    ];
    mocks.prepareHookData = {
      site_id: 1,
      selected_suggestions: 2,
      plans: [PLAN],
      errors: [],
      has_more: false,
    };
    mocks.prepareMutate.mockImplementation(() => undefined);

    renderPublish();

    expect(screen.queryByLabelText("Preparing the exact edits")).toBeNull();
    expect(screen.queryByText("Change reviewed")).toBeNull();
  });
});

/**
 * An approval is written to the database, so it outlives the tab that made it.
 * These tests enter the page the way a reload or a second browser does: with no
 * session state at all, and only the server's counts to go on.
 */
describe("PublishPage approved-plan recovery", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  const approvedOnly = (count = 2) => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 0, approved_plans: count },
    ];
  };

  it("does not prepare a site whose only pending work is already approved", () => {
    approvedOnly();
    renderPublish("/publish/1");

    // Preparation renders new editorial intent. There is none here, and asking
    // spends a live request per article to arrive at an empty review.
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("The edits could not be prepared");
    expect(document.body.textContent).not.toContain("There are no edits ready to approve");
  });

  it("offers the queue action on a fresh visit, with no session state behind it", () => {
    approvedOnly();
    renderPublish("/publish/1");

    expect(document.body.textContent).toContain(
      "2 exact edits already approved and waiting to be queued",
    );
    expect(screen.getByRole("button", { name: "Queue approved exact edits" })).not.toBeNull();
  });

  it("recovers by naming no plan ids, which is the documented site-wide path", async () => {
    const user = userEvent.setup();
    approvedOnly(1);
    renderPublish("/publish/1");

    await user.click(screen.getByRole("button", { name: "Queue approved exact edits" }));

    // This browser never saw the approval, so a guessed id list would be a 409
    // on every plan it got wrong.
    expect(mocks.queueMutate.mock.calls[0][0]).toStrictEqual({
      siteId: 1,
      planIds: undefined,
    });
    expect(mocks.approveMutate).not.toHaveBeenCalled();
  });

  it("shows the queued confirmation once the recovery job starts", async () => {
    const user = userEvent.setup();
    mocks.queueMutate.mockImplementation((_variables, options) => {
      mocks.pendingPublication = [];
      options?.onSuccess?.();
    });
    approvedOnly(1);
    renderPublish("/publish/1");

    await user.click(screen.getByRole("button", { name: "Queue approved exact edits" }));

    expect(document.body.textContent).toContain("The publish job is queued");
  });

  it("keeps a way back when the recovery request fails", async () => {
    const user = userEvent.setup();
    mocks.queueMutate.mockImplementation((_variables, options) =>
      options?.onError?.(new Error("redis is down")),
    );
    approvedOnly(1);
    renderPublish("/publish/1");

    await user.click(screen.getByRole("button", { name: "Queue approved exact edits" }));

    expect(document.body.textContent).toContain("could not be started");
    expect(document.body.textContent).not.toContain("The publish job is queued");
    expect(screen.getByRole("button", { name: "Queue approved exact edits" })).not.toBeNull();
  });

  it("calls a queue conflict a conflict rather than a success", async () => {
    const user = userEvent.setup();
    mocks.queueMutate.mockImplementation((_variables, options) =>
      options?.onError?.({ response: { status: 409 } }),
    );
    approvedOnly(1);
    renderPublish("/publish/1");

    await user.click(screen.getByRole("button", { name: "Queue approved exact edits" }));

    expect(document.body.textContent).toContain("already publishing");
    expect(document.body.textContent).not.toContain("The publish job is queued");
  });

  it("keeps approved edits and newly selected links as separate work", async () => {
    const user = userEvent.setup();
    preparedFor(1);
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 1, approved_plans: 3 },
    ];
    renderPublish("/publish/1");

    // Both paths are on screen, and neither one claims the other's work.
    expect(mocks.prepareMutate).toHaveBeenCalledWith(1, expect.anything());
    expect(document.body.textContent).toContain(
      "3 exact edits already approved and waiting to be queued",
    );
    expect(document.body.textContent).toContain(
      "The newly selected links below are separate work",
    );
    expect(screen.queryByText("Change reviewed")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Queue approved exact edits" }));

    // The freshly prepared plan was never approved, so the recovery job must
    // not pretend to carry it.
    expect(mocks.queueMutate.mock.calls[0][0]).toStrictEqual({
      siteId: 1,
      planIds: undefined,
    });
    expect(mocks.approveMutate).not.toHaveBeenCalled();
  });

  it("prefers the exact subset this browser approved over site-wide recovery", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => {
      // Approval invalidates the pending query, so the server starts reporting
      // the durable plan this session has just created.
      mocks.pendingPublication = [
        { site_id: 1, selected_suggestions: 0, approved_plans: 1 },
      ];
      options?.onSuccess?.();
    });
    mocks.queueMutate.mockImplementation((_variables, options) =>
      options?.onError?.(new Error("redis is down")),
    );
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    renderPublish("/publish/1");

    await readEveryChange(user);
    await user.click(
      screen.getByRole("checkbox", {
        name: `Include the edit to ${SECOND_PLAN.source_url} in approval`,
      }),
    );
    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    // Plan 56 was excluded, so site-wide recovery here would be a broader claim
    // than the operator made. The exact retry is the one that is offered.
    expect(screen.queryByRole("button", { name: "Queue approved exact edits" })).toBeNull();
    mocks.queueMutate.mockClear();
    await user.click(screen.getByRole("button", { name: "Queue approved edits" }));

    expect(mocks.queueMutate).toHaveBeenCalledWith(
      { siteId: 1, planIds: [55] },
      expect.anything(),
    );
  });

  it("names the action each waiting site actually needs on the index", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 0, approved_plans: 2 },
      { site_id: 2, selected_suggestions: 5, approved_plans: 0 },
    ];
    renderPublish("/publish");

    expect(screen.getByRole("link", { name: "Queue approved edits" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Review exact edits" })).not.toBeNull();
    expect(document.body.textContent).toContain("2 exact edits approved and waiting to be queued");
    expect(document.body.textContent).toContain("5 links selected");
  });
});
