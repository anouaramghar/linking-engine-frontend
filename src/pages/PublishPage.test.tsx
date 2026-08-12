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
  sitesQuery: {} as Record<string, unknown>,
  pendingQuery: {} as Record<string, unknown>,
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
  }),
  usePreparePublicationPlans: () => ({
    data: undefined,
    jobId: null,
    progress: null,
    isPending: false,
    isError: false,
    mutate: mocks.prepareMutate,
    reset: mocks.prepareReset,
  }),
  useApprovePlans: () => ({ mutate: mocks.approveMutate, isPending: false }),
  useQueueApprovedPlans: () => ({ mutate: mocks.queueMutate, isPending: false }),
}));

vi.mock("../hooks/useSuggestions", () => ({
  useReview: () => ({ mutate: mocks.reviewMutate, isPending: false }),
}));

const PLAN: PublicationPlan = {
  id: 55,
  status: "prepared" as const,
  plan_hash: "a".repeat(64),
  source_article_id: 10,
  source_url: "https://example.com/source",
  original_html: "<p>solar panel costs</p>",
  updated_html: '<p><a href="/target">solar panel</a> costs</p>',
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
  mocks.pendingPublication = [
    ...mocks.pendingPublication.filter((entry) => entry.site_id !== site),
    { site_id: site, selected_suggestions: 1, approved_plans: 0 },
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
  mocks.sitesQuery = {};
  mocks.pendingQuery = {};
  mocks.getPlanHtml.mockResolvedValue({
    id: PLAN.id,
    plan_hash: PLAN.plan_hash,
    original_html: PLAN.original_html,
    updated_html: PLAN.updated_html,
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
    // Reading the live articles costs a request per source article, so it waits
    // for the operator to choose a site.
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
  });

  it("marks exact-edit review as recommended but optional", () => {
    preparedFor(1);
    renderPublish("/publish");

    expect(document.body.textContent).toContain("Recommended");
    expect(document.body.textContent).toContain("Optional");
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
    await user.click(screen.getByRole("link", { name: "All sites waiting" }));
    expect(document.body.textContent).toContain("Prepared");

    await user.click(screen.getAllByRole("link", { name: "Back to the edits" })[0]);

    // Reading the live articles a second time for a site already read is the
    // cost this cache exists to refuse.
    expect(mocks.prepareMutate).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("View exact HTML (advanced)");
  });

  it("keeps the ticks of a site the operator walked away from", async () => {
    const user = userEvent.setup();
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    preparedFor(2);
    renderPublish("/publish/1");

    await user.click(
      screen.getByRole("checkbox", {
        name: `Include the edit to ${SECOND_PLAN.source_url} in approval`,
      }),
    );
    await user.click(screen.getByRole("link", { name: "All sites waiting" }));
    await user.click(screen.getAllByRole("link", { name: "Back to the edits" })[0]);

    expect(document.body.textContent).toContain("1 article stays unpublished");
  });

  it("does not prepare a site that holds nothing", () => {
    renderPublish("/publish/1");

    expect(document.body.textContent).toContain("no links waiting for review");
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
  });
});

