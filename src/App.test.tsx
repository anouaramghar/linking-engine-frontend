import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

vi.mock("./hooks/useSites", () => ({
  useSites: () => ({ data: [{ id: 1 }] }),
}));

vi.mock("./hooks/useSuggestions", () => ({
  useSuggestionCounts: () => ({ data: { pending: 3, approved: 2 } }),
}));

vi.mock("./hooks/usePublish", () => ({
  usePendingPublication: () => ({
    data: [],
  }),
}));

vi.mock("./hooks/useHealth", () => ({
  useHealth: () => ({ isError: false, isPending: false }),
}));

vi.mock("./hooks/useJobs", () => ({
  useActiveJobs: () => ({ data: [], isPending: false, isError: false }),
  useCancelJob: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("./hooks/useAlerts", () => ({
  useAlerts: () => ({
    alerts: [],
    unreadCount: 0,
    isPending: false,
    isError: false,
    acknowledge: vi.fn(),
  }),
}));

vi.mock("./hooks/useSession", () => ({
  useSession: () => ({ data: { id: 1, telegram_id: 42, username: "amir", display_name: null } }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));

// The assistant panel hangs off every page; the shell tests assert on shell
// behavior, not on the chat transcript, so it runs inert here.
vi.mock("./hooks/useAgentChat", () => ({
  useAgentChat: () => ({
    messages: [],
    pending: false,
    error: null,
    clearError: vi.fn(),
    retry: vi.fn(),
    clearConversation: vi.fn(),
    send: vi.fn(),
    configured: true,
    model: "test-model",
  }),
}));

vi.mock("./pages/ValidationPage", () => ({
  default: () => <div>Queue page</div>,
}));

vi.mock("./pages/PublishPage", () => ({
  default: () => <div>Publish page</div>,
}));

vi.mock("./pages/SitesPage", () => ({
  default: () => <div>Sites page</div>,
}));

vi.mock("./pages/EvaluationPage", () => ({
  default: () => <div>Evaluation page</div>,
}));

vi.mock("./pages/ContentPoolPage", () => ({
  default: () => <div>Content pool page</div>,
}));

/**
 * This jsdom build ships no `localStorage`, which is why `useRail` and
 * `useTheme` both reach for it optionally and inside a `catch`. Without a stub
 * the rail would simply never persist here and the test below would pass by
 * doing nothing, so the storage is real enough to fail if the hook stops
 * writing to it.
 */
const store = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  },
});

const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
};

afterEach(cleanup);
beforeEach(() => store.clear());

const shell = (path = "/queue") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <App />
    </MemoryRouter>,
  );

describe("App shell", () => {
  it("keeps the review workflow in the queue while exposing the other destinations", () => {
    shell();

    const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });
    const desktop = screen.getByRole("navigation", { name: "Primary navigation" });

    for (const nav of [mobile, desktop]) {
      expect(nav.querySelector('a[href="/queue"]')).not.toBeNull();
      expect(nav.querySelector('a[href="/selected"]')).not.toBeNull();
      expect(nav.querySelector('a[href="/sites"]')).not.toBeNull();
      expect(nav.querySelector('a[href="/content-pool"]')).not.toBeNull();
      expect(nav.querySelector('a[href="/evaluation"]')).not.toBeNull();
      expect(nav.querySelector('a[href="/access"]')).not.toBeNull();
    }
  });

  it("places the utility icons between the logo and the review queue", () => {
    shell();

    const rail = screen.getByRole("complementary");
    const logo = within(rail).getByText("LinkMesh");
    const activity = within(rail).getByRole("button", { name: "Activity" });
    const notifications = within(rail).getByRole("button", { name: "Notifications" });
    const collapse = within(rail).getByRole("button", { name: "Collapse sidebar" });
    const queue = within(rail).getByRole("link", { name: /Review queue/ });

    expect(activity.className).toContain("w-8");
    expect(notifications.className).toContain("w-8");
    expect(collapse.className).toContain("w-8");
    expect(rail.className).toContain("w-56");
    expect(rail.querySelectorAll('[aria-hidden="true"].h-px')).toHaveLength(2);
    expect(logo.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(activity.compareDocumentPosition(notifications) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notifications.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(collapse.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps queue filters when returning from another page", async () => {
    const user = userEvent.setup();
    shell("/queue?status=approved&q=hooks&origin=content_pool&suggestion=42");

    const primary = screen.getByRole("navigation", { name: "Primary navigation" });
    await user.click(within(primary).getByRole("link", { name: /Sites/ }));
    await waitFor(() => expect(screen.getByText("Sites page")).toBeTruthy());

    await user.click(within(primary).getByRole("link", { name: /Review queue/ }));

    expect(screen.getByTestId("location").textContent).toBe(
      "/queue?status=approved&q=hooks&origin=content_pool&suggestion=42",
    );
  });

  it("announces engine health in whichever shell is visible", () => {
    shell("/");

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(2);
    for (const status of statuses) {
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.textContent).toContain("Engine ready");
    }
  });
});

