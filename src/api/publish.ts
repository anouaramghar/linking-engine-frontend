import { api } from "./client";

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
  /** Editorial intent awaiting preparation. Not publishable on its own. */
  selected_suggestions: number;
  /** Exact artifacts a person approved. The only thing that may be queued. */
  approved_plans: number;
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
  original_html: string;
  /** Byte-for-byte what WordPress will receive. Nothing re-renders it. */
  updated_html: string;
  links: PlanLink[];
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

export const listPendingPublication = () =>
  api
    .get<PendingPublicationSite[]>("/publish/pending")
    .then((response) => response.data);

/**
 * How many source articles one preparation covers. Exported because the modal
 * has to say so when more remain, and a number repeated in the copy is a number
 * that goes stale the first time this one is tuned.
 */
export const PREPARE_MAX_ARTICLES = 10;

export const preparePublicationPlans = (
  siteId: number,
  maxArticles = PREPARE_MAX_ARTICLES,
) =>
  api
    .post<PublicationPreparation>(`/publish/${siteId}/plans/prepare`, undefined, {
      params: { max_articles: maxArticles },
      // The engine reads live WordPress posts sequentially and may honour a
      // host's Retry-After. This step is intentionally longer than a normal
      // dashboard request, while still bounded for a dead connection.
      timeout: 180_000,
    })
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
