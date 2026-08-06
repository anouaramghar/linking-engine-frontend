import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/** Distance between the trigger and the pop-out, above or below. */
const GAP = 4;
/** Smallest gap the pop-out keeps from the window edge before it flips. */
const MARGIN = 8;

/**
 * Replaces a <details> pop-out, which stayed open on outside clicks and Escape
 * and announced itself as a disclosure rather than a menu.
 *
 * Claiming role="menu" is a promise about the keyboard: arrows move between
 * items, Home/End jump to the ends, Escape closes and restores focus, and Tab
 * closes while allowing focus to continue through the page. Items are removed
 * from the tab sequence so the menu owns focus while it is open.
 *
 * The pop-out is positioned `fixed` rather than `absolute` because its natural
 * home is a row inside a scrolling pane: `overflow-y: auto` drags `overflow-x`
 * to `auto` with it, so an absolute menu on the last row was clipped by the
 * container it grew out of. No ancestor establishes a containing block for
 * fixed elements, so `fixed` escapes that clip while the menu stays put in the
 * DOM — which is what keeps Tab leaving it in the right place.
 */
export default function ActionMenu({
  label,
  ariaLabel = label,
  items,
}: {
  label: string;
  ariaLabel?: string;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openingFocus = useRef<"first" | "last">("first");
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
    setPosition(null);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  // Measure and place before paint: the pop-out renders off-screen for one
  // layout pass so its real height is known, then snaps into position without
  // ever being painted somewhere wrong.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = trigger.current?.getBoundingClientRect();
    const box = menu.current?.getBoundingClientRect();
    if (!anchor || !box) return;

    const below = anchor.bottom + GAP;
    // Flip above only when there is genuinely more room up there.
    const flip =
      below + box.height + MARGIN > window.innerHeight &&
      anchor.top - box.height - GAP > MARGIN;

    const clampedBelow = Math.min(
      below,
      Math.max(MARGIN, window.innerHeight - box.height - MARGIN),
    );
    setPosition({
      top: flip ? anchor.top - box.height - GAP : clampedBelow,
      // Right-aligned to the trigger, then held inside the window.
      left: Math.max(
        MARGIN,
        Math.min(anchor.right - box.width, window.innerWidth - box.width - MARGIN),
      ),
    });
  }, [open]);

  // Opening moves focus into the menu; the effect runs after the items mount,
  // so there is something to focus by the time it fires.
  useEffect(() => {
    if (!open) return;
    const nodes = enabledItems();
    const index = openingFocus.current === "last" ? nodes.length - 1 : 0;
    nodes[index]?.focus();
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
    // A fixed pop-out cannot follow its trigger, so scrolling dismisses it
    // rather than leaving it stranded over unrelated rows. Restore focus to
    // the trigger so keyboard users do not lose their place.
    const onViewportChange = (event: Event) => {
      if (menu.current?.contains(event.target as Node)) return;
      close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open, close]);

  const focusAt = (index: number) => {
    const nodes = enabledItems();
    if (!nodes.length) return;
    // Wraps, so holding an arrow key cycles rather than dead-ending.
    nodes[(index + nodes.length) % nodes.length]?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    // Tab is deliberately untouched. Its native focus move triggers the
    // menu's blur handler, which closes only after focus has safely moved on.
    if (event.key === "Tab") return;

    const nodes = enabledItems();
    const current = nodes.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "ArrowDown") focusAt(current + 1);
    else if (event.key === "ArrowUp") focusAt(current - 1);
    else if (event.key === "Home") focusAt(0);
    else if (event.key === "End") focusAt(nodes.length - 1);
    else return;

    event.preventDefault();
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          openingFocus.current = "first";
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          // The conventional way to reach a menu without a mouse.
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openingFocus.current = event.key === "ArrowUp" ? "last" : "first";
            setOpen(true);
          }
        }}
        className="btn btn-outline btn-sm"
      >
        {label}
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
           aria-label={ariaLabel}
          onKeyDown={onMenuKeyDown}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) close(false);
          }}
          style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
           className="card fixed z-40 max-h-[calc(100dvh-1rem)] w-48 max-w-[calc(100vw-1rem)] overflow-y-auto py-2 shadow-lift"
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
              className={`block min-h-11 w-full px-4 py-2 text-left text-caption hover:bg-surface-strong disabled:opacity-50 ${
                item.danger ? "text-error-ink" : "text-body hover:text-ink"
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
