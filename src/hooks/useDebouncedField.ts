import { useEffect, useRef, useState } from "react";

/**
 * A text-backed field whose committed value lags its keystrokes.
 *
 * Every filter the queue commits is part of a react-query key and of the URL,
 * so an uncommitted keystroke would cost a refetch of the queue and two count
 * endpoints. The draft paints immediately regardless — only the settled value
 * becomes the filter, which is what keeps the list, the chips, and the bulk
 * buttons all describing the same set of rows.
 */
export interface DebouncedField {
  /** What the input shows right now, including states no value can represent. */
  draft: string;
  /** Handle a keystroke: repaint now, commit later. */
  change: (next: string) => void;
  /** Settle immediately — for blur, Enter, or anything that reads the value. */
  flush: () => void;
  /** Cancel an in-flight commit and restore the committed value. */
  cancel: () => void;
}

export function useDebouncedField<T>({
  value,
  format,
  parse,
  commit,
  delayMs,
}: {
  value: T;
  format: (value: T) => string;
  /** `undefined` means the draft is not yet a value — keep it, commit nothing. */
  parse: (draft: string) => T | undefined;
  commit: (next: T) => void;
  delayMs: number;
}): DebouncedField {
  const [draft, setDraft] = useState(() => format(value));

  // Resynced during render rather than in an effect, so the field never paints
  // a value the filter is no longer using — a clamp or a reset upstream has to
  // be visible on the same frame it happens.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (parse(draft) !== value) setDraft(format(value));
  }

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Latched, so an inline parent callback cannot restart the countdown on every
  // re-render: the timer belongs to this edit, not to this render.
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    // A reset or URL change invalidates the draft that the old timer captured.
    clearTimeout(timer.current);
  }, [value]);

  const change = (next: string) => {
    setDraft(next);
    clearTimeout(timer.current);
    const parsed = parse(next);
    if (parsed === undefined) return;
    timer.current = setTimeout(() => latest.current(parsed), delayMs);
  };

  const flush = () => {
    clearTimeout(timer.current);
    const parsed = parse(draft);
    if (parsed !== undefined && parsed !== value) latest.current(parsed);
    else setDraft(format(value));
  };

  const cancel = () => {
    clearTimeout(timer.current);
    setDraft(format(value));
  };

  return { draft, change, flush, cancel };
}
