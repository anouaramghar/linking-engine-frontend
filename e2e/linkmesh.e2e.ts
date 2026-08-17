import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: 7,
  telegram_id: 4242,
  username: "e2e.operator",
  display_name: "E2E Operator",
  photo_url: null,
  status: "approved",
  requested_at: "2026-08-14T08:00:00Z",
  approved_at: "2026-08-14T08:01:00Z",
  approved_by: "telegram:1",
  last_seen_at: "2026-08-14T08:02:00Z",
};

const emptySuggestionCounts = {
  pending: 0,
  approved: 0,
  rejected: 0,
  applying: 0,
  applied: 0,
  expired: 0,
  failed: 0,
  total: 0,
};

interface SiteFixture {
  id: number;
  name: string;
  base_url: string;
  platform: "wordpress" | "html" | "pool";
  crawl_frequency: string;
  suggestion_method: "hybrid_bm25";
  suggestion_slots_available: number;
  has_wordpress_credentials: boolean;
  created_at: string;
  last_ingestion_status: null;
  article_count: number;
  internal_link_count: number;
  last_crawl_at: null;
  pool_source_approved?: boolean;
  pool_source_approved_at?: string | null;
  pool_source_approved_by?: string | null;
}

interface SuggestionFixture {
  id: number;
  site_id: number;
  source_article: { id: number; title: string; url: string };
  target_article: { id: number; title: string; url: string };
  target_origin: "internal";
  target_site_name: string;
  method: "hybrid_bm25";
  score: number;
  status: "pending" | "approved" | "applying";
  anchor_text: string;
  created_at: string;
}

interface AuthenticatedApiState {
  sites: SiteFixture[];
  suggestions: SuggestionFixture[];
  createdPayload: Record<string, unknown> | null;
  createdClientHeader: string | undefined;
  ingestedSiteIds: number[];
  analyzedSiteIds: number[];
  reviewRequests: Array<{ id: number; status: string }>;
  approvedPlansPayload: Record<string, unknown> | null;
  queuedPlansPayload: Record<string, unknown> | null;
}

const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

