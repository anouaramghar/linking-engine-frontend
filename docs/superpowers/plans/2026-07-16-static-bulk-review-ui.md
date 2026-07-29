# Static Bulk Review UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive, frontend-only bulk suggestion review prototype with clear queued-versus-published language and no review mutation requests.

**Architecture:** `ValidationPage` will read suggestions once, layer an in-memory status override map over them, and pass calculated filters and target counts to a focused control component. Pure functions in `suggestionReview.ts` will own filtering, threshold selection, and count deltas so the behavior is deterministic and testable without the backend.

**Tech Stack:** React 19, TypeScript 5.6, Vite 7, Tailwind CSS 3.4, Vitest, Testing Library.

## Global Constraints

- Change files only in `linking-engine-frontend`.
- Keep suggestion reads from the existing frontend data source.
- Handle individual and bulk review interactions in browser memory only.
- Reset all locally simulated review changes when the page reloads.
- Do not call the single-review or bulk-review mutation endpoints from the review queue.
- Do not change backend routes, schemas, models, tasks, or tests.
- Use `All methods`, `Baseline`, and `GNN` as method choices.
- Initialize the score threshold to `80` and clamp it to the inclusive range 0-100.
- Accept pending suggestions with scores greater than or equal to the threshold.
- Reject pending suggestions with scores strictly below the threshold.
- Render `approved` as `Queued for publish` and `applied` as `Published live`.
- Render the scheduling sentence exactly as `Scheduled re-crawls run through RQ.`

---

## File Structure

- Create `src/lib/suggestionReview.ts` for pure queue filtering, local status resolution, threshold targeting, and count adjustment.
- Create `src/lib/suggestionReview.test.ts` for the rule-level test suite.
- Modify `src/components/suggestions/BulkActions.tsx` to render status filters, method controls, threshold input, target counts, and confirmation UI.
- Create `src/components/suggestions/BulkActions.test.tsx` for control rendering and interaction coverage.
- Modify `src/pages/ValidationPage.tsx` to replace mutation hooks with browser-local state and wire the bulk controls.
- Create `src/pages/ValidationPage.test.tsx` for local interaction and no-mutation coverage.
- Modify `src/lib/utils.ts` to centralize explicit status labels, publication messages, and the RQ sentence.
- Modify `src/components/suggestions/SuggestionPreview.tsx` to show the explicit publication callout.
- Create `src/components/suggestions/SuggestionPreview.test.tsx` for queued and published states.
- Modify `src/pages/SitesPage.tsx` to consume the exact RQ copy.
- Create `src/pages/SitesPage.test.tsx` to verify the scheduler sentence rendered by the page.
- Modify `package.json`, `package-lock.json`, and create `vitest.config.ts` for the frontend test harness.

---

### Task 1: Pure Local Review Rules

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/suggestionReview.test.ts`
- Create: `src/lib/suggestionReview.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `Suggestion` and `SuggestionStatus` from `src/types/suggestion.ts`.
- Produces: `SuggestionMethodFilter`, `StatusFilter`, `StatusOverrides`, `BulkReviewAction`, `BulkTargetRule`, `clampThreshold`, `resolveSuggestionStatuses`, `filterSuggestions`, `getBulkTargets`, and `adjustedStatusCount`.

- [ ] **Step 1: Install and configure the test harness**

Run:

```powershell
npm install --save-dev vitest jsdom @testing-library/react @testing-library/user-event
```

Add the script below to `package.json`:

```json
"test": "vitest run"
```

Create `vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
});
```

- [ ] **Step 2: Write the failing rule tests**

