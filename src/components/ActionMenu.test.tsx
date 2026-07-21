import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ActionMenu from "./ActionMenu";

afterEach(cleanup);

const open = async (onSelect = vi.fn()) => {
  const user = userEvent.setup();
  render(
    <ActionMenu label="Actions" items={[{ label: "Publish approved", onSelect }]} />,
  );
  await user.click(screen.getByRole("button", { name: "Actions" }));
  return { user, onSelect };
};

describe("ActionMenu", () => {
  it("announces itself as a menu and reports expansion", async () => {
    const { } = await open();

    const trigger = screen.getByRole("button", { name: "Actions" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Publish approved" })).not.toBeNull();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const { user } = await open();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Actions" }));
  });

  it("closes when a click lands outside it", async () => {
    const { user } = await open();

    await user.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("runs the item and closes on select", async () => {
    const { user, onSelect } = await open();

    await user.click(screen.getByRole("menuitem", { name: "Publish approved" }));
    expect(onSelect).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