describe("PublishPage approval", () => {
  it("offers a clear path to approval without reading every edit", () => {
    preparedFor(1);
    renderPublish();

    const skip = screen.getByRole("link", { name: "Skip review" });
    expect(skip.getAttribute("href")).toBe("#approval-actions");
    expect(document.getElementById("approval-actions")).not.toBeNull();
    expect(document.body.textContent).toContain("strongly recommended");
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

  it("loads exact WordPress HTML only when advanced review asks for it", async () => {
    const user = userEvent.setup();
    preparedFor(1);
    renderPublish();

    expect(document.body.textContent).toContain("View exact HTML (advanced)");
    expect(mocks.getPlanHtml).not.toHaveBeenCalled();

    await user.click(screen.getByText("View exact HTML (advanced)"));

    expect(await screen.findByText("<p>solar panel costs</p>")).not.toBeNull();
    expect(screen.getByText('<p><a href="/target">solar panel</a> costs</p>')).not.toBeNull();
    expect(mocks.getPlanHtml).toHaveBeenCalledWith(1, 55);
    expect(document.body.textContent).not.toContain(PLAN.plan_hash.slice(0, 12));
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

    await user.click(screen.getByRole("button", { name: /^Approve and queue 1 article$/ }));

    expect(mocks.approveMutate).toHaveBeenCalledWith(
      { siteId: 1, plans: [{ id: 55, plan_hash: PLAN.plan_hash }] },
      expect.anything(),
    );
    expect(mocks.queueMutate).toHaveBeenCalledWith(
      { siteId: 1, planIds: [55] },
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

    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    // One plan was shown; `has_more` and the failed source describe work that is
    // explicitly not in this request.
    expect(mocks.approveMutate).toHaveBeenCalledWith(
      { siteId: 1, plans: [{ id: 55, plan_hash: PLAN.plan_hash }] },
      expect.anything(),
    );
    expect(document.body.textContent).toContain("left out of this batch");
  });

  it("ticks every prepared article, so the normal case is still one click", () => {
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    renderPublish();

    expect(
      screen.getByRole("button", { name: /^Approve and queue 2 articles$/ }),
    ).not.toBeNull();
    expect(document.body.textContent).toContain("2 of 2 selected");
  });

  it("approves only the articles left ticked, and says what it held back", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    renderPublish();

    await user.click(
      screen.getByRole("checkbox", {
        name: `Include the edit to ${SECOND_PLAN.source_url} in approval`,
      }),
    );

    expect(document.body.textContent).toContain("1 article stays unpublished");
    await user.click(screen.getByRole("button", { name: /^Approve and queue 1 article$/ }));

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
      screen.getByRole("button", { name: /^Approve and queue 0 articles$/ }),
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

  it("shows the change as the sentence it lands in, not only as HTML", () => {
    preparedFor(1);
    renderPublish();

    // The passage is read back out of the stored HTML, so what is on screen is
    // the artifact the approval names.
    expect(document.body.textContent).toContain("solar panel costs");
    expect(screen.getByText("solar panel").tagName).toBe("MARK");
    expect(document.body.textContent).toContain(
      "The marked words become the link. The wording of the article does not change.",
    );
  });

  it("prints a link once, not in a summary list and again in a change panel", () => {
    preparedFor(1);
    renderPublish();

    // The article opens with its change shown, and the target used to be
    // written twice inside it — a batch of ten said everything twice.
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

  it("keeps a change readable when the passage cannot be located", () => {
    preparedFor(1, {}, [
      {
        ...PLAN,
        updated_html: "<p>nothing recognisable here</p>",
        links: [{ ...PLAN.links[0], placement_context: undefined }],
      },
    ]);
    renderPublish();

    expect(document.body.textContent).toContain(
      'A link to https://example.com/target is added on "solar panel"',
    );
  });

  it("opens the first three changes and leaves the rest to ask", () => {
    const plans = [1, 2, 3, 4].map((offset) => ({
      ...PLAN,
      id: 60 + offset,
      source_url: `https://example.com/source-${offset}`,
      links: [{ ...PLAN.links[0], suggestion_id: offset }],
    }));
    preparedFor(1, {}, plans);
    renderPublish();

    expect(screen.getAllByRole("button", { name: "Hide the change" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Show the change" })).toHaveLength(1);
  });

  it("shows a change the operator asks for", async () => {
    const user = userEvent.setup();
    preparedFor(1, {}, [PLAN, SECOND_PLAN, { ...PLAN, id: 57 }, { ...PLAN, id: 58 }]);
    renderPublish();

    await user.click(screen.getByRole("button", { name: "Show the change" }));

    expect(screen.queryByRole("button", { name: "Show the change" })).toBeNull();
  });

  it("returns one link to the queue and prepares the article again", async () => {
    const user = userEvent.setup();
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
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
});