Create `src/lib/suggestionReview.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Suggestion } from "../types/suggestion";
import {
  adjustedStatusCount,
  clampThreshold,
  filterSuggestions,
  getBulkTargets,
  resolveSuggestionStatuses,
} from "./suggestionReview";

const suggestion = (id: number, overrides: Partial<Suggestion> = {}): Suggestion => ({
  id,
  site_id: 1,
  source_article: { id: id * 10, title: `Source ${id}`, url: `/source-${id}` },
  target_article: { id: id * 10 + 1, title: `Target ${id}`, url: `/target-${id}` },
  method: "baseline_cosine",
  score: 0.8,
  status: "pending",
  anchor_text: "anchor",
  external_url: null,
  external_title: null,
  trust_score: null,
  context_before: "before ",
  context_after: " after",
  created_at: "2026-07-16T10:00:00Z",
  ...overrides,
});

describe("clampThreshold", () => {
  it.each([
    [-20, 0],
    [65, 65],
    [140, 100],
  ])("clamps %s to %s", (input, expected) => {
    expect(clampThreshold(input)).toBe(expected);
  });
});

describe("resolveSuggestionStatuses", () => {
  it("uses local status overrides without mutating fetched suggestions", () => {
    const fetched = [suggestion(1), suggestion(2, { status: "applied" })];
    const resolved = resolveSuggestionStatuses(fetched, { 1: "approved" });

    expect(resolved.map((item) => item.status)).toEqual(["approved", "applied"]);
    expect(fetched[0].status).toBe("pending");
  });
});

describe("filterSuggestions", () => {
  it("filters by site, status, and method together", () => {
    const suggestions = [
      suggestion(1),
      suggestion(2, { method: "gnn_graphsage" }),
      suggestion(3, { site_id: 2, method: "gnn_graphsage" }),
      suggestion(4, { status: "approved", method: "gnn_graphsage" }),
    ];

    expect(
      filterSuggestions(suggestions, {
        siteId: 1,
        status: "pending",
        method: "gnn_graphsage",
      }).map((item) => item.id),
    ).toEqual([2]);
  });
});

describe("getBulkTargets", () => {
  const suggestions = [
    suggestion(1, { score: 0.8 }),
    suggestion(2, { score: 0.799 }),
    suggestion(3, { score: 0.95, method: "gnn_graphsage" }),
    suggestion(4, { score: 0.9, status: "approved" }),
    suggestion(5, { score: 0.9, site_id: 2 }),
  ];

  it("accepts pending suggestions at and above the inclusive threshold", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "approve",
        siteId: 1,
        method: "baseline_cosine",
        threshold: 80,
      }).map((item) => item.id),
    ).toEqual([1]);
  });

  it("rejects pending suggestions strictly below the threshold", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "reject",
        siteId: 1,
        method: "baseline_cosine",
        threshold: 80,
      }).map((item) => item.id),
    ).toEqual([2]);
  });

  it("never targets a non-pending suggestion", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "approve",
        siteId: 0,
        method: "all",
        threshold: 0,
      }).map((item) => item.id),
    ).not.toContain(4);
  });
});

describe("adjustedStatusCount", () => {
  it("applies local status deltas to backend aggregate counts", () => {
    const fetched = [suggestion(1), suggestion(2), suggestion(3, { site_id: 2 })];
    const overrides = { 1: "approved", 3: "rejected" } as const;

    expect(adjustedStatusCount(10, fetched, overrides, "pending", 1)).toBe(9);
    expect(adjustedStatusCount(4, fetched, overrides, "approved", 1)).toBe(5);
    expect(adjustedStatusCount(20, fetched, overrides, "pending", 0)).toBe(18);
  });
});
```

- [ ] **Step 3: Run the tests and verify the missing-module failure**

Run:

```powershell
npm test -- src/lib/suggestionReview.test.ts
```

Expected: FAIL because `./suggestionReview` does not exist.

- [ ] **Step 4: Implement the pure review rules**

Create `src/lib/suggestionReview.ts`:

```ts
import type { Suggestion, SuggestionStatus } from "../types/suggestion";

export type SuggestionMethodFilter = "all" | "baseline_cosine" | "gnn_graphsage";
export type StatusFilter = "all" | SuggestionStatus;
export type StatusOverrides = Record<number, SuggestionStatus>;
export type BulkReviewAction = "approve" | "reject";

export interface SuggestionQueueFilters {
  siteId: number;
  status: StatusFilter;
  method: SuggestionMethodFilter;
}

export interface BulkTargetRule {
  action: BulkReviewAction;
  siteId: number;
  method: SuggestionMethodFilter;
  threshold: number;
}

export const clampThreshold = (value: number) =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0));

const matchesSite = (suggestion: Suggestion, siteId: number) =>
  siteId === 0 || suggestion.site_id === siteId;

const matchesMethod = (suggestion: Suggestion, method: SuggestionMethodFilter) =>
  method === "all" || suggestion.method === method;

export const resolveSuggestionStatuses = (
  suggestions: Suggestion[],
  overrides: StatusOverrides,
) =>
  suggestions.map((suggestion) => {
    const status = overrides[suggestion.id];
    return status && status !== suggestion.status ? { ...suggestion, status } : suggestion;
  });

export const filterSuggestions = (
  suggestions: Suggestion[],
  filters: SuggestionQueueFilters,
) =>
  suggestions.filter(
    (suggestion) =>
      matchesSite(suggestion, filters.siteId) &&
      matchesMethod(suggestion, filters.method) &&
      (filters.status === "all" || suggestion.status === filters.status),
  );

export const getBulkTargets = (suggestions: Suggestion[], rule: BulkTargetRule) => {
  const threshold = clampThreshold(rule.threshold) / 100;
  return suggestions.filter((suggestion) => {
    if (
      suggestion.status !== "pending" ||
      !matchesSite(suggestion, rule.siteId) ||
      !matchesMethod(suggestion, rule.method)
    ) {
      return false;
    }
    return rule.action === "approve"
      ? suggestion.score >= threshold
      : suggestion.score < threshold;
  });
};

export const adjustedStatusCount = (
  baseCount: number,
  fetchedSuggestions: Suggestion[],
  overrides: StatusOverrides,
  status: SuggestionStatus,
  siteId: number,
) => {
  const adjusted = fetchedSuggestions.reduce((count, suggestion) => {
    if (!matchesSite(suggestion, siteId)) return count;
    const override = overrides[suggestion.id];
    if (!override || override === suggestion.status) return count;
    if (suggestion.status === status) count -= 1;
    if (override === status) count += 1;
    return count;
  }, baseCount);
  return Math.max(0, adjusted);
};
```

- [ ] **Step 5: Run the rule tests and full test command**

