import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AccessPage from "./AccessPage";
import type { DashboardUser } from "../api/auth";

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  approve: vi.fn(),
  revoke: vi.fn(),
  grantAdmin: vi.fn(),
  revokeAdmin: vi.fn(),
  session: undefined as DashboardUser | undefined,
}));

vi.mock("../api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/auth")>();
  return {
    ...actual,
    listDashboardUsers: mocks.listUsers,
    approveDashboardUser: mocks.approve,
    revokeDashboardUser: mocks.revoke,
    grantDashboardAdmin: mocks.grantAdmin,
    revokeDashboardAdmin: mocks.revokeAdmin,
  };
});

vi.mock("../hooks/useSession", () => ({
  useSession: () => ({ data: mocks.session }),
}));

vi.mock("../components/AccountControls", () => ({
  UserAvatar: () => <span />,
}));

const user = (over: Partial<DashboardUser> & Pick<DashboardUser, "id">): DashboardUser => ({
  telegram_id: 1000 + over.id,
  username: null,
  display_name: `Operator ${over.id}`,
  status: "approved",
  is_admin: false,
  requested_at: "2026-08-10T09:00:00Z",
  approved_at: "2026-08-10T09:05:00Z",
  approved_by: "bootstrap",
  last_seen_at: null,
  ...over,
});

const ADMIN = user({ id: 1, is_admin: true, display_name: "Amir" });
const MEMBER = user({ id: 2, display_name: "Anouar" });
const NEWCOMER = user({ id: 3, status: "pending", display_name: "Wiam", approved_at: null });

const renderAccess = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AccessPage />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mocks.listUsers.mockReset().mockResolvedValue([NEWCOMER, ADMIN, MEMBER]);
  mocks.approve.mockReset().mockResolvedValue(NEWCOMER);
  mocks.revoke.mockReset().mockResolvedValue(MEMBER);
  mocks.grantAdmin.mockReset().mockResolvedValue({ ...MEMBER, is_admin: true });
  mocks.revokeAdmin.mockReset().mockResolvedValue(ADMIN);
  mocks.session = ADMIN;
});

afterEach(cleanup);

describe("AccessPage", () => {
  it("offers admission controls to an admin", async () => {
    renderAccess();

    expect(await screen.findByRole("button", { name: "Approve" })).toBeTruthy();
    // Two Revoke buttons render, but one of them is your own row: it is
    // disabled and its accessible name carries the reason, so it no longer
    // answers to the bare label. `/^Revoke/` matches both.
    expect(screen.getAllByRole("button", { name: /^Revoke/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Make admin" })).toHaveLength(1);
  });

  it("shows an approved non-admin the roster and none of the controls", async () => {
    mocks.session = MEMBER;
    renderAccess();

    expect(await screen.findByText("Amir")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Make admin" })).toBeNull();
    expect(document.body.textContent).toContain("Ask an admin to approve, revoke, or change roles.");
  });

  it("treats an engine that reports no admin group as not admin", async () => {
    // The API is the gate. A UI guessing `true` here would only offer buttons
    // that come back 403.
    mocks.session = { ...ADMIN, is_admin: undefined };
    renderAccess();

    expect(await screen.findByText("Amir")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
  });

  it("promotes another account into the admin group", async () => {
    const operator = userEvent.setup();
    renderAccess();

    await operator.click(await screen.findByRole("button", { name: "Make admin" }));
    expect(mocks.grantAdmin).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", { name: "Grant admin rights?" });
    expect(dialog.textContent).toContain("Anouar");
    await operator.click(within(dialog).getByRole("button", { name: "Make admin" }));

    await waitFor(() => expect(mocks.grantAdmin).toHaveBeenCalledWith(MEMBER.id));
  });

  it("confirms dashboard access changes before sending them", async () => {
    const operator = userEvent.setup();
    renderAccess();

    await operator.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(mocks.revoke).not.toHaveBeenCalled();
    const revokeDialog = screen.getByRole("dialog", { name: "Revoke dashboard access?" });
    await operator.click(within(revokeDialog).getByRole("button", { name: "Revoke access" }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith(MEMBER.id));

    await operator.click(await screen.findByRole("button", { name: "Approve" }));
    expect(mocks.approve).not.toHaveBeenCalled();
    const approveDialog = screen.getByRole("dialog", { name: "Approve dashboard access?" });
    await operator.click(within(approveDialog).getByRole("button", { name: "Approve access" }));
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith(NEWCOMER.id));
  });

  it("never offers to remove your own admin rights or your own access", async () => {
    renderAccess();
    await screen.findByText("Amir");

    // Both are refused by the API for the same reason: the last admin out
    // locks the door behind them.
    //
    // The reason has to reach a screen reader too. A disabled button takes no
    // focus, so the `title` tooltip is mouse-only and the accessible name is
    // the only channel left — these queries match on it deliberately.
    const demote = screen.getByRole("button", {
      name: "Remove admin. You cannot remove your own admin rights",
    });
    const revokeSelf = screen.getByRole("button", {
      name: "Revoke. You cannot revoke your own access",
    });
    expect(demote.hasAttribute("disabled")).toBe(true);
    expect(revokeSelf.hasAttribute("disabled")).toBe(true);

    // The other row's Revoke is available, and keeps its plain label.
    const revokeOther = screen.getByRole("button", { name: "Revoke" });
    expect(revokeOther.hasAttribute("disabled")).toBe(false);
  });
});
