# Static Bulk Review UI Design

> **Superseded in part (2026-07-21).** This document describes the original
> frontend-only prototype. The review queue now sends real review mutations, the
> method filter was never built, and Undo is supported. See "Amendments" at the
> end for what still holds.

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

## Amendments (2026-07-21)

Changes made after the UI/UX review; where these conflict with the text above,
these win.

### Reversed: local-only mutations

The queue now calls the single-review and bulk-review endpoints for real.
In-memory status overrides remain, but only as an optimistic bridge across the
refetch: `pruneStatusOverrides` drops an override once the server agrees with it,
and always yields to `applying` / `applied`, which the publication worker owns.

### Added: Undo

`ReviewStatus` gained `pending` on both sides of the API, so a decision can be
walked back from the card, the preview, or the result toast. `_review` clears
`reviewed_at` when reverting. Suggestions that reached `applying` or `applied`
stay final — the existing publish guard returns 409.

### Changed: bulk rules are scoped to the visible list

`getBulkTargets` takes the active status filter and returns nothing unless the
visible list can contain pending suggestions. Previously a rule run from the
Rejected or Published list silently mutated the pending backlog.

### Changed: thresholds compare on the displayed score

Both the badge and the rule use `scorePercent` (whole percent). A suggestion
shown as 80% is never swept up by a "below 80%" rule.

### Not built: the method filter

`All methods` / `Baseline` / `GNN` was specified but never implemented, and the
tests assert GNN is absent from the UI. Baseline cosine is the only method the
engine produces today; the filter should return with the second method.

### Added: publish handoff

Approving happens in the queue but publishing was reachable only from the Sites
page. The queue now shows an approved-backlog banner that enqueues a publish job
per affected site. A 409 from a site already publishing is reported as
"already publishing", not as a failure.

## Amendments (2026-07-21, follow-up review)

A second pass over the changes above. Where these conflict with anything
earlier, these win.

### Changed: bulk review applies what it can

`POST /suggestions/bulk-review` no longer fails the whole batch when one row has
moved on. It reviews every row it can and returns
`{reviewed[], skipped[], status}`, where `skipped` lists suggestions that were
already picked up for publishing or had expired.

Undo races that worker by design — an approval can be picked up while the undo
affordance is still on screen — and all-or-nothing meant one claimed row left
the editor unable to walk back any of the others, behind a "please try again"
that could never succeed. The queue now overrides only the rows that actually
moved and names the rest. A batch that changes nothing says so instead of
inviting a retry.

The single-suggestion endpoint still returns 409; the queue reports that as a
settled outcome ("already publishing"), not a transient failure.

### Changed: the keyboard cursor follows the queue

Reviewing removes a row from every filter but `All`, which left `selectedId`
pointing at a row the list no longer contained — `j` then restarted at the top
of the queue, so reviewing row 50 sent the editor back to row 1 and `k` was
useless. A decision on the cursor row now hands the cursor to whatever takes its
place, which is what makes `a a a` walk the queue. When a bulk review removes
the cursor row instead, `step` resumes from the vacated index rather than the
top. Deciding a row that is *not* the cursor row leaves the cursor alone.

### Changed: scroll-loading is capped

`useIncrementalList` bounded only the first mount: its IntersectionObserver kept
loading a page per intersection, so an unattended scroll walked the whole queue
into the DOM — the freeze the hook exists to prevent. Auto-loading now stops at
`AUTO_LOAD_LIMIT` (500 rows); past that "Show more" is the only way forward, and
the counter says why it paused.

### Changed: ActionMenu honours its role

`role="menu"` is a promise about the keyboard. The menu now implements it:
arrows move between enabled items and wrap, Home/End jump to the ends, and
items carry `tabindex="-1"` so the menu owns focus while open. Escape closes and
returns focus to the trigger; Tab closes without preventing the browser's next
focus move. ArrowDown opens on the first enabled item, while ArrowUp opens on
the last; clicking the trigger keeps the first-item behavior.

### Changed: error notices interrupt

`Notice` renders `role="alert"` for the error tone and `role="status"` for
information. A failure should reach a screen reader when it happens rather than
queueing behind whatever is being read.

### Constraint: client page size is pinned to the engine's cap

The dashboard walks every list endpoint in pages of 1000, which is exactly
`MAX_PAGE_SIZE`. Raising either page size without raising the cap turns every
list request into a 422. `test_every_list_endpoint_accepts_exactly_max_page_size`
holds the boundary from the backend side.