async function mockAuthenticatedApi(page: Page): Promise<AuthenticatedApiState> {
  const state: AuthenticatedApiState = {
    sites: [],
    suggestions: [],
    createdPayload: null,
    createdClientHeader: undefined,
    ingestedSiteIds: [],
    analyzedSiteIds: [],
    reviewRequests: [],
    approvedPlansPayload: null,
    queuedPlansPayload: null,
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === "GET" && url.pathname === "/api/v1/auth/session") {
      return fulfillJson(route, { user });
    }
    if (method === "GET" && url.pathname === `/api/v1/auth/users/${user.id}/avatar`) {
      return fulfillJson(route, { detail: "No avatar" }, 404);
    }
    if (method === "GET" && url.pathname === "/api/v1/health") {
      return fulfillJson(route, { status: "ok", database: "up", redis: "up" });
    }
    if (method === "GET" && url.pathname === "/api/v1/sites") {
      return fulfillJson(route, state.sites);
    }
    if (method === "POST" && url.pathname === "/api/v1/sites") {
      const payload = request.postDataJSON() as {
        name: string;
        base_url: string;
        platform: SiteFixture["platform"];
      };
      state.createdPayload = payload;
      state.createdClientHeader = request.headers()["x-linkmesh-client"];

      const created: SiteFixture = {
        id: 101 + state.sites.length,
        name: payload.name,
        base_url: payload.base_url,
        platform: payload.platform,
        crawl_frequency: "daily",
        suggestion_method: "hybrid_bm25",
        suggestion_slots_available: 1_500,
        has_wordpress_credentials: false,
        created_at: "2026-08-14T09:00:00Z",
        last_ingestion_status: null,
        article_count: 0,
        internal_link_count: 0,
        last_crawl_at: null,
      };
      state.sites.push(created);
      return fulfillJson(route, created, 201);
    }
    const poolApprovalMatch = url.pathname.match(
      /^\/api\/v1\/sites\/(\d+)\/pool-source\/approval$/,
    );
    if (method === "POST" && poolApprovalMatch) {
      const siteId = Number(poolApprovalMatch[1]);
      const site = state.sites.find((item) => item.id === siteId);
      if (!site) return fulfillJson(route, { detail: "Site not found" }, 404);
      site.pool_source_approved = true;
      site.pool_source_approved_at = "2026-08-14T09:10:00Z";
      site.pool_source_approved_by = "telegram:4242";
      return fulfillJson(route, site);
    }
    const ingestionMatch = url.pathname.match(/^\/api\/v1\/sites\/(\d+)\/ingest$/);
    if (method === "POST" && ingestionMatch) {
      const siteId = Number(ingestionMatch[1]);
      state.ingestedSiteIds.push(siteId);
      return fulfillJson(route, { job_id: `ingestion-${siteId}` }, 202);
    }
    if (method === "GET" && url.pathname === "/api/v1/jobs/active") {
      return fulfillJson(route, []);
    }
    const jobMatch = url.pathname.match(/^\/api\/v1\/jobs\/(.+)$/);
    if (method === "GET" && jobMatch) {
      const jobId = jobMatch[1];
      if (jobId === "prepare-201") {
        return fulfillJson(route, {
          job_id: jobId,
          status: "succeeded",
          result: {
            site_id: 201,
            selected_suggestions: 1,
            plans: [
              {
                id: 55,
                status: "prepared",
                plan_hash: "a".repeat(64),
                source_article_id: 5010,
                source_url: "https://editorial.example.test/source",
                links: [
                  {
                    position: 0,
                    suggestion_id: 501,
                    target_url: "https://editorial.example.test/target",
                    anchor_text: "internal linking guide",
                    placement_context: "Read our internal linking guide for the full workflow.",
                    outcome: "inserted",
                  },
                ],
              },
            ],
            errors: [],
            has_more: false,
          },
          progress: null,
          progress_at: "2026-08-14T09:05:00Z",
          error: null,
        });
      }
      return fulfillJson(route, {
        job_id: jobId,
        status: "succeeded",
        result: {},
        progress: null,
        progress_at: "2026-08-14T09:05:00Z",
        error: null,
      });
    }
    if (method === "GET" && url.pathname === "/api/v1/suggestions") {
      return fulfillJson(route, {
        items: state.suggestions,
        total: state.suggestions.length,
        limit: 50,
        next_cursor: null,
      });
    }
    if (method === "GET" && url.pathname === "/api/v1/suggestions/counts") {
      const counts = { ...emptySuggestionCounts, total: state.suggestions.length };
      state.suggestions.forEach((suggestion) => {
        counts[suggestion.status] += 1;
      });
      return fulfillJson(route, counts);
    }
    const suggestionMatch = url.pathname.match(/^\/api\/v1\/suggestions\/(\d+)$/);
    if (method === "POST" && suggestionMatch) {
      const siteId = Number(suggestionMatch[1]);
      state.analyzedSiteIds.push(siteId);
      return fulfillJson(route, { job_id: `analysis-${siteId}` }, 202);
    }
    if (method === "PUT" && suggestionMatch) {
      const id = Number(suggestionMatch[1]);
      const payload = request.postDataJSON() as { status: SuggestionFixture["status"] };
      const suggestion = state.suggestions.find((item) => item.id === id);
      if (!suggestion) return fulfillJson(route, { detail: "Suggestion not found" }, 404);
      suggestion.status = payload.status;
      state.reviewRequests.push({ id, status: payload.status });
      return fulfillJson(route, suggestion);
    }
    const placementMatch = url.pathname.match(
      /^\/api\/v1\/suggestions\/(\d+)\/placement$/,
    );
    if (method === "GET" && placementMatch) {
      return fulfillJson(route, {
        suggestion_id: Number(placementMatch[1]),
        found: true,
        placement_context: "Read our internal linking guide for the full workflow.",
        anchor_text: "internal linking guide",
        llm_model: "e2e-mock",
        generated_at: "2026-08-14T09:04:00Z",
      });
    }
    if (
      method === "GET" &&
      /^\/api\/v1\/suggestions\/\d+\/events$/.test(url.pathname)
    ) {
      return fulfillJson(route, []);
    }
    if (method === "GET" && url.pathname === "/api/v1/publish/pending") {
      const selected = state.suggestions.filter((item) => item.status === "approved").length;
      const items = selected
        ? [
            {
              site_id: 201,
              site_name: "Editorial E2E",
              platform: "wordpress",
              selected_suggestions: selected,
              approved_plans: 0,
              can_publish: true,
            },
          ]
        : [];
      return fulfillJson(route, {
        items,
        next_cursor: null,
        total_sites: items.length,
        total_selected_suggestions: selected,
        total_approved_plans: 0,
      });
    }
    if (method === "GET" && url.pathname === "/api/v1/publish/pending/201") {
      return fulfillJson(route, {
        site_id: 201,
        site_name: "Editorial E2E",
        platform: "wordpress",
        selected_suggestions: 1,
        approved_plans: 0,
        can_publish: true,
      });
    }
    if (method === "POST" && url.pathname === "/api/v1/publish/201/plans/prepare-async") {
      return fulfillJson(route, { job_id: "prepare-201" }, 202);
    }
    if (method === "GET" && url.pathname === "/api/v1/publish/201/plans/55/html") {
      return fulfillJson(route, {
        id: 55,
        plan_hash: "a".repeat(64),
        original_html: "<p>Read our guide for the full workflow.</p>",
        updated_html:
          '<p>Read our <a href="https://editorial.example.test/target">internal linking guide</a> for the full workflow.</p>',
      });
    }
    if (method === "POST" && url.pathname === "/api/v1/publish/201/plans/approve") {
      state.approvedPlansPayload = request.postDataJSON() as Record<string, unknown>;
      return fulfillJson(route, { approved: [55], approved_by: "telegram:4242" });
    }
    if (method === "POST" && url.pathname === "/api/v1/publish/201") {
      state.queuedPlansPayload = request.postDataJSON() as Record<string, unknown>;
      state.suggestions.forEach((suggestion) => {
        if (suggestion.status === "approved") suggestion.status = "applying";
      });
      return fulfillJson(route, { job_id: "publication-201" }, 202);
    }

    return fulfillJson(
      route,
      { detail: `E2E mock has no handler for ${method} ${url.pathname}` },
      501,
    );
  });

  return state;
}

