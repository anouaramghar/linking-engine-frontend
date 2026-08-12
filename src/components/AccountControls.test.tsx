import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AccountControls, { UserAvatar } from "./AccountControls";

vi.mock("../hooks/useSession", () => ({
  useSession: () => ({
    data: {
      id: 1,
      telegram_id: 42,
      username: "alex",
      display_name: "Alex Doe",
      photo_url: "/api/v1/auth/users/1/avatar",
    },
  }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

describe("UserAvatar", () => {
  it("renders profile image when photo_url is available", () => {
    render(
      <UserAvatar
        user={{
          id: 1,
          telegram_id: 42,
          username: "alex",
          display_name: "Alex Doe",
          photo_url: "/api/v1/auth/users/1/avatar",
          status: "approved",
          requested_at: "2026-01-01",
          approved_at: null,
          approved_by: null,
          last_seen_at: null,
        }}
      />,
    );

    const img = screen.getByRole("img", { name: "Alex Doe" });
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("/api/v1/auth/users/1/avatar");
  });
});

describe("AccountControls", () => {
  it("renders user avatar and user name", () => {
    render(<AccountControls layout="stack" />);

    expect(screen.getByText("Alex Doe")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Alex Doe" })).toBeTruthy();
  });
});
