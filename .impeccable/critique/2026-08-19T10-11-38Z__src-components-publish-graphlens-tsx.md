---
target: the site network graph
total_score: 21
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
timestamp: 2026-08-19T10-11-38Z
slug: src-components-publish-graphlens-tsx
---
Method: degraded single-context (spawn_agent unavailable in this session)

# GraphLens critique

Target: \`src/components/publish/GraphLens.tsx\`
Surface mode: Operate

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2/4 | Snapshot time and filter state are visible, but the map does not show what the current proposed batch changes or whether the graph is stale. |
| 2 | Match System / Real World | 2/4 | Domain terms are present, but the ring layout does not represent real link relationships; the spatial metaphor is misleading. |
| 3 | User Control and Freedom | 3/4 | Filters, selection, zoom, reset, and clear selection exist; there is no search, fit-to-selection, pan, or focused neighborhood. |
| 4 | Consistency and Standards | 3/4 | Controls and tokens fit the dashboard system, but node shapes, colors, and line meaning are not explained in a visible legend. |
| 5 | Error Prevention | 2/4 | The map is read-only, but it does not connect structural warnings to the exact approval decision or warn when a full graph becomes too large to interpret. |
| 6 | Recognition Rather Than Recall | 2/4 | Counts are visible, but labels collide and status meaning is partly hidden in aria text rather than shown at the point of use. |
| 7 | Flexibility and Efficiency | 2/4 | Basic filters and zoom are available, but no search, keyboard navigation between pages, fit-to-focus, or efficient review path exists. |
| 8 | Aesthetic and Minimalist Design | 1/4 | The supplied screenshot is visually noisy: dozens of truncated labels compete with each other while the graph’s key relationship remains unclear. |
| 9 | Error Recovery | 2/4 | Parent-level load failure and empty states exist, but there is no graceful scale/truncation state for a large graph and no recovery path from a confusing view. |
| 10 | Help and Documentation | 2/4 | The introductory sentence helps, but it does not explain the four signals, the shapes, edge direction, or what action a reviewer should take. |
| **Total** |  | **21/40** | **Acceptable: significant improvements are needed before the graph feels trustworthy and useful.** |

## Design Specificity Verdict

The component is product-authored in its vocabulary, semantic tokens, snapshot timestamp, and structural signals. It is not yet product-authored in its visual composition. The current rings make it feel like a generic constellation widget that could be dropped into another dashboard unchanged. That conflicts with LinkMesh's documented "Quiet Review Desk": the graph should reduce editorial uncertainty, not become a second noisy surface to decode.

## Overall Impression

The graph has the right ingredients but the wrong default question. It opens a complete site map, lays pages into status rings, and prints many labels at once. A reviewer needs to know whether this exact suggested link improves the site structure. The single biggest opportunity is to make the selected suggestion or selected batch the visual center of the graph, with a small, bounded neighborhood and a clear before/after explanation.

## What's Working

1. The five structural signals are explicit controls with counts, and the node markup includes text labels and accessible names rather than relying on color alone.
2. Selection, zoom, reset, clear-selection, empty-state, and snapshot-time affordances give the component a real interaction model.
3. The graph is placed as a read-only inspection step beside exact publication review. A graph loading failure does not block the exact edit review, which is the correct safety boundary.

## Priority Issues

### [P1] Label collision turns the map into noise

**Why it matters:** In the supplied screenshot, orphan labels stack on top of one another near the top and bottom of the canvas. The text is truncated, but still large enough to collide. The user cannot reliably identify a page or compare relationships.

**Fix:** Hide labels by default except for the focused node, the proposed source and target, and a small number of filtered results. Add a search/focus control and move full titles into a stable side detail panel. If labels remain on-canvas, use collision-aware placement and a deliberate "Show labels" mode.

**Suggested command:** \`$impeccable distill\` followed by \`$impeccable layout\`

### [P1] The graph is not scoped to the approval decision

**Why it matters:** The current component receives the complete active-site network, so the reviewer must mentally connect a giant map to the exact article pair being approved. This creates context switching and makes the graph feel detached from publication review.

**Fix:** Open the graph with the selected plan/suggestion IDs. Use the existing backend \`POST /sites/{site_id}/graph/neighborhood\` contract, which already returns focus nodes, proposed edges, one-hop neighbors, a 48-node cap, and warnings. Make that bounded neighborhood the default. Put the full-site explorer behind a secondary action.

**Suggested command:** \`$impeccable shape\`

### [P1] Position communicates status, not topology

**Why it matters:** \`layoutNodes\` places nodes on fixed status rings. A node's position therefore says "orphan" or "hub", but not which pages it links to. The lines become a tangle with weak explanatory value, especially when the graph is dense.

**Fix:** For the bounded review view, place the proposed source and target in the center, show the proposed edge as a distinct directional path, and arrange one-hop context around them. Use arrows or another non-color direction cue. Keep status as a secondary badge/shape, not the spatial layout.

**Suggested command:** \`$impeccable layout\`

### [P2] Status meaning and next action are under-explained

**Why it matters:** "Orphan", "underlinked", "hub", and "saturated" are meaningful to an SEO specialist but not self-explanatory to every reviewer. The visible controls give counts, while the richer descriptions live in aria labels. The screenshot offers no compact legend or takeaway.

**Fix:** Add a visible legend using shape plus text plus a one-line explanation. Beside the focused suggestion, state the consequence in plain language, for example: "This new link would connect an orphan page" or "This target already receives many links." Surface any warning before approval, not only as a color or ring.

**Suggested command:** \`$impeccable clarify\`

### [P2] Full-graph scale has no guardrail

**Why it matters:** The backend returns every active page and every edge. The component renders all of them in one SVG and only changes scale with zoom; it does not offer search, fit-to-selection, pan, clustering, or a clear truncation state. The screenshot is an early warning that larger sites will become unreadable and potentially expensive to render.

**Fix:** Default to the bounded neighborhood. For full-site mode, aggregate or cluster nodes, cap visible labels and edges, add search plus fit-to-focus, and explain when the view is summarized. Consider a canvas/WebGL renderer only if full-site exploration is a real product requirement after the bounded view is proven.

**Suggested command:** \`$impeccable optimize\`

## Cognitive Load

The supplied screenshot fails 6 of 8 checks: single focus, chunking, visual hierarchy, one thing at a time, minimal choices, and progressive disclosure. Grouping is present around the controls, and working memory is helped slightly by the filter counts, but the default view still asks the reviewer to interpret five filters, zoom controls, many labels, statuses, and edges simultaneously. This is high cognitive load and should be treated as a structural issue, not a color-tuning issue.

## Persona Red Flags

### Alex (Power User)

Alex can filter and zoom, but cannot jump directly to the source/target of the current approval. There is no search, fit-to-selection, next-node navigation, or shortcut for moving through focused pages. On a large site, Alex must visually hunt through a full network and will likely abandon the graph as a slow detour.

### Sam (Accessibility-Dependent User)

The SVG nodes are keyboard-focusable and have descriptive aria labels, which is a good foundation. However, every active page can become a separate tab stop, edge direction is not exposed as a readable relationship, and the visible explanation of status meaning is missing. The source supports partial accessibility, but a real screen-reader and keyboard pass is still required.

### Riley (Stress Tester)

The full-network endpoint has no visual cap, while the UI has no "showing X of Y" or summarized-state message. Long titles are truncated on the map and only become fully readable after selecting a node. Empty-edge handling exists, but large dense graphs, stale snapshots, and mixed batches are not explained in the view.

## Minor Observations

- Lines have no arrowheads, so link direction is not visually available.
- The "All pages" default makes every edge and every visible orphan label compete at once; the default should be a decision-focused subset.
- The timestamp says when the snapshot was computed, but there is no visible graph version or refresh/staleness explanation.
- The zoom controls change SVG dimensions but do not provide a fit-to-content or fit-to-selection action.
- The screenshot's dark surface makes the subdued edge strokes recede while the labels remain high contrast, increasing the text-to-structure imbalance.

## Questions to Consider

- What should the graph answer first: "Why approve this exact link?" or "Where are the site's structural risks?" Those are different views and should not share the same default.
- Would a bounded 12-48 node neighborhood with a clear proposed edge be more useful than a complete 500-node map?
- Should the full-site map remain an advanced explorer, rather than appearing inside the approval path?