test("an anonymous operator can start login and gets invalid-code feedback", async ({
  page,
}) => {
  let submittedCode: string | null = null;

  // Keep the test inside LinkMesh instead of opening an external Telegram tab.
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "GET" && url.pathname === "/api/v1/auth/session") {
      return fulfillJson(route, { detail: "Not authenticated" }, 401);
    }
    if (request.method() === "POST" && url.pathname === "/api/v1/auth/login/start") {
      return fulfillJson(route, {
        deep_link: "https://t.me/linkmesh_e2e_bot?start=e2e",
        expires_in_seconds: 300,
      });
    }
    if (request.method() === "POST" && url.pathname === "/api/v1/auth/login/complete") {
      submittedCode = (request.postDataJSON() as { code: string }).code;
      return fulfillJson(route, { state: "invalid", user: null });
    }
    return fulfillJson(route, { detail: "Unexpected E2E request" }, 501);
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Continue with Telegram" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in with Telegram" }).click();
  await expect(page.getByLabel("One-time Telegram code")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Telegram" })).toBeVisible();

  await page.getByLabel("One-time Telegram code").fill("E2E-INVALID");
  await page.getByRole("button", { name: "Complete sign in" }).click();

  await expect(
    page.getByText("That sign-in link expired or was already used."),
  ).toBeVisible();
  expect(submittedCode).toBe("E2E-INVALID");
});

