# Static Bulk Review UI Design

## Goal

Add a frontend-only, interactive prototype for reviewing link suggestions at volume and make publication state unambiguous. The prototype must not modify backend code or send review mutations to the API.

## Scope

- Change files only in `linking-engine-frontend`.
- Keep suggestion reads from the existing frontend data source.
- Handle individual and bulk review interactions in browser memory only.
- Reset all locally simulated review changes when the page reloads.
- Do not call the single-review or bulk-review mutation endpoints from the review queue.
- Do not change backend routes, schemas, models, tasks, or tests.

## Review Queue Controls

The existing status chips and site selector remain. A compact bulk-review toolbar is added beside or directly below them with:

- A method filter with `All methods`, `Baseline`, and `GNN` choices.
- A score threshold expressed as an integer percentage from 0 through 100, initially `80`.
- An `Accept >= 80%` action targeting pending suggestions whose score is greater than or equal to the threshold.
- A `Reject < 80%` action targeting pending suggestions whose score is below the threshold.

The selected site, selected method, and score rule jointly determine the bulk target set. Bulk actions never modify suggestions that are already queued, published, or rejected.

Before applying a bulk rule, the UI presents a confirmation state containing the action, rule, and exact number of affected suggestions. Confirming updates browser state; cancelling leaves all statuses unchanged. An action is disabled when its target set is empty.

## Local Interaction Model

The review page keeps an in-memory map from suggestion ID to simulated status. A helper resolves each suggestion's displayed status from that map first and the fetched status second.

Status, site, and method filtering operate on the resolved suggestions already loaded by the page. Individual Accept, Reject, and Undo actions use the same local status map as bulk actions. This keeps the prototype internally consistent and prevents any review mutation from reaching the backend.

After an action:

- Cards and the open preview reflect the new status immediately.
- Status chip counts reflect the locally simulated changes.
- Suggestions enter or leave the visible list according to the active status filter.
- A short inline result message reports how many suggestions were updated.

Changing filters does not discard local changes. Reloading the page does.

## Publication Status Language

Backend values remain unchanged in frontend types, but editor-facing labels become explicit:

| Suggestion value | Editor-facing label | Meaning |
| --- | --- | --- |
| `pending` | Pending review | No editor decision yet |
| `approved` | Queued for publish | Accepted but not yet written to the site |
| `applied` | Published live | Written back to the live site |
| `rejected` | Rejected | Excluded from publication |

Status chips, card badges, and preview messaging use these labels. The preview shows a dedicated publication-status callout:

- `approved`: `Queued for the next publish batch. Not live yet.`
- `applied`: `Published to the live article.`

Pending and rejected suggestions do not imply publication progress.

## RQ Copy

Replace the scheduling note on the Sites page with:

> Scheduled re-crawls run through RQ.

No frontend copy should say that Celery performs re-crawls or publishing.

## Component Boundaries

- `ValidationPage` owns fetched suggestions, local status overrides, filter state, confirmation state, and result feedback.
- `BulkActions` owns presentation of method and threshold controls plus the two bulk action triggers. It receives calculated target counts and disabled states through props.
- A focused pure helper module owns resolved-status filtering, threshold targeting, and count adjustment. It has no React or network dependencies.
- `SuggestionCard` renders the explicit publication labels and sends review intents upward.
- `SuggestionPreview` renders the dedicated publication-status callout and sends review intents upward.
- `lib/utils` remains the shared source for status and method display metadata.

## Empty and Boundary States

- Threshold values are clamped to the inclusive range 0-100.
- Accept uses an inclusive comparison at the threshold; Reject uses a strict comparison below it, so no score belongs to both rules.
- Bulk controls consider only pending suggestions.
- Empty target sets disable their corresponding action and show a zero count.
- The existing empty-list message remains when no suggestion matches the active filters.
- Because mutations are local, there is no mutation-network error state. Existing suggestion-loading behavior remains unchanged.

## Testing and Verification

Automated tests cover:

- Method filtering for all, baseline, and GNN.
- Inclusive accept and exclusive reject threshold boundaries.
- Exclusion of non-pending suggestions from bulk targets.
- Local status resolution and adjusted counts.
- Editor-facing publication labels and messages.
- The absence of Celery scheduling copy and presence of the RQ copy.

Verification also includes a production frontend build and a browser check of the review queue at desktop width. The browser check confirms filtering, confirmation, local status changes, queued-versus-published language, empty-target disabling, and that no review mutation request is sent.
