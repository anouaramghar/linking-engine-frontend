import { useMemo, useState } from "react";

import {
  countChanges,
  diffHtml,
  foldUnchanged,
  type DiffLine,
  type Token,
  type ViewRow,
} from "../../lib/htmlDiff";

/** Unchanged lines kept on each side of a change, so a line is never read alone. */
const CONTEXT = 3;

/**
 * The colour of each kind of token.
 *
 * The product surface of this app is monochrome on purpose. Code is the one
 * register where that rule is the wrong one: an operator reading markup to
 * decide whether it is safe to publish is doing the job an editor is coloured
 * for, and they are doing it in whatever editor they already use. So the four
 * hues here are the ones every editor uses, held to the muted end of the ramp
 * and measured for AA on {colors.surface-card} in both themes
 * (`theme.contrast.test.ts`).
 */
const TOKEN_CLASS: Record<Token["kind"], string> = {
  tag: "text-code-tag",
  attr: "text-code-attr",
  value: "text-code-value",
  comment: "italic text-code-comment",
  punct: "text-muted",
  text: "text-body",
};

/**
 * The grounds a changed line sits on.
 *
 * Green for what the approval writes and red for what it replaces is the one
 * convention a diff is allowed to borrow — but colour never carries it alone:
 * every tinted row also carries a `+` or a `−` in the gutter, and the file
 * versions are labelled in words above the unified view.
 */
const ROW = {
  same: { tint: "", mark: "", sign: "", signInk: "text-muted-soft" },
  added: {
    tint: "bg-success/10",
    mark: "bg-success/25",
    sign: "+",
    signInk: "text-success",
  },
  removed: {
    tint: "bg-error/10",
    mark: "bg-error/25",
    sign: "−",
    signInk: "text-error",
  },
} as const;

/**
 * One line, coloured, with the part that changed marked inside it.
 *
 * The mark is a character range rather than a token, because the thing that
 * changed is rarely a whole token: a paragraph that gains an anchor differs by
 * the opening tag and nothing else.
 */
function Line({ line, mark }: { line: DiffLine; mark: string }) {
  const pieces: Array<{ text: string; kind: Token["kind"]; marked: boolean }> = [];
  let at = 0;

  for (const token of line.tokens) {
    const start = at;
    const stop = at + token.text.length;
    at = stop;

    if (!line.mark || !mark) {
      pieces.push({ text: token.text, kind: token.kind, marked: false });
      continue;
    }

    // Up to three pieces: before the mark, inside it, after it.
    const [from, to] = line.mark;
    const cuts = [start, Math.min(Math.max(from, start), stop), Math.min(Math.max(to, start), stop), stop];
    for (let index = 0; index < 3; index += 1) {
      const text = token.text.slice(cuts[index] - start, cuts[index + 1] - start);
      if (text) pieces.push({ text, kind: token.kind, marked: index === 1 });
    }
  }

  return (
    <code className="whitespace-pre px-3">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className={`${TOKEN_CLASS[piece.kind]}${piece.marked ? ` ${mark} rounded-xs` : ""}`}
        >
          {piece.text}
        </span>
      ))}
    </code>
  );
}

/** One line in the unified diff, with old and new line numbers in the gutter. */
function UnifiedLine({
  line,
  oldNumber,
  newNumber,
  style,
}: {
  line: DiffLine;
  oldNumber?: number;
  newNumber?: number;
  style: (typeof ROW)[keyof typeof ROW];
}) {
  return (
    <div className={`flex h-5 font-mono text-caption-sm leading-5 ${style.tint}`}>
      <span
        aria-hidden="true"
        className={`sticky left-0 flex w-[5.5rem] flex-none items-center border-r border-hairline bg-surface-strong pl-2 pr-1 ${style.signInk}`}
      >
        <span className="w-8 flex-none select-none text-right text-muted">{oldNumber ?? ""}</span>
        <span className="w-8 flex-none select-none text-right text-muted">{newNumber ?? ""}</span>
        <span className="w-4 flex-none text-center">{style.sign}</span>
      </span>
      <Line line={line} mark={style.mark} />
    </div>
  );
}

