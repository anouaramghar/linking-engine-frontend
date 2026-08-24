---
target: suggestion details panel
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-08-24T21-11-37Z
slug: src-components-suggestions-suggestionpreview-tsx
---
Method: dual-agent (A: Gibbs · B: Dirac)

# Suggestion details panel — design critique

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Loading and publication states are explicit, but the queue preview hides the direct next action for approved items and can auto-advance after success. |
| 2 | Match System / Real World | 3/4 | Source, placement, and target language is editorial; ranking/provenance terms remain technical. |
| 3 | User Control and Freedom | 3/4 | Close, retry, undo, and focus recovery are strong; automatic successor selection reduces control. |
| 4 | Consistency and Standards | 3/4 | Tokens and responsive behavior are coherent; workflow vocabulary drifts between Select, Accepted, approved, and exact-edit review. |
| 5 | Error Prevention | 3/4 | The staged selection/publication model is safe; individual decisions are immediate and the main action is hard to see. |
| 6 | Recognition Rather Than Recall | 3/4 | Placement context and target metadata are visible; technical evidence requires interpretation. |
| 7 | Flexibility and Efficiency | 2/4 | Bulk review helps, but there is no discoverable keyboard operating model for the panel. |
| 8 | Aesthetic and Minimalist Design | 3/4 | The calm LinkMesh visual system is authored and cohesive; the trace section becomes dense. |
| 9 | Error Recovery | 3/4 | Retry, undo, and explicit failure messages exist; failure recovery does not guide the operator to the underlying access repair. |
| 10 | Help and Documentation | 2/4 | Inline explanations exist, but no glossary or contextual explanation for ranking terms is available at the decision point. |
| **Total** |  | **28/40** | **Good foundation; decision hierarchy and terminology need another pass.** |

## Design Specificity Verdict

This feels authored for LinkMesh: the warm neutral palette, EB Garamond/Inter pairing, source grouping, placement quote, target-origin badge, staged exact-edit workflow, and traceability model all express the “Quiet Review Desk” described in [DESIGN.md](/home/anouar/Projects/linkmesh/linking-engine-frontend/DESIGN.md:1).

The deterministic detector found no issues for the target: 0 findings, exit status 0. Browser evidence was unavailable because no browser session was available, so narrow/desktop rendering was verified from implementation and the existing responsive tests rather than screenshots.

## Overall Impression

The panel has excellent product substance, but its decision hierarchy is inverted. The reviewer’s core question is “should this link move forward?”, while the panel gives the largest visual footprint to ranking internals and lifecycle history. The single biggest opportunity is to keep the decision brief and next action visible while making provenance progressively disclosed.

## What’s working

- Placement context quotes the source article and highlights the anchor, giving the reviewer real editorial evidence ([PlacementContextCard.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/components/suggestions/PlacementContextCard.tsx:70)).
- The workflow safely distinguishes selecting a link from approving its exact edit; the publication state copy is unusually explicit ([SuggestionPreview.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/components/suggestions/SuggestionPreview.tsx:185)).
- The panel has strong operational foundations: native buttons, 44px controls, focus trapping for the drawer, retry states, undo, theme tokens, and responsive layout tests ([SuggestionPreview.responsive.test.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/components/suggestions/SuggestionPreview.responsive.test.tsx:93)).

## Priority issues

### [P1] The queue preview hides “Review exact edit”

**Evidence:** The component only renders the approved-state action when onReviewPublication is supplied ([SuggestionPreview.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/components/suggestions/SuggestionPreview.tsx:161)). The queue page does not pass that prop ([ValidationPage.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/pages/ValidationPage.tsx:1286)), while SelectedPage does ([SelectedPage.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/pages/SelectedPage.tsx:432)).

**Why it matters:** An approved/selected suggestion opened from the main queue shows status and Undo, but not the next task. The reviewer must leave the queue and rediscover the item in Selected links.

**Fix:** Pass the same route action used by SelectedPage into the queue preview and row, or replace the optional callback with a single shared navigation contract. Add an integration test that opens an approved queue row and asserts the exact-edit action is visible.

