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
    await open();

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

/**
 * role="menu" is a promise about the keyboard, and a menu that only responds to
 * a mouse is worse for assistive tech than plain buttons would have been.
 */
describe("ActionMenu keyboard contract", () => {
  const openMany = async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <>
        <ActionMenu
          label="Actions"
          items={[
            { label: "Crawl", onSelect },
            { label: "Suggest", onSelect, disabled: true },
            { label: "Publish approved", onSelect },
          ]}
        />
        <button type="button">After actions</button>
      </>,
    );
    return { user, onSelect, trigger: screen.getByRole("button", { name: "Actions" }) };
  };

  const focused = () => document.activeElement?.textContent;

  it("opens from the trigger with ArrowDown and lands on the first item", async () => {
    const { user, trigger } = await openMany();

    trigger.focus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("menu")).not.toBeNull();
    expect(focused()).toBe("Crawl");
  });

  it("opens from the trigger with ArrowUp and lands on the last enabled item", async () => {
    const { user, trigger } = await openMany();

    trigger.focus();
    await user.keyboard("{ArrowUp}");

    expect(screen.getByRole("menu")).not.toBeNull();
    expect(focused()).toBe("Publish approved");
  });

  it("moves with the arrows, skipping items that cannot be chosen", async () => {
    const { user, trigger } = await openMany();
    await user.click(trigger);

    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("Publish approved"); // 'Suggest' is disabled

    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe("Crawl");
  });

  it("wraps at both ends rather than dead-ending", async () => {
    const { user, trigger } = await openMany();
    await user.click(trigger);

    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe("Publish approved");

    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("Crawl");
  });

  it("jumps to the ends with Home and End", async () => {
    const { user, trigger } = await openMany();
    await user.click(trigger);

    await user.keyboard("{End}");
    expect(focused()).toBe("Publish approved");

    await user.keyboard("{Home}");
    expect(focused()).toBe("Crawl");
  });

  it("closes on Tab and lets focus leave the menu in one action", async () => {
    const { user, trigger } = await openMany();
    await user.click(trigger);

    await user.keyboard("{Tab}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "After actions" }));
  });

  it("keeps items out of the tab sequence while the menu owns focus", async () => {
    const { user, trigger } = await openMany();
    await user.click(trigger);

    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.getAttribute("tabindex")).toBe("-1");
    }
  });
});