Run:

```powershell
npm test -- src/lib/suggestionReview.test.ts
npm test
```

Expected: PASS with all rule tests green.

- [ ] **Step 6: Commit the rule layer**

```powershell
git add package.json package-lock.json vitest.config.ts src/lib/suggestionReview.ts src/lib/suggestionReview.test.ts
git commit -m "test: add local suggestion review rules"
```

---

### Task 2: Bulk Review Controls

**Files:**
- Create: `src/components/suggestions/BulkActions.test.tsx`
- Modify: `src/components/suggestions/BulkActions.tsx`

**Interfaces:**
- Consumes: `BulkReviewAction` and `SuggestionMethodFilter` from `src/lib/suggestionReview.ts`.
- Produces: `BulkConfirmation` and a `BulkActions` component whose callbacks report status selection, method selection, threshold changes, requested action, confirmation, and cancellation.

- [ ] **Step 1: Write failing component tests**

Create `src/components/suggestions/BulkActions.test.tsx` with tests that:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BulkActions from "./BulkActions";

afterEach(cleanup);

const baseProps = () => ({
  chips: [{ key: "pending", label: "Pending review", count: 4 }],
  active: "pending",
  onSelect: vi.fn(),
  method: "all" as const,
  onMethodChange: vi.fn(),
  threshold: 80,
  onThresholdChange: vi.fn(),
  acceptCount: 2,
  rejectCount: 1,
  confirmation: null,
  onRequest: vi.fn(),
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
});