/**
 * A single, unified view of the exact artifact.
 *
 * Unchanged lines appear once. A rewritten line is shown as the old line
 * followed immediately by the new line, which keeps the review in one reading
 * column without losing the before/after distinction.
 */
function UnifiedDiff({ rows }: { rows: ViewRow[] }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-hairline bg-surface-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline bg-surface-strong px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption-sm">
          <span className="font-mono font-medium text-ink">source.html</span>
          <span aria-hidden="true" className="text-muted-soft">
            →
          </span>
          <span className="font-mono font-medium text-ink">updated.html</span>
          <span className="text-muted">Before approval → after approval</span>
        </div>
        <span className="shrink-0 font-mono text-caption-sm text-muted">HTML · read-only</span>
      </div>

      {/* The scroller carries the name and the tab stop, not the box around it:
          a code view that can only be read by scrolling has to be reachable from
          the keyboard, and a focusable region needs a name to announce. */}
      <div
        role="region"
        aria-label="Unified HTML diff from source.html before approval to updated.html after approval"
        tabIndex={0}
        className="max-h-96 overflow-auto"
      >
        <div className="min-w-max">
          {rows.map((row, index) => {
            if (row.kind === "skipped") {
              return (
                <div
                  key={`skipped-${index}`}
                  className="flex h-5 items-center border-y border-hairline bg-canvas-soft"
                >
                  <span
                    aria-hidden="true"
                    className="sticky left-0 w-[5.5rem] flex-none border-r border-hairline bg-surface-strong text-center font-mono text-caption-sm leading-5 text-muted-soft"
                  >
                    ⋯
                  </span>
                  <span className="whitespace-pre px-3 font-mono text-caption-sm leading-5 text-muted">
                    {row.count === 1 ? "1 unchanged line" : `${row.count} unchanged lines`}
                  </span>
                </div>
              );
            }

            if (row.kind === "same") {
              return (
                <UnifiedLine
                  key={`same-${index}`}
                  line={row.left!}
                  oldNumber={row.left!.number}
                  newNumber={row.right!.number}
                  style={ROW.same}
                />
              );
            }

            return (
              <div key={`${row.kind}-${index}`}>
                {row.left && (
                  <UnifiedLine
                    line={row.left}
                    oldNumber={row.left.number}
                    style={ROW.removed}
                  />
                )}
                {row.right && (
                  <UnifiedLine
                    line={row.right}
                    newNumber={row.right.number}
                    style={ROW.added}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The exact markup this approval writes, before and after, in one unified view.
 *
 * This used to be two plain dumps of a page of HTML. Both were true, and
 * together they asked the operator to find a dozen changed characters by eye —
 * which is not review, it is a formality. The change is now marked and counted,
 * and everything the approval does not touch can be folded out of the way.
 */
export default function HtmlDiff({
  original,
  updated,
}: {
  original: string;
  updated: string;
}) {
  const rows = useMemo(() => diffHtml(original, updated), [original, updated]);
  const changes = useMemo(() => countChanges(rows), [rows]);
  const unchanged = changes.added === 0 && changes.removed === 0;
  const [showAll, setShowAll] = useState(unchanged);

  const folded = useMemo(() => foldUnchanged(rows, CONTEXT), [rows]);
  const visible = showAll ? rows : folded;
  const hidden = folded.reduce(
    (total, row) => (row.kind === "skipped" ? total + row.count : total),
    0,
  );

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3 text-caption-sm">
          {unchanged ? (
            <span className="text-muted">This article's stored HTML is unchanged.</span>
          ) : (
            <>
              <span className="font-mono text-success">+{changes.added}</span>
              <span className="font-mono text-error-ink">−{changes.removed}</span>
              <span className="text-muted">
                {changes.added + changes.removed === 1 ? "changed line" : "changed lines"}
              </span>
            </>
          )}
        </div>

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((was) => !was)}
            className="btn btn-outline btn-sm"
          >
            {showAll ? "Show changes only" : `Show all ${rows.length} lines`}
          </button>
        )}
      </div>

      <UnifiedDiff rows={visible} />
    </div>
  );
}
