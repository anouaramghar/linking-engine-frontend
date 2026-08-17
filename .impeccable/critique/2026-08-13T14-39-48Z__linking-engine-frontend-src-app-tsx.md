---
target: frontend coherence and design-system review
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-13T14-39-48Z
slug: linking-engine-frontend-src-app-tsx
---
⚠️ DEGRADED: single-context (design sub-agent timed out after repeated waits; detector pass completed)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Strong loading, live-region, job, queue, and publication feedback; browser behavior was not available to verify visually. |
| 2 | Match System / Real World | 3/4 | Selection, exact-edit review, approval, and queueing are named clearly; BM25, ContentConnector, and trace terminology still need contextual help. |
| 3 | User Control and Freedom | 3/4 | Undo, cancel, retry, Escape, clear filters, and explicit back paths are present. |
| 4 | Consistency and Standards | 2/4 | Tokenized primitives are strong, but `input` is used where the defined `.field` primitive is required on two filter surfaces. |
| 5 | Error Prevention | 3/4 | Exact-plan approval, read-before-approve, confirmation, and type-to-confirm safeguards are well represented. |
| 6 | Recognition Rather Than Recall | 3/4 | Labels, flow steps, status badges, and visible selection trays help; some explanations are hover-only. |
| 7 | Flexibility and Efficiency of Use | 3/4 | Bulk review, incremental loading, batch selection, URL filters, and queue keyboard shortcuts support operators. |
| 8 | Aesthetic and Minimalist Design | 3/4 | The neutral editorial system is disciplined, but the queue toolbar carries many simultaneous controls. |
| 9 | Help Users Recognize, Diagnose, and Recover from Errors | 3/4 | Errors generally include retry, undo, recovery, or a next action. |
| 10 | Help and Documentation | 2/4 | Inline explanations exist, but there is no discoverable task-focused help layer. |
| **Total** |  | **28/40** | **Good foundation; address the filter primitive and queue cognitive load before polishing.** |

## Design Specificity Verdict

The frontend is recognizably authored for LinkMesh rather than being a generic dashboard: warm near-black ink, off-white canvas, EB Garamond display type, Inter operational text, restrained pastel atmosphere, pill actions, hairline cards, and a queue-first navigation model all express the documented system in `DESIGN-elevenlabs.md` and `src/index.css`.

The strongest coherence is in the shell and publication flow. `App.tsx` keeps the queue first, separates selection from exact-edit approval, uses the same tokenized rail and button grammar across desktop and mobile, and makes the protected flow visible with `FlowSteps` and `SelectionTray`. The main break is implementation-level rather than stylistic: two pages use an undefined `.input` class instead of the documented `.field` component primitive.

The deterministic detector found three identical generic `overused-font` warnings at `src/index.css:17`, `src/index.css:25`, and `src/index.css:33` for Inter. These are false positives for this project: Inter is explicitly the documented body, navigation, caption, and button family, paired with EB Garamond for display. No browser visualization or overlay was available in this session.

## Overall Impression

This is a disciplined operational UI with a clear visual point of view and unusually careful publication-state language. The next meaningful improvement is not a redesign: enforce the token contract at every filter control and reduce the queue toolbar's number of simultaneous decisions.

## What's Working

- The publication journey is unusually clear: selecting a link is explicitly not approval, exact edits are reviewed separately, and queueing remains the final non-editorial destination (`src/components/publish/FlowSteps.tsx`, `src/components/suggestions/SelectionTray.tsx`, `src/components/publish/PublicationReview.tsx`).
- The visual system is genuinely centralized. `src/index.css:301-316` defines the `.field` primitive, `src/index.css:250-268` defines the button grammar, and `tailwind.config.ts` removes most stock palette/radius ambiguity.
- The shell handles real operator needs well: skip link, responsive navigation, collapsed-rail labels, live health status, focus trapping, retry/undo feedback, and queue shortcuts are all present (`src/App.tsx`, `src/hooks/useFocusTrap.ts`, `src/hooks/useQueueShortcuts.ts`).

## Priority Issues

### [P1] Filter controls bypass the design-system input primitive

**Evidence:** `src/pages/PublishPage.tsx:64` and `src/pages/EvaluationPage.tsx:677,692` use `className="input ..."`. No `.input` rule exists in `src/index.css` or `tailwind.config.ts`; the defined primitive is `.field` at `src/index.css:301-316`. The successful build therefore does not mean these controls are styled correctly; the built CSS contains no `.input` selector.

**Why it matters:** The publication-review site search and evaluation filters can fall back to browser defaults, breaking height, border, radius, typography, focus, dark-theme behavior, and visual parity with every other form.

**Fix:** Replace those uses with `.field` and add a small regression check that all form controls use the system primitive. Do not create a second `.input` primitive unless the system is intentionally renamed.

### [P1] The queue toolbar asks for too many decisions at once

