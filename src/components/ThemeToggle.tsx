import { useId, useRef, type ReactNode } from "react";

import { THEMES, type ThemePreference, type ThemeSwitchOrigin } from "../hooks/useTheme";

/**
 * 16px marks at the Brand mark's stroke weight, so the control reads as part of
 * the same drawing rather than a borrowed icon set.
 */
const ICON: Record<ThemePreference, ReactNode> = {
  light: (
    <>
      <circle cx="8" cy="8" r="3.25" />
      <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06M12.95 12.95l-1.06-1.06M4.11 4.11L3.05 3.05" />
    </>
  ),
  dark: <path d="M13.5 9.9A6 6 0 1 1 6.1 2.5a4.7 4.7 0 0 0 7.4 7.4z" />,
  system: (
    <>
      <rect x="1.75" y="2.75" width="12.5" height="9" rx="1.25" />
      <path d="M5.5 14.25h5" />
    </>
  ),
};

const LABEL: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "Match system",
};

/**
 * Theme picker.
 *
 * Three native radios rather than buttons with `aria-checked`: the choice is
 * one-of-three, which is what a radio group *is*, and going native means arrow-key
 * roving, the grouping announcement and the checked state all arrive without
 * being reimplemented. The inputs are `sr-only` and the visible pill is the
 * label's own span, so the hit target stays the pill.
 *
 * `preference` drives the checked state, not `resolved` — the control has to be
 * able to show "Match system" as the selection, which is exactly the state a
 * two-way switch cannot represent.
 *
 * State arrives as props rather than from `useTheme` here, because the shell
 * renders this twice — once in the sidebar, once in the mobile header. Two
 * hook instances would be two independent copies of a preference that is
 * global, both writing `<html data-theme>`, so App owns the hook and this stays
 * presentational.
 */
interface Props {
  preference: ThemePreference;
  onChange: (next: ThemePreference, origin?: ThemeSwitchOrigin) => void;
}

export default function ThemeToggle({ preference, onChange }: Props) {
  const name = useId();
  // Keyed by theme rather than a single ref: the origin has to come from
  // whichever pill was actually activated, including by arrow key, not from
  // wherever the pointer happens to be.
  const pillRefs = useRef<Partial<Record<ThemePreference, HTMLSpanElement | null>>>({});

  const originOf = (theme: ThemePreference): ThemeSwitchOrigin | undefined => {
    const pill = pillRefs.current[theme];
    if (!pill) return undefined;
    const { left, top, width, height } = pill.getBoundingClientRect();
    return { x: left + width / 2, y: top + height / 2 };
  };

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Colour theme</legend>
      <div className="inline-flex rounded-pill border border-hairline bg-surface-card p-0.5">
        {THEMES.map((theme) => (
          <label key={theme} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={theme}
              checked={preference === theme}
              onChange={() => onChange(theme, originOf(theme))}
              className="peer sr-only"
            />
            <span
              ref={(el) => {
                pillRefs.current[theme] = el;
              }}
              // The 28px pill is below the 44px touch minimum, so the control is
              // kept to pointer-dense chrome — it sits in the sidebar footer and
              // the mobile header bar, never in a form.
              title={LABEL[theme]}
              className="flex h-7 w-8 items-center justify-center rounded-pill text-muted
                transition-colors hover:text-ink peer-checked:bg-primary
                peer-checked:text-on-primary peer-focus-visible:outline
                peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2
                peer-focus-visible:outline-ink"
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {ICON[theme]}
              </svg>
              <span className="sr-only">{LABEL[theme]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
