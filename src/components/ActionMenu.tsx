import { useCallback, useEffect, useId, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * Replaces a <details> pop-out, which stayed open on outside clicks and Escape
 * and announced itself as a disclosure rather than a menu.
 *
 * Claiming role="menu" is a promise about the keyboard: arrows move between
 * items, Home/End jump to the ends, Escape and Tab close and hand focus back to
 * the trigger. Items are removed from the tab sequence so the menu owns focus
 * while it is open, which is what a screen reader announces it will do.
 */
export default function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const enabledItems = useCallback(
    () => [
      ...(root.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']:not([disabled])",
      ) ?? []),
    ],
    [],
  );

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  // Opening moves focus into the menu; the effect runs after the items mount,
  // so there is something to focus by the time it fires.
  useEffect(() => {
    if (open) enabledItems()[0]?.focus();
  }, [open, enabledItems]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      // A click elsewhere dismisses the menu but belongs to whatever was
      // clicked, so focus is not dragged back to the trigger.
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const focusAt = (index: number) => {
    const nodes = enabledItems();
    if (!nodes.length) return;
    // Wraps, so holding an arrow key cycles rather than dead-ending.
    nodes[(index + nodes.length) % nodes.length]?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const nodes = enabledItems();
    const current = nodes.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "ArrowDown") focusAt(current + 1);
    else if (event.key === "ArrowUp") focusAt(current - 1);
    else if (event.key === "Home") focusAt(0);
    else if (event.key === "End") focusAt(nodes.length - 1);
    // Tab dismisses the menu and puts the caller back on the trigger rather
    // than tabbing into the page from an item that is about to unmount. The
    // next Tab then continues from the trigger, where the editor left off.
    else if (event.key === "Tab") close();
    else return;

    event.preventDefault();
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          // The conventional way to reach a menu without a mouse.
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="rounded-full border border-stone-300 px-3 py-1.5 text-[13px] font-medium hover:border-stone-950"
      >
        {label}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-20 mt-1 w-48 rounded-2xl border border-stone-200 bg-white py-1.5 shadow-[0_8px_24px_rgba(0,0,0,.08)]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={`block w-full px-4 py-2 text-left text-[13px] hover:bg-chip disabled:opacity-50 ${
                item.danger ? "text-red-700" : ""
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