**Evidence:** `src/pages/ValidationPage.tsx:53-60,969-1005` exposes eight status choices (seven statuses plus All), search, site, target-origin, a score threshold, and two bulk actions in one above-the-fold control area. `BulkActions.tsx:133-267` keeps the bulk-review controls visible alongside the filters.

**Why it matters:** The central review task becomes a control-selection task. Operators must distinguish browsing filters from bulk mutation rules and remember which status selections disable bulk actions. This is the clearest cognitive-load problem in the product.

**Fix:** Keep “Pending review” and “All” prominent; group publishing/history states under a “More statuses” menu or segmented disclosure. Keep bulk review collapsed until requested, with the threshold and affected count revealed together. Preserve the existing confirmation and exact-review safeguards.

### [P2] Important explanations are not keyboard-discoverable

**Evidence:** `src/pages/EvaluationPage.tsx:96-103` renders metric definitions as a non-focusable `span` with a `title`; `src/components/sites/SiteStatusBadge.tsx:96-110` similarly relies on a title for the visible reason. The collapsed rail correctly implements focus-visible tips, so this is an inconsistent help pattern.

**Why it matters:** Keyboard and touch users cannot reliably request the same explanation that pointer users get on hover. Evaluation terms and crawl/analysis states are exactly where first-time operators need help.

**Fix:** Use a real button with an accessible popover, or replace hover-only definitions with always-visible one-line descriptions/details on the metric and status surfaces.

### [P2] The component tree contains an apparently dead selection surface

**Evidence:** `src/components/suggestions/SelectionActions.tsx` is tracked but has no imports or references outside its own file (`rg` found only its declaration).

**Why it matters:** A second selection-action implementation can drift from the queue-owned selection tray and makes the intended publication architecture less obvious to future contributors.

**Fix:** Confirm it is not an external entry point, then delete it or deliberately make it the single shared implementation. The current queue-owned `SelectionTray` should remain the primary destination.

## Cognitive Load

The queue is high-load at its toolbar, while the exact-edit review itself is better sequenced.

- Failed: single focus — browse filters and bulk mutation controls compete in the same working area.
- Passed: grouping — filters, bulk review, source groups, previews, and approval actions are visually grouped.
- Failed: visual hierarchy — eight status choices and two bulk actions compete with the actual suggestion list.
- Passed: one thing at a time — exact edits must be opened/read before approval.
- Failed: minimal choices — the status strip alone presents eight choices.
- Failed: working memory — status, site, target, query, threshold, and bulk action must be coordinated.
- Passed: progressive disclosure — source groups and exact changes can be collapsed.

This is four failed checklist items: high cognitive load in the queue toolbar, moderate elsewhere.

## Persona Red Flags

**Alex — power operator**

- Strong: bulk selection, threshold actions, incremental loading, URL-preserved filters, and Arrow/Alt/Ctrl keyboard shortcuts are present.
- Red flag: the eight-status strip and always-visible bulk controls slow the common “show pending and decide” path.
- Red flag: no visible shortcut hint means the efficient path is discoverable only by prior knowledge or source inspection.

**Sam — keyboard/screen-reader user**

- Strong: skip link, native controls, live status regions, focus trap, Escape handling, and real headings are present.
- Red flag: metric definitions and some status reasons are hover/title affordances rather than focusable help controls.
- Red flag: the undefined `.input` class creates a visual/focus inconsistency on two filter surfaces that cannot be inferred from the design tokens.

**Riley — deliberate edge-case tester**

- Strong: retry, undo, bulk recovery, explicit “nothing is live yet” messaging, read-before-approve, and exact-plan warnings are good recovery behavior.
- Red flag: a browser-default filter can look like a different product surface and make failure/recovery states harder to scan.
- Red flag: the queue has enough status and filter combinations that users may not know whether they are browsing a set or defining a bulk mutation rule.

## Minor Observations

- `SuggestionGroup` uses `rounded-xxl` (`src/components/suggestions/SuggestionGroup.tsx:44`), while the design document reserves the 24px xxl treatment primarily for atmospheric orb cards and uses xl for normal feature cards. Either document this as a deliberate group-level exception or use `rounded-xl`.
- The detector's Inter warnings should be ignored or scoped to the project design authority; replacing Inter would violate the documented system.
- Lint passed. The first build attempt hit Windows `spawn EPERM`; the permitted retry passed TypeScript and Vite production build. `git diff --check` reported only existing LF/CRLF normalization warnings in dirty files, not whitespace errors.

## Questions to Consider

- Which should come first: fixing the `.input` token drift, simplifying the queue toolbar, or making metric/status help keyboard-discoverable?
- Should the queue remain a dense expert workspace, or should “Pending review” become a deliberately calmer default with historical statuses behind disclosure?
- For the next pass, do you want only the top two coherence fixes, or a full system-consistency sweep across every route and modal?