### [P1] The decision controls are below the full evidence stack

**Evidence:** Actions render after PlacementContextCard, Target article, and the entire SuggestionTraceCard ([SuggestionPreview.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/components/suggestions/SuggestionPreview.tsx:88), [SuggestionPreview.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/components/suggestions/SuggestionPreview.tsx:126)).

**Why it matters:** In the narrow drawer, the primary action can be several scroll lengths below the first viewport. This is especially costly when trace events, external checks, graph context, and provider IDs are present.

**Fix:** Add a sticky decision footer inside the scroll container, or place a compact decision bar immediately after Target article and repeat only Undo/status at the bottom. Keep focus on the action after loading completes.

### [P1] Provenance overwhelms the editorial decision

**Evidence:** SuggestionTraceCard can show ranking metrics, external checks, graph context, IDs, and activity before the decision controls ([SuggestionTraceCard.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/components/suggestions/SuggestionTraceCard.tsx:283)).

**Why it matters:** The reviewer has to translate BM25, fusion position, graph adjustment, and provider IDs before reaching the simple source → placement → target decision. More evidence is present, but less of it is scannable.

**Fix:** Make the default panel a compact decision brief: placement, target, safety verdict, and action. Move ranking internals, trace IDs, and lifecycle history into a collapsed Technical provenance section; keep adverse checks open when they block publication.

### [P1] Workflow vocabulary changes at every stage

**Evidence:** The same transition is called Select, Select for review, Accepted, approved, and Review exact edit across the queue, panel, and trace ([SuggestionCard.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/components/suggestions/SuggestionCard.tsx:114), [SuggestionTraceCard.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/components/suggestions/SuggestionTraceCard.tsx:31)).

**Why it matters:** “Approved” can sound final even though exact-edit approval is still pending. A first-time reviewer may think the link is already scheduled or live.

**Fix:** Choose one canonical staging phrase, such as “Add to exact-edit review,” and reserve “Approved” for approval of the exact edit. Use the same phrase in buttons, status badges, notices, and lifecycle events.

### [P2] Keyboard and assistive-technology orientation is incomplete

**Evidence:** The drawer is correctly a dialog with focus trapping, but its accessible name is always the generic “Suggestion detail” ([SuggestionPreview.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/components/suggestions/SuggestionPreview.tsx:234)). The focusable selector also omits native summary elements even though ranking details use summary ([useFocusTrap.ts](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/hooks/useFocusTrap.ts:3), [SuggestionTraceCard.tsx](/home/anouar/Projects/linkmesh/linking-engine-frontend/src/components/suggestions/SuggestionTraceCard.tsx:165)).

**Why it matters:** Screen-reader users get weak orientation, and keyboard traversal around the disclosure is not explicitly covered by the trap logic.

**Fix:** Give the dialog a specific accessible name tied to source/target titles, include summary in the focusable model, and expose an optional keyboard help hint for repeated review.

## Persona red flags

**Alex — power user**

- Bulk actions help, but there is no visible keyboard operating model for opening, accepting, rejecting, or undoing.
- Long evidence scrolling delays the repeated decision loop.
- After a decision, the selected item can be replaced by a successor before Alex has inspected the success state.

**Jordan — first-timer**

- Source → placement → target is understandable.
- “Selected for review” sounds more final than the explanatory sentence suggests.
- BM25, semantic match, fusion position, graph adjustment, and trace ID are unexplained.
- On the main queue, an approved item does not reveal the exact-edit next step.

## Minor observations

- Publishing failures show raw provider/access errors; add a human-readable recovery action pointing to site credentials or access policy.
- The generic dialog name should include the item identity.
- DESIGN.md calls the product desktop-only, while the implementation supports a narrow overlay. Clarify whether this is narrow-window support or an officially supported mobile surface.

## Questions to consider

- If placement and target context drive the decision, why does the audit trail own more space than the decision brief?
- Is Select staging, approval, or queueing—and which single verb should survive the handoff?
- Should a successful decision silently replace the item under the operator’s cursor?
- What would you remove if the goal were confident decisions rather than maximum evidence exposure?