describe("Rail collapse", () => {
  const rail = () => screen.getByRole("navigation", { name: "Primary navigation" });

  it("uses the panel outline mark for the rail toggle", () => {
    shell();

    const icon = screen.getByRole("button", { name: "Collapse sidebar" }).querySelector("svg");

    expect(icon?.querySelector("rect")).not.toBeNull();
    expect(icon?.querySelectorAll("path")).toHaveLength(1);
    expect(icon?.querySelector("path")?.getAttribute("d")).toBe("M9 3v18");
  });

  it("keeps every destination named once the labels are hidden", async () => {
    const user = userEvent.setup();
    shell();

    // Expanded, the label is the visible text. Collapsed, it is an `sr-only`
    // span and a tooltip — and only the first of those is a name. A rail that
    // reads as four unlabelled links to a screen reader is not collapsed, it is
    // broken, so this asserts the names survive the transition rather than
    // asserting which element carries them.
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    // Scoped to the rail: jsdom applies no stylesheet, so the mobile row is in
    // the document too and "Sites" would match in both shells.
    for (const name of [
      "Review queue",
      "Selected links",
      "Sites",
      "Content Pool",
      "Evaluation",
      "Traceability",
      "Access",
    ]) {
      expect(within(rail()).getByRole("link", { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    const collapsedBrand = within(screen.getByRole("complementary")).getByText(/LinkMesh/);
    expect(collapsedBrand.parentElement?.className).toContain("justify-center");
    expect(rail().querySelectorAll("a")).toHaveLength(7);
  });

  it("carries each count when the badge cannot show it", async () => {
    const user = userEvent.setup();
    shell();

    // The collapsed rail draws an indicator dot, not "3" — the number has to
    // reach assistive tech some other way or it is simply gone.
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByRole("button", { name: "Activity" }).className).toContain("w-7");
    expect(screen.getByRole("button", { name: "Notifications" }).className).toContain("w-7");
    expect(screen.getByRole("button", { name: "Expand sidebar" }).className).toContain("w-7");

    const queue = rail().querySelector('a[href="/queue"]');
    expect(queue?.textContent).toContain("3 pending");
    const selected = rail().querySelector('a[href="/selected"]');
    expect(selected?.textContent).toContain("2 selected");
    expect(rail().querySelector('a[href="/publish"]')).toBeNull();
  });

  it("remembers the choice, because it is a workspace preference", async () => {
    const user = userEvent.setup();
    const first = shell();

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();

    first.unmount();
    shell();

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
  });

  it("offers one theme control per shell, never two for one preference", () => {
    shell();

    // One in the rail, one in the mobile header — the two never appear at the
    // same breakpoint. A third used to ride along in `PageHeader`, wired to a
    // context no provider mounted, so it showed the wrong value and changed
    // nothing.
    expect(screen.getAllByRole("group", { name: "Colour theme" })).toHaveLength(2);
  });
});