describe("BulkActions", () => {
  it("renders method, threshold, and target counts", () => {
    render(<BulkActions {...baseProps()} />);

    expect(screen.getByRole("button", { name: "All methods" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Score threshold") as HTMLInputElement).value).toBe("80");
    expect(screen.getByRole("button", { name: /Accept.*2/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Reject.*1/ })).not.toBeNull();
  });

  it("reports filter and bulk-action intents", () => {
    const props = baseProps();
    render(<BulkActions {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "GNN" }));
    fireEvent.change(screen.getByLabelText("Score threshold"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));

    expect(props.onMethodChange).toHaveBeenCalledWith("gnn_graphsage");
    expect(props.onThresholdChange).toHaveBeenCalledWith(75);
    expect(props.onRequest).toHaveBeenCalledWith("approve");
  });

  it("disables empty actions and renders confirmation details", () => {
    const props = baseProps();
    render(
      <BulkActions
        {...props}
        acceptCount={0}
        confirmation={{
          action: "reject",
          count: 3,
          threshold: 80,
          methodLabel: "Baseline",
          siteLabel: "Example site",
        }}
      />,
    );

    expect((screen.getByRole("button", { name: /Accept/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alertdialog").textContent).toContain("3 pending suggestions");
    expect(screen.getByRole("alertdialog").textContent).toContain("Example site");
  });
});
```

- [ ] **Step 2: Run the component test and verify the prop/API failure**

Run:

```powershell
npm test -- src/components/suggestions/BulkActions.test.tsx
```

Expected: FAIL because the current component does not accept or render the new controls.

- [ ] **Step 3: Implement the compact control and confirmation UI**

Replace `src/components/suggestions/BulkActions.tsx` with:

```tsx
import type {
  BulkReviewAction,
  SuggestionMethodFilter,
} from "../../lib/suggestionReview";

interface Chip {
  key: string;
  label: string;
  count: number;
}

export interface BulkConfirmation {
  action: BulkReviewAction;
  count: number;
  threshold: number;
  methodLabel: string;
  siteLabel: string;
}

interface Props {
  chips: Chip[];
  active: string;
  onSelect: (key: string) => void;
  method: SuggestionMethodFilter;
  onMethodChange: (method: SuggestionMethodFilter) => void;
  threshold: number;
  onThresholdChange: (threshold: number) => void;
  acceptCount: number;
  rejectCount: number;
  confirmation: BulkConfirmation | null;
  onRequest: (action: BulkReviewAction) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const METHODS: { key: SuggestionMethodFilter; label: string }[] = [
  { key: "all", label: "All methods" },
  { key: "baseline_cosine", label: "Baseline" },
  { key: "gnn_graphsage", label: "GNN" },
];

export default function BulkActions({
  chips,
  active,
  onSelect,
  method,
  onMethodChange,
  threshold,
  onThresholdChange,
  acceptCount,
  rejectCount,
  confirmation,
  onRequest,
  onConfirm,
  onCancel,
}: Props) {
  const comparison = confirmation?.action === "approve"
    ? `at least ${confirmation.threshold}%`
    : `below ${confirmation?.threshold}%`;
  const verb = confirmation?.action === "approve" ? "Accept" : "Reject";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => onSelect(chip.key)}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${
              active === chip.key
                ? "border-stone-800 bg-stone-800 text-white"
                : "border-stone-300 text-stone-950 hover:border-stone-950"
            }`}
          >
            {chip.label} · {chip.count}
          </button>
        ))}
      </div>

      <div
        aria-label="Bulk review controls"
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3"
      >
        <div className="flex items-center gap-1 rounded-full bg-stone-100 p-1">
          {METHODS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={method === option.key}
              onClick={() => onMethodChange(option.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                method === option.key
                  ? "bg-white text-stone-950 shadow-sm"
                  : "text-stone-500 hover:text-stone-950"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-stone-600">
          Score threshold
          <span className="flex items-center rounded-full border border-stone-300 bg-white px-3 py-1.5">
            <input
              aria-label="Score threshold"
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(event) => onThresholdChange(Number(event.target.value))}
              className="w-12 bg-transparent text-right font-medium text-stone-950 outline-none"
            />
            <span className="text-stone-400">%</span>
          </span>
        </label>

        <div className="min-w-4 flex-1" />
        <button
          type="button"
          disabled={acceptCount === 0}
          onClick={() => onRequest("approve")}
          className="rounded-full border border-stone-800 bg-stone-800 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-200 disabled:text-stone-400"
        >
          Accept &gt;= {threshold}% · {acceptCount}
        </button>
        <button
          type="button"
          disabled={rejectCount === 0}
          onClick={() => onRequest("reject")}
          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-950 disabled:cursor-not-allowed disabled:text-stone-300"
        >
          Reject &lt; {threshold}% · {rejectCount}
        </button>
      </div>

      {confirmation && (
        <div
          role="alertdialog"
          aria-label="Confirm bulk review"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <div className="min-w-0 flex-1 text-sm text-stone-700">
            <div className="font-medium text-stone-950">
              {verb} {confirmation.count} pending suggestion
              {confirmation.count === 1 ? "" : "s"}?
            </div>
            <div className="mt-0.5 text-xs text-stone-500">
              {confirmation.methodLabel} · {confirmation.siteLabel} · {comparison}. This preview
              changes browser state only.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-stone-800 px-3 py-1.5 text-sm font-medium text-white"
          >
            Confirm {confirmation.action === "approve" ? "accept" : "reject"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the control tests**

Run:

```powershell
npm test -- src/components/suggestions/BulkActions.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the control component**

```powershell
git add src/components/suggestions/BulkActions.tsx src/components/suggestions/BulkActions.test.tsx
git commit -m "feat: add static bulk review controls"
```

---

### Task 3: Browser-Local Queue State

**Files:**
- Create: `src/pages/ValidationPage.test.tsx`
- Modify: `src/pages/ValidationPage.tsx`

**Interfaces:**
- Consumes: every Task 1 helper and the Task 2 `BulkActions` props.
- Produces: a queue page where reads still use `useSuggestions`, while individual and bulk decisions update only `StatusOverrides` in React state.

- [ ] **Step 1: Write a failing page integration test**

Create `src/pages/ValidationPage.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Suggestion } from "../types/suggestion";
import ValidationPage from "./ValidationPage";

const mocks = vi.hoisted(() => ({
  suggestions: [] as Suggestion[],
  reviewMutate: vi.fn(),
  bulkMutate: vi.fn(),
}));

vi.mock("../hooks/useSuggestions", () => ({
  useSuggestions: () => ({ data: mocks.suggestions, isLoading: false }),
  useReview: () => ({ mutate: mocks.reviewMutate }),
  useBulkReview: () => ({ mutate: mocks.bulkMutate }),
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => ({
    data: [
      {
        id: 1,
        name: "Example site",
        base_url: "https://example.com",
        platform: "wordpress",
        crawl_frequency: "daily",
        created_at: "2026-07-16T10:00:00Z",
        last_ingestion_status: "completed",
      },
    ],
  }),
  useStats: () => ({
    data: [
      {
        site_id: 1,
        articles: 10,
        internal_links: 20,
        orphan_articles: 2,
        suggestions_by_status: { pending: 3, approved: 0, applied: 1, rejected: 0 },
        suggestions_by_method: { baseline_cosine: 3, gnn_graphsage: 1 },
        approval_rate: null,
      },
    ],
  }),
}));

const suggestion = (id: number, overrides: Partial<Suggestion> = {}): Suggestion => ({
  id,
  site_id: 1,
  source_article: { id: id * 10, title: `Source ${id}`, url: `/source-${id}` },
  target_article: { id: id * 10 + 1, title: `Target ${id}`, url: `/target-${id}` },
  method: "baseline_cosine",
  score: 0.8,
  status: "pending",
  anchor_text: "anchor",
  external_url: null,
  external_title: null,
  trust_score: null,
  context_before: "before ",
  context_after: " after",
  created_at: "2026-07-16T10:00:00Z",
  ...overrides,
});

beforeEach(() => {
  mocks.suggestions.splice(
    0,
    mocks.suggestions.length,
    suggestion(1, { score: 0.8 }),
    suggestion(2, { score: 0.79 }),
    suggestion(3, { score: 0.95, method: "gnn_graphsage" }),
    suggestion(4, { score: 0.9, status: "applied" }),
  );
  mocks.reviewMutate.mockClear();
  mocks.bulkMutate.mockClear();
});

afterEach(cleanup);

describe("ValidationPage static review state", () => {
  it("applies a confirmed bulk action locally without review mutations", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: "Baseline" }));
    await user.click(screen.getByRole("button", { name: /Accept.*1/ }));
    expect(screen.getByRole("alertdialog").textContent).toContain("1 pending suggestion");
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    expect(screen.getByRole("status").textContent).toContain("1 suggestion queued for publish");
    await user.click(screen.getByRole("button", { name: /Queued for publish.*1/ }));
    expect(screen.getByText("Source 1")).not.toBeNull();
    expect(mocks.reviewMutate).not.toHaveBeenCalled();
    expect(mocks.bulkMutate).not.toHaveBeenCalled();
  });

  it("filters the loaded cards by suggestion method", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: "GNN" }));

    expect(screen.getByText("Source 3")).not.toBeNull();
    expect(screen.queryByText("Source 1")).toBeNull();
    expect(screen.queryByText("Source 2")).toBeNull();
  });

  it("cancels a bulk action without changing local statuses", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: "Baseline" }));
    await user.click(screen.getByRole("button", { name: /Accept.*1/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Source 1")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Queued for publish.*0/ })).not.toBeNull();
  });

  it("keeps an individual decision local", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getAllByRole("button", { name: "Accept" })[0]);
    await user.click(screen.getByRole("button", { name: /Queued for publish.*1/ }));

    expect(screen.getByText("Source 1")).not.toBeNull();
    expect(mocks.reviewMutate).not.toHaveBeenCalled();
    expect(mocks.bulkMutate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the page test and verify it fails on current mutation behavior**

Run:

```powershell
npm test -- src/pages/ValidationPage.test.tsx
```

Expected: FAIL because the page has no method/threshold controls and currently calls `useReview`.

- [ ] **Step 3: Replace mutation state with local state**

Replace `src/pages/ValidationPage.tsx` with:

```tsx
import { useMemo, useState } from "react";

import PageHeader from "../components/PageHeader";
import BulkActions from "../components/suggestions/BulkActions";
import type { BulkConfirmation } from "../components/suggestions/BulkActions";
import SuggestionCard from "../components/suggestions/SuggestionCard";
import SuggestionPreview from "../components/suggestions/SuggestionPreview";
import { useSuggestions } from "../hooks/useSuggestions";
import { useSites, useStats } from "../hooks/useSites";
import {
  adjustedStatusCount,
  clampThreshold,
  filterSuggestions,
  getBulkTargets,
  resolveSuggestionStatuses,
} from "../lib/suggestionReview";
import type {
  BulkReviewAction,
  StatusFilter,
  StatusOverrides,
  SuggestionMethodFilter,
} from "../lib/suggestionReview";
import type { SuggestionStatus } from "../types/suggestion";

const CHIP_DEFS: { key: SuggestionStatus; label: string }[] = [
  { key: "pending", label: "Pending review" },
  { key: "approved", label: "Queued for publish" },
  { key: "applied", label: "Published live" },
  { key: "rejected", label: "Rejected" },
];

const METHOD_LABELS: Record<SuggestionMethodFilter, string> = {
  all: "All methods",
  baseline_cosine: "Baseline",
  gnn_graphsage: "GNN",
};

interface ConfirmationState extends BulkConfirmation {
  ids: number[];
}

export default function ValidationPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [siteFilter, setSiteFilter] = useState(0);
  const [methodFilter, setMethodFilter] = useState<SuggestionMethodFilter>("all");
  const [threshold, setThreshold] = useState(80);
  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [notice, setNotice] = useState("");

  const { data: sites } = useSites();
  const { data: stats } = useStats();
  const { data: sourceSuggestions = [], isLoading } = useSuggestions({ limit: 100 });

  const resolvedSuggestions = useMemo(
    () => resolveSuggestionStatuses(sourceSuggestions, statusOverrides),
    [sourceSuggestions, statusOverrides],
  );
  const suggestions = useMemo(
    () =>
      filterSuggestions(resolvedSuggestions, {
        siteId: siteFilter,
        status: statusFilter,
        method: methodFilter,
      }),
    [methodFilter, resolvedSuggestions, siteFilter, statusFilter],
  );

  const siteName = (id: number) => sites?.find((site) => site.id === id)?.name ?? `site ${id}`;
  const baseCountBy = (status: SuggestionStatus, siteId: number) =>
    stats
      ?.filter((site) => siteId === 0 || site.site_id === siteId)
      .reduce((count, site) => count + (site.suggestions_by_status[status] ?? 0), 0) ?? 0;
  const countBy = (status: SuggestionStatus, siteId = siteFilter) =>
    adjustedStatusCount(
      baseCountBy(status, siteId),
      sourceSuggestions,
      statusOverrides,
      status,
      siteId,
    );
  const chips = [
    ...CHIP_DEFS.map((chip) => ({ ...chip, count: countBy(chip.key) })),
    {
      key: "all",
      label: "All",
      count: CHIP_DEFS.reduce((count, chip) => count + countBy(chip.key), 0),
    },
  ];
  const pendingTotal = countBy("pending", 0);

  const acceptTargets = getBulkTargets(resolvedSuggestions, {
    action: "approve",
    siteId: siteFilter,
    method: methodFilter,
    threshold,
  });
  const rejectTargets = getBulkTargets(resolvedSuggestions, {
    action: "reject",
    siteId: siteFilter,
    method: methodFilter,
    threshold,
  });

  const setLocalStatuses = (ids: number[], status: SuggestionStatus, message: string) => {
    setStatusOverrides((current) => {
      const next = { ...current };
      ids.forEach((id) => {
        next[id] = status;
      });
      return next;
    });
    setNotice(message);
  };

  const decide = (id: number, status: "approved" | "rejected" | "pending") => {
    const messages: Record<typeof status, string> = {
      approved: "1 suggestion queued for publish.",
      rejected: "1 suggestion rejected.",
      pending: "1 suggestion returned to pending review.",
    };
    setLocalStatuses([id], status, messages[status]);
  };

  const requestBulk = (action: BulkReviewAction) => {
    const targets = action === "approve" ? acceptTargets : rejectTargets;
    setConfirmation({
      action,
      ids: targets.map((suggestion) => suggestion.id),
      count: targets.length,
      threshold,
      methodLabel: METHOD_LABELS[methodFilter],
      siteLabel: siteFilter === 0 ? "All sites" : siteName(siteFilter),
    });
  };

  const confirmBulk = () => {
    if (!confirmation) return;
    const status = confirmation.action === "approve" ? "approved" : "rejected";
    const noun = confirmation.count === 1 ? "suggestion" : "suggestions";
    const message = confirmation.action === "approve"
      ? `${confirmation.count} ${noun} queued for publish.`
      : `${confirmation.count} ${noun} rejected.`;
    setLocalStatuses(confirmation.ids, status, message);
    setConfirmation(null);
  };

  const selected = resolvedSuggestions.find((suggestion) => suggestion.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Link suggestions"
        sub={`${pendingTotal} pending across ${sites?.length ?? 0} sites · queued links are not live until published`}
      />
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="mb-4 flex items-start gap-3">
            <BulkActions
              chips={chips}
              active={statusFilter}
              onSelect={(status) => {
                setStatusFilter(status as StatusFilter);
                setConfirmation(null);
              }}
              method={methodFilter}
              onMethodChange={(method) => {
                setMethodFilter(method);
                setConfirmation(null);
              }}
              threshold={threshold}
              onThresholdChange={(value) => {
                setThreshold(clampThreshold(value));
                setConfirmation(null);
              }}
              acceptCount={acceptTargets.length}
              rejectCount={rejectTargets.length}
              confirmation={confirmation}
              onRequest={requestBulk}
              onConfirm={confirmBulk}
              onCancel={() => setConfirmation(null)}
            />
            <select
              value={siteFilter}
              onChange={(event) => {
                setSiteFilter(Number(event.target.value));
                setConfirmation(null);
              }}
              className="cursor-pointer rounded-full border border-stone-300 bg-white px-3.5 py-2 text-sm"
            >
              <option value={0}>All sites</option>
              {sites?.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          {notice && (
            <div role="status" className="mb-3 rounded-xl bg-stone-800 px-4 py-2 text-sm text-white">
              {notice}
            </div>
          )}

          <div className="flex flex-col gap-2.5 pb-6">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                siteName={siteName(suggestion.site_id)}
                selected={suggestion.id === selectedId}
                onOpen={() => setSelectedId(suggestion.id)}
                onAccept={() => decide(suggestion.id, "approved")}
                onReject={() => decide(suggestion.id, "rejected")}
                onUndo={() => decide(suggestion.id, "pending")}
              />
            ))}
            {!isLoading && suggestions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-14 text-center text-[15px] text-stone-500">
                No suggestions match these filters. Run an analysis from the Sites page, or try
                another status, method, or site.
              </div>
            )}
          </div>
        </div>

        {selected && (
          <SuggestionPreview
            suggestion={selected}
            siteName={siteName(selected.site_id)}
            onClose={() => setSelectedId(null)}
            onAccept={() => decide(selected.id, "approved")}
            onReject={() => decide(selected.id, "rejected")}
          />
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run the page and full test suites**

Run:

```powershell
npm test -- src/pages/ValidationPage.test.tsx
npm test
```

Expected: PASS and mutation spies remain unused.

- [ ] **Step 5: Commit the local-state integration**

```powershell
git add src/pages/ValidationPage.tsx src/pages/ValidationPage.test.tsx
git commit -m "feat: keep queue reviews in browser state"
```

---

### Task 4: Publication and Scheduler Copy

**Files:**
- Modify: `src/lib/utils.ts`
- Modify: `src/components/suggestions/SuggestionCard.tsx`
- Modify: `src/components/suggestions/SuggestionPreview.tsx`
- Create: `src/components/suggestions/SuggestionPreview.test.tsx`
- Modify: `src/pages/SitesPage.tsx`
- Create: `src/pages/SitesPage.test.tsx`

**Interfaces:**
- Consumes: `SuggestionStatus` from `src/types/suggestion.ts`.
- Produces: `STATUS_META` labels, `PUBLICATION_STATUS_MESSAGE`, and `RQ_SCHEDULING_COPY` used by queue and site UI.

- [ ] **Step 1: Write failing status-copy tests**

Create `src/components/suggestions/SuggestionPreview.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RQ_SCHEDULING_COPY } from "../../lib/utils";
import type { Suggestion } from "../../types/suggestion";
import SuggestionPreview from "./SuggestionPreview";

afterEach(cleanup);

const suggestion = (status: Suggestion["status"]): Suggestion => ({
  id: 1,
  site_id: 1,
  source_article: { id: 10, title: "Source", url: "https://example.com/source" },
  target_article: { id: 11, title: "Target", url: "https://example.com/target" },
  method: "baseline_cosine",
  score: 0.9,
  status,
  anchor_text: "anchor",
  external_url: null,
  external_title: null,
  trust_score: null,
  context_before: "before ",
  context_after: " after",
  created_at: "2026-07-16T10:00:00Z",
});

const renderPreview = (status: Suggestion["status"]) =>
  render(
    <SuggestionPreview
      suggestion={suggestion(status)}
      siteName="Example site"
      onClose={vi.fn()}
      onAccept={vi.fn()}
      onReject={vi.fn()}
    />,
  );

describe("SuggestionPreview publication state", () => {
  it("identifies an approved suggestion as queued but not live", () => {
    renderPreview("approved");

    expect(screen.getByText("Queued for publish")).not.toBeNull();
    expect(screen.getByText("Queued for the next publish batch. Not live yet.")).not.toBeNull();
  });

  it("identifies an applied suggestion as published live", () => {
    renderPreview("applied");

    expect(screen.getByText("Published live")).not.toBeNull();
    expect(screen.getByText("Published to the live article.")).not.toBeNull();
  });

  it("uses RQ without Celery in the scheduling copy", () => {
    expect(RQ_SCHEDULING_COPY).toBe("Scheduled re-crawls run through RQ.");
    expect(RQ_SCHEDULING_COPY.toLowerCase()).not.toContain("celery");
  });
});
```

Create `src/pages/SitesPage.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SitesPage from "./SitesPage";

vi.mock("../hooks/useSites", () => ({
  useSites: () => ({ data: [] }),
  useStats: () => ({ data: [] }),
  useDeleteSite: () => ({ mutate: vi.fn() }),
}));

afterEach(cleanup);

describe("SitesPage scheduler copy", () => {
  it("identifies RQ as the re-crawl scheduler", () => {
    render(<SitesPage />);

    expect(screen.getByText("Scheduled re-crawls run through RQ.")).not.toBeNull();
    expect(document.body.textContent?.toLowerCase()).not.toContain("celery");
  });
});
```

- [ ] **Step 2: Run the status-copy test and verify the old labels fail**

Run:

```powershell
npm test -- src/components/suggestions/SuggestionPreview.test.tsx
npm test -- src/pages/SitesPage.test.tsx
```

Expected: FAIL because current labels are `Approved` and `Applied` and the exact RQ constant does not exist.

- [ ] **Step 3: Centralize and render explicit lifecycle copy**

Add the type import at the top of `src/lib/utils.ts`, replace the existing `STATUS_META`, and add the two copy exports:

```ts
import type { SuggestionStatus } from "../types/suggestion";

export const STATUS_META: Record<
  SuggestionStatus,
  { label: string; dot: string; fg: string }
> = {
  pending: { label: "Pending review", dot: "bg-stone-400", fg: "text-stone-800" },
  approved: { label: "Queued for publish", dot: "bg-amber-500", fg: "text-amber-700" },
  rejected: { label: "Rejected", dot: "bg-red-600", fg: "text-red-600" },
  applied: { label: "Published live", dot: "bg-green-600", fg: "text-green-700" },
};

export const PUBLICATION_STATUS_MESSAGE: Partial<Record<SuggestionStatus, string>> = {
  approved: "Queued for the next publish batch. Not live yet.",
  applied: "Published to the live article.",
};

export const RQ_SCHEDULING_COPY = "Scheduled re-crawls run through RQ.";
```

Replace `src/components/suggestions/SuggestionPreview.tsx` with:

```tsx
import type { Suggestion } from "../../types/suggestion";
import { METHOD_LABEL, PUBLICATION_STATUS_MESSAGE, STATUS_META, pct } from "../../lib/utils";

interface Props {
  suggestion: Suggestion;
  siteName: string;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
}

export default function SuggestionPreview({
  suggestion: s,
  siteName,
  onClose,
  onAccept,
  onReject,
}: Props) {
  const targetTitle = s.target_article?.title ?? s.external_title ?? "";
  const targetUrl = s.target_article?.url ?? s.external_url ?? "";
  const slug = targetUrl.replace(/^https?:\/\/[^/]+/, "") || targetUrl;
  const publicationMessage = PUBLICATION_STATUS_MESSAGE[s.status];

  return (
    <div className="w-[410px] flex-none overflow-y-auto border-l border-stone-200 bg-stone-50 p-7">
      <div className="mb-5 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Suggestion #{String(s.id).padStart(3, "0")}
        </div>
        <button
          aria-label="Close preview"
          onClick={onClose}
          className="px-1.5 py-1 text-base text-stone-400 hover:text-stone-950"
        >
          ✕
        </button>
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400">
        Source article
      </div>
      <div className="font-serif text-2xl leading-snug">{s.source_article.title}</div>
      <div className="mb-4 mt-1.5 text-[13px] text-stone-500">
        {siteName} ·{" "}
        <a
          href={s.source_article.url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          open article
        </a>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white px-5 py-5 text-[15px] leading-relaxed text-stone-600">
        …{s.context_before}
        {s.anchor_text && (
          <mark className="rounded-[3px] bg-chip px-1 font-medium text-stone-950 underline underline-offset-2">
            {s.anchor_text}
          </mark>
        )}
        {s.context_after}…
      </div>

      <div className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-stone-400">
        Links to →
      </div>
      <div className="rounded-2xl bg-chip px-4 py-4">
        <div className="text-[15px] font-medium leading-snug text-stone-950">{targetTitle}</div>
        <div className="mt-1 text-[12.5px] text-stone-500">{slug}</div>
      </div>

      <div className="my-5 grid grid-cols-2 gap-2.5">
        <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white px-4 py-4">
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(168,200,232,.4),transparent_70%)]" />
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
            {METHOD_LABEL[s.method] ?? s.method}
          </div>
          <div className="mt-1.5 font-serif text-3xl text-stone-950">{pct(s.score)}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
            Trust score
          </div>
          <div className="mt-1.5 font-serif text-3xl text-stone-400">
            {s.trust_score !== null ? pct(s.trust_score) : "—"}
          </div>
        </div>
      </div>

      {s.status === "pending" ? (
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 rounded-full border border-stone-800 bg-stone-800 py-3 text-[15px] font-medium text-white hover:bg-stone-950"
          >
            Accept & queue placement
          </button>
          <button
            onClick={onReject}
            className="rounded-full border border-stone-300 px-[18px] py-3 text-[15px] font-medium text-stone-950 hover:border-stone-950"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className={`rounded-full bg-chip px-4 py-3 text-center text-sm font-medium ${STATUS_META[s.status].fg}`}>
          {STATUS_META[s.status].label}
        </div>
      )}

      {publicationMessage && (
        <div
          aria-label="Publish status"
          className="mt-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"
        >
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
            Publish status
          </div>
          <div className="mt-1 text-[13px] font-medium text-stone-700">{publicationMessage}</div>
        </div>
      )}

      {s.status === "pending" && (
        <div className="mt-3 text-[12.5px] leading-normal text-stone-400">
          Accepting this suggestion queues it for a future publish batch.
        </div>
      )}
      {s.status === "rejected" && (
        <div className="mt-3 text-[12.5px] leading-normal text-stone-400">
          Rejected suggestions are not included in publish batches.
        </div>
      )}
    </div>
  );
}
```

In `src/pages/SitesPage.tsx`, add `RQ_SCHEDULING_COPY` to the `../lib/utils` import and replace the final scheduler sentence with `{RQ_SCHEDULING_COPY}`.

In `src/components/suggestions/SuggestionCard.tsx`, change the action wrapper from `w-[158px]` to `w-[190px]` and add `whitespace-nowrap` to the non-pending status badge so `Queued for publish` remains one readable phrase.

- [ ] **Step 4: Run copy tests and scan for forbidden scheduling copy**

Run:

```powershell
npm test -- src/components/suggestions/SuggestionPreview.test.tsx
npm test -- src/pages/SitesPage.test.tsx
rg -n -i "celery|re-crawl runs nightly" src
```

Expected: tests PASS and `rg` returns no matches.

- [ ] **Step 5: Commit lifecycle copy**

```powershell
git add src/lib/utils.ts src/components/suggestions/SuggestionCard.tsx src/components/suggestions/SuggestionPreview.tsx src/components/suggestions/SuggestionPreview.test.tsx src/pages/SitesPage.tsx src/pages/SitesPage.test.tsx
git commit -m "fix: clarify publish and scheduler status copy"
```

---

### Task 5: Full Frontend Verification

**Files:**
- Verify only; change production files only when a failing check identifies a concrete defect, and cover that defect with a failing test first.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: test, build, source-scan, and browser evidence that the static UI works without review mutations.

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
npm test
npm run build
git diff --check HEAD~4..HEAD
rg -n -i "celery|re-crawl runs nightly" src
```

Expected: tests and production build PASS, diff check prints nothing, and the forbidden-copy scan prints nothing.

- [ ] **Step 2: Start the frontend and perform browser verification**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

Use the browser verification skill to inspect `/queue` at desktop width. Confirm:

- The method choices, 80% threshold, and both target counts are legible.
- Empty target actions are disabled.
- Confirmation names action, count, threshold, method, and site.
- Confirming an action changes only local cards, preview, counts, and feedback.
- `Queued for publish` is visibly different from `Published live`.
- The Sites page renders `Scheduled re-crawls run through RQ.` exactly.
- The browser network log contains no `PUT /suggestions/` or `POST /suggestions/bulk-review` after individual and bulk actions.
- Reloading restores fetched statuses.
- The browser console has no errors caused by the new UI.

- [ ] **Step 3: Check repository scope**

Run:

```powershell
git status --short
git diff --name-only 58b11bb..HEAD
```

Expected: only `linking-engine-frontend` files from this plan are listed; no backend path appears.
