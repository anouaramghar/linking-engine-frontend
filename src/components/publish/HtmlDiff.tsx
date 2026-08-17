import { useMemo, useRef, useState } from "react";

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
 * every tinted row also carries a `+` or a `−` in the gutter, and the two panes
 * are labelled in words above them.
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

/** How a row is painted in one pane, which is not how it is painted in the other. */
const sideStyle = (kind: ViewRow["kind"], side: "left" | "right") => {
  if (kind === "same" || kind === "skipped") return ROW.same;
  if (kind === "changed") return side === "left" ? ROW.removed : ROW.added;
  return kind === "added" ? ROW.added : ROW.removed;
};

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

/**
 * One pane of the diff.
 *
 * Both panes are drawn from the same rows, so a line the other side does not
 * have is a hole here rather than a shift: line 12 on the left stays level with
 * line 12 on the right all the way down the article.
 */
function Pane({
  label,
  filename,
  side,
  rows,
  scrollRef,
  onScroll,
}: {
  label: string;
  filename: string;
  side: "left" | "right";
  rows: ViewRow[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-hairline bg-surface-card shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-hairline bg-surface-strong px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-caption-sm font-medium text-ink">{filename}</span>
          <span className="truncate text-caption-sm text-muted">{label}</span>
        </div>
        <span className="shrink-0 font-mono text-caption-sm text-muted">HTML · read-only</span>
      </div>

      {/* The scroller carries the name and the tab stop, not the box around it:
          a pane that can only be read by scrolling has to be reachable from the
          keyboard, and a focusable region needs a name to announce. */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="region"
        aria-label={`${label} HTML code`}
        tabIndex={0}
        className="max-h-96 overflow-auto"
      >
        <div className="min-w-max">
          {rows.map((row, index) => {
            const style = sideStyle(row.kind, side);

            if (row.kind === "skipped") {
              return (
                <div
                  key={index}
                  className="flex h-5 items-center border-y border-hairline bg-canvas-soft"
                >
                  <span
                    aria-hidden="true"
                    className="sticky left-0 w-16 flex-none border-r border-hairline bg-surface-strong text-center font-mono text-caption-sm leading-5 text-muted-soft"
                  >
                    ⋯
                  </span>
                  <span className="whitespace-pre px-3 font-mono text-caption-sm leading-5 text-muted">
                    {row.count === 1 ? "1 unchanged line" : `${row.count} unchanged lines`}
                  </span>
                </div>
              );
            }

            const line = side === "left" ? row.left : row.right;

            // The other side has a line here and this one does not. The hole is
            // the point: it says the change is an insertion, not a rewrite.
            if (!line) {
              return <div key={index} className="h-5 bg-canvas-soft" />;
            }

            return (
              <div key={index} className={`flex h-5 font-mono text-caption-sm leading-5 ${style.tint}`}>
                <span
                  aria-hidden="true"
                  className={`sticky left-0 flex w-16 flex-none items-center gap-1 border-r border-hairline bg-surface-strong pl-2 pr-1 ${style.signInk}`}
                >
                  <span className="flex-1 select-none text-right text-muted">{line.number}</span>
                  <span className="w-3 flex-none text-center">{style.sign}</span>
                </span>
                <Line line={line} mark={style.mark} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The exact markup this approval writes, before and after, side by side.
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

  /**
   * The two panes scroll as one.
   *
   * Line 40 beside line 40 is the whole point of a split view, and it survives
   * exactly as long as the panes stay level. The guard is what stops the two
   * `onScroll` handlers from driving each other.
   */
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const sync = (from: HTMLDivElement, to: HTMLDivElement | null) => {
    if (syncing.current || !to) return;
    syncing.current = true;
    to.scrollTop = from.scrollTop;
    to.scrollLeft = from.scrollLeft;
    // Released on the next frame: the assignment above fires the other pane's
    // own scroll event, and that one must find the guard still up.
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

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

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <Pane
          label="Before approval"
          filename="source.html"
          side="left"
          rows={visible}
          scrollRef={leftRef}
          onScroll={(event) => sync(event.currentTarget, rightRef.current)}
        />
        <Pane
          label="After approval"
          filename="updated.html"
          side="right"
          rows={visible}
          scrollRef={rightRef}
          onScroll={(event) => sync(event.currentTarget, leftRef.current)}
        />
      </div>
    </div>
  );
}