test("an approved operator connects a site and navigates to the content pool", async ({
  page,
}) => {
  const apiState = await mockAuthenticatedApi(page);

  await page.goto("/sites");

  await expect(page.getByRole("heading", { name: "Sites", level: 1 })).toBeVisible();
  await expect(page.getByText("No sites are connected yet.")).toBeVisible();

  await page.getByRole("button", { name: "Connect site" }).click();
  await expect(page.getByRole("heading", { name: "Connect a site" })).toBeVisible();
  await page.getByLabel(/Site name/).fill("E2E Documentation");
  await page.getByLabel(/Site URL/).fill("https://docs.example.test/");
  await page.getByLabel("Platform").selectOption("html");
  // Scoped to the dialog: the page header carries a "Connect site" button too,
  // and the modal does not hide the background from the accessibility tree.
  await page.getByRole("dialog").getByRole("button", { name: "Connect site" }).click();

  await expect(page.getByText("E2E Documentation")).toBeVisible();
  expect(apiState.createdPayload).toEqual({
    name: "E2E Documentation",
    base_url: "https://docs.example.test",
    platform: "html",
  });
  expect(apiState.createdClientHeader).toBe("dashboard");

  await page.getByRole("button", { name: "Crawl E2E Documentation" }).click();
  await expect.poll(() => apiState.ingestedSiteIds).toEqual([101]);

  await page.getByRole("button", { name: "Actions for E2E Documentation" }).click();
  await page.getByRole("menuitem", { name: "Generate suggestions" }).click();
  await expect.poll(() => apiState.analyzedSiteIds).toEqual([101]);

  await page.getByRole("link", { name: "Content Pool" }).click();
  await expect(page).toHaveURL(/\/content-pool$/);
  await expect(page.getByRole("heading", { name: "Content Pool", level: 1 })).toBeVisible();
  await expect(
    page.getByText("Connect a trusted RSS, Atom, or Wikipedia source to get started."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Connect pool source" }).click();
  await page.getByLabel(/Site name/).fill("Pool E2E");
  await page
    .getByLabel(/Site URL/)
    .fill("https://en.wikipedia.org/wiki/Internal_link");
  await page.getByRole("dialog").getByRole("button", { name: "Connect site" }).click();

  await expect(page.getByText("Pool E2E")).toBeVisible();
  await page.getByRole("button", { name: "Approve Pool E2E" }).click();
  await page.getByRole("button", { name: "Approve source" }).click();
  await expect(page.getByText("Pool E2E approval completed.")).toBeVisible();

  await page.getByRole("button", { name: "Crawl Pool E2E" }).click();
  await expect.poll(() => apiState.ingestedSiteIds).toEqual([101, 102]);
});

test("an operator selects a suggestion, approves its exact edit, and queues publication", async ({
  page,
}) => {
  const apiState = await mockAuthenticatedApi(page);
  apiState.sites.push({
    id: 201,
    name: "Editorial E2E",
    base_url: "https://editorial.example.test",
    platform: "wordpress",
    crawl_frequency: "daily",
    suggestion_method: "hybrid_bm25",
    suggestion_slots_available: 1_499,
    has_wordpress_credentials: true,
    created_at: "2026-08-14T09:00:00Z",
    last_ingestion_status: null,
    article_count: 2,
    internal_link_count: 0,
    last_crawl_at: null,
  });
  apiState.suggestions.push({
    id: 501,
    site_id: 201,
    source_article: {
      id: 5010,
      title: "Source article",
      url: "https://editorial.example.test/source",
    },
    target_article: {
      id: 5011,
      title: "Target article",
      url: "https://editorial.example.test/target",
    },
    target_origin: "internal",
    target_site_name: "Editorial E2E",
    method: "hybrid_bm25",
    score: 0.86,
    status: "pending",
    anchor_text: "internal linking guide",
    created_at: "2026-08-14T09:03:00Z",
  });

  await page.goto("/queue");

  await expect(page.getByRole("heading", { name: "Link suggestions", level: 1 })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Select suggestion from Editorial E2E: Source article to Target article",
    })
    .click();

  await expect.poll(() => apiState.reviewRequests).toEqual([{ id: 501, status: "approved" }]);
  await page.getByRole("link", { name: "Open selected links" }).click();

  // The selected-links page is a review inbox between the queue and publication,
  // so the batch reaches /publish through it rather than directly.
  await expect(page).toHaveURL(/\/selected$/);
  await page.getByRole("link", { name: "Review selected exact edits" }).click();

  await expect(page).toHaveURL(/\/publish$/);
  await page.getByRole("link", { name: "Review exact edits" }).click();
  await expect(page).toHaveURL(/\/publish\/201(?:\?job=prepare-201)?$/);
  await expect(page.getByRole("heading", { name: "Approve exact edits", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Exact edit review" })).toBeVisible();

  // Every exact change must be read before the batch can be approved, so the
  // approve action only appears once nothing is left unread.
  await expect(page.getByText("0 of 1 read")).toBeVisible();
  await page.getByRole("button", { name: "Read the next change" }).click();

  await expect(page.getByRole("button", { name: "Approve and queue 1 exact edit" })).toBeVisible();

  await page.getByRole("button", { name: "Approve and queue 1 exact edit" }).click();

  await expect.poll(() => apiState.approvedPlansPayload).toEqual({
    plans: [{ id: 55, plan_hash: "a".repeat(64) }],
  });
  await expect.poll(() => apiState.queuedPlansPayload).toEqual({ plan_ids: [55] });
  await expect(page.getByText("The publish job is queued")).toBeVisible();
});
