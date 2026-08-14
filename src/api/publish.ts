import { api } from "./client";
import type { JobAccepted } from "../types/job";

/**
 * Publication is three separate calls, and only the middle one is a decision.
 *
 * `preparePublicationPlans` reads the live WordPress articles and stores the
 * exact edits. `approvePublicationPlans` binds the signed-in operator to the
 * hashes they were shown. `queueApprovedPlans` starts the job and decides
 * nothing, which is what makes it safe to retry on its own.
 *
 * There is deliberately no helper that publishes from a site id alone. That was
 * the old contract, and it published whatever happened to be selected at the
 * moment the worker ran.
 */

export interface PendingPublicationSite {
  site_id: number;
  site_name?: string;
  platform?: string;
  /** Editorial intent awaiting preparation. Not publishable on its own. */
  selected_suggestions: number;
  /** Exact artifacts a person approved. The only thing that may be queued. */
  approved_plans: number;
  /**
   * False when the site has no WordPress account, so preparation cannot read a
   * single post for editing. Optional so an engine that predates the field is
   * read as publishable rather than silently hiding the review button.
   */
  can_publish?: boolean;
}

export interface PendingPublicationPage {
  items: PendingPublicationSite[];
  next_cursor: number | null;
  total_sites: number | null;
  total_selected_suggestions: number | null;
  total_approved_plans: number | null;
}

export type LinkOutcome = "inserted" | "block" | "already_present";

export type PublicationPlanStatus =
  | "prepared"
  | "approved"
  | "applied"
  | "stale"
  | "superseded"
  | "failed";

export interface PlanLink {
  position: number;
  suggestion_id: number;
  target_url: string;
  anchor_text: string | null;
  placement_context?: string | null;
  outcome: LinkOutcome;
}

export interface PublicationPlan {
  id: number;
  status: PublicationPlanStatus;
  /**
   * SHA-256 of the whole artifact. Sent back at approval, so the engine can
   * refuse if what is on the server is no longer what was on screen.
   */
  plan_hash: string;
  source_article_id: number;
  source_url: string;
  /**
   * No HTML here on purpose. A prepared batch is megabytes of markup and this
   * shape is polled until the job settles, so the exact bytes are fetched one
   * plan at a time from `PublicationPlanHtml`.
   */
  links: PlanLink[];
}

export interface PublicationPlanHtml {
  id: number;
  plan_hash: string;
  original_html: string;
  updated_html: string;
}

export interface PublicationPreparationError {
  source_article_id: number;
  source_url: string;
  message: string;
}

export interface PublicationPreparation {
  site_id: number;
  selected_suggestions: number;
  plans: PublicationPlan[];
  errors: PublicationPreparationError[];
  /** More source articles remain unshown — never "and they come along too". */
  has_more: boolean;
}

export interface PlanApprovalResult {
  approved: number[];
  approved_by: string;
}

export const listPendingPublication = (
  cursor?: number,
  search = "",
  limit = 50,
) =>
  api
    .get<PendingPublicationPage>("/publish/pending", {
      params: {
        limit,
        cursor,
        search: search.trim() || undefined,
        include_totals: cursor === undefined,
      },
    })
    .then((response) => response.data);

export const getPendingPublicationSite = (siteId: number) =>
  api
    .get<PendingPublicationSite>(`/publish/pending/${siteId}`)
    .then((response) => response.data);

/**
 * How many source articles one preparation covers. Exported because the modal
 * has to say so when more remain, and a number repeated in the copy is a number
 * that goes stale the first time this one is tuned.
 */
export const PREPARE_MAX_ARTICLES = 10;

/**
 * Start a preparation. `suggestionIds` narrows it to those links.
 *
 * The narrowing is the engine's job, not the dashboard's: a plan's hash covers
 * a whole source article, so an article holding three selected links is one
 * artifact that publishes all three. Showing one of them and hiding the others
 * would change nothing about what approval writes. Asking the engine for one
 * link renders an artifact that carries that link alone — and costs one live
 * request instead of ten.
 */
export const preparePublicationPlans = (
  siteId: number,
  maxArticles = PREPARE_MAX_ARTICLES,
  suggestionIds?: number[],
) =>
  api
    .post<JobAccepted>(`/publish/${siteId}/plans/prepare-async`, undefined, {
      params: {
        max_articles: maxArticles,
        suggestion_ids: suggestionIds?.length ? suggestionIds : undefined,
      },
      // FastAPI reads a list query parameter as repeated bare keys. Axios
      // writes `suggestion_ids[]=1` by default, which binds to nothing there
      // and would silently prepare the whole batch instead of one link.
      paramsSerializer: { indexes: null },
    })
    .then((response) => response.data);

export const getPublicationPlanHtml = (siteId: number, planId: number) =>
  api
    .get<PublicationPlanHtml>(`/publish/${siteId}/plans/${planId}/html`)
    .then((response) => response.data);

export const approvePublicationPlans = (
  siteId: number,
  plans: { id: number; plan_hash: string }[],
) =>
  api
    .post<PlanApprovalResult>(`/publish/${siteId}/plans/approve`, { plans })
    .then((response) => response.data);

export const queueApprovedPlans = (siteId: number, planIds?: number[]) =>
  api
    .post(`/publish/${siteId}`, planIds ? { plan_ids: planIds } : undefined)
    .then((response) => response.data);
