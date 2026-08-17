/**
 * The two jobs a code viewer has to do before an operator can approve markup:
 * colour it, and say where it changed.
 *
 * Both are done here, in plain data, so the component stays a renderer. A line
 * arrives as a list of coloured pieces plus an optional character range to mark,
 * and the component never has to parse anything to draw it.
 *
 * No highlighter library. The dashboard reads exactly one language — the HTML of
 * a WordPress article — and a scanner for that is a hundred lines, against a
 * dependency that carries a hundred grammars the app will never open.
 */

export type TokenKind =
  /** An element name: the `p` of `<p>`. */
  | "tag"
  /** An attribute name: the `href` of `<a href="…">`. */
  | "attr"
  /** A quoted attribute value, quotes included. */
  | "value"
  /** A comment or a doctype — anything the browser does not render. */
  | "comment"
  /** Brackets, slashes, equals signs, and the whitespace between attributes. */
  | "punct"
  /** The words of the article itself. */
  | "text";

export interface Token {
  text: string;
  kind: TokenKind;
}

/** A line of one side of the diff. */
export interface DiffLine {
  /** 1-based, and counted per side, exactly as an editor's gutter counts. */
  number: number;
  tokens: Token[];
  /**
   * The character range that this side does not share with the other one, as
   * `[start, end)` offsets into the line. Null when the whole line is new,
   * gone, or unchanged — a mark is only useful where most of the line is shared.
   */
  mark: [number, number] | null;
}

export type RowKind =
  /** Both sides carry the same line. */
  | "same"
  /** Both sides carry a line, and they differ. */
  | "changed"
  /** Only the updated side carries a line. */
  | "added"
  /** Only the original side carries a line. */
  | "removed";

/**
 * One row of a side-by-side diff. Both panes are drawn from the same rows, so a
 * missing side is a hole rather than a shifted line: that is what keeps the two
 * columns level with each other all the way down.
 */
export interface DiffRow {
  kind: RowKind;
  left: DiffLine | null;
  right: DiffLine | null;
}

const push = (out: Token[], text: string, kind: TokenKind) => {
  if (text) out.push({ text, kind });
};

const SPACE = /\s/;
/** Ends an unquoted attribute name. */
const ATTR_END = /[\s=/>"']/;

/**
 * A single pass over the document, without slicing it.
 *
 * `source.slice(i)` inside the loop would re-copy the tail of the article on
 * every tag, which is quadratic on the only inputs this ever sees: whole pages.
 */
export function tokenizeHtml(source: string): Token[] {
  const out: Token[] = [];
  const end = source.length;
  let i = 0;

  while (i < end) {
    if (source[i] !== "<") {
      const start = i;
      while (i < end && source[i] !== "<") i += 1;
      push(out, source.slice(start, i), "text");
      continue;
    }

    if (source.startsWith("<!--", i)) {
      const close = source.indexOf("-->", i + 4);
      const stop = close === -1 ? end : close + 3;
      push(out, source.slice(i, stop), "comment");
      i = stop;
      continue;
    }

    // `<!doctype html>`, and any other declaration.
    if (source[i + 1] === "!" || source[i + 1] === "?") {
      const close = source.indexOf(">", i);
      const stop = close === -1 ? end : close + 1;
      push(out, source.slice(i, stop), "comment");
      i = stop;
      continue;
    }

    const closing = source[i + 1] === "/";
    const nameAt = closing ? i + 2 : i + 1;
    if (!/[a-zA-Z]/.test(source[nameAt] ?? "")) {
      // A bare `<` in running text — `a < b` is prose, not markup.
      push(out, "<", "text");
      i += 1;
      continue;
    }

    push(out, source.slice(i, nameAt), "punct");
    i = nameAt;
    const nameStart = i;
    while (i < end && !ATTR_END.test(source[i])) i += 1;
    push(out, source.slice(nameStart, i), "tag");

    while (i < end && source[i] !== ">") {
      const char = source[i];

      if (SPACE.test(char)) {
        const start = i;
        while (i < end && SPACE.test(source[i])) i += 1;
        push(out, source.slice(start, i), "punct");
        continue;
      }

      if (char === "=" || char === "/") {
        push(out, char, "punct");
        i += 1;
        continue;
      }

      if (char === '"' || char === "'") {
        const start = i;
        i += 1;
        while (i < end && source[i] !== char) i += 1;
        i = Math.min(i + 1, end);
        push(out, source.slice(start, i), "value");
        continue;
      }

      const start = i;
      while (i < end && !ATTR_END.test(source[i])) i += 1;
      // An attribute name cannot be empty. Anything that gets here is markup
      // this scanner does not know, and stepping over it beats looping forever.
      if (i === start) i += 1;
      push(out, source.slice(start, i), "attr");
    }

    if (source[i] === ">") {
      push(out, ">", "punct");
      i += 1;
    }
  }

  return out;
}

/** The same tokens, cut at every newline, because the viewer draws one row per line. */
export function tokenizeLines(source: string): Token[][] {
  const lines: Token[][] = [[]];

  for (const token of tokenizeHtml(source)) {
    const parts = token.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      push(lines[lines.length - 1], part.replace(/\r$/, ""), token.kind);
    });
  }

  return lines;
}

/** The text of a tokenized line, for comparing one side against the other. */
const lineText = (tokens: Token[]) => tokens.map((token) => token.text).join("");

/**
 * Above this many pairs the table costs more than the answer is worth. A
 * WordPress article is a few hundred lines, so this is a guard rail rather than
 * a limit anything meets in practice; past it the changed middle is reported as
 * one replaced block, which is still true, only coarser.
 */
const LCS_CELL_LIMIT = 4_000_000;

type Step = { kind: "same" | "removed" | "added"; left: number; right: number };

/**
 * Longest common subsequence over lines, on the middle that the two documents
 * do not already share.
 *
 * An article gains one link, so the prefix and the suffix are almost the whole
 * file. Trimming them first is what keeps the table small enough to build.
 */
function lineSteps(left: string[], right: string[]): Step[] {
  let head = 0;
  while (head < left.length && head < right.length && left[head] === right[head]) head += 1;

  let tail = 0;
  while (
    tail < left.length - head &&
    tail < right.length - head &&
    left[left.length - 1 - tail] === right[right.length - 1 - tail]
  ) {
    tail += 1;
  }

  const a = left.slice(head, left.length - tail);
  const b = right.slice(head, right.length - tail);
  const steps: Step[] = [];

  for (let index = 0; index < head; index += 1) {
    steps.push({ kind: "same", left: index, right: index });
  }

  if (a.length * b.length > LCS_CELL_LIMIT) {
    for (let index = 0; index < a.length; index += 1) {
      steps.push({ kind: "removed", left: head + index, right: -1 });
    }
    for (let index = 0; index < b.length; index += 1) {
      steps.push({ kind: "added", left: -1, right: head + index });
    }
  } else {
    // table[i][j] = length of the longest common subsequence of a[i…] and b[j…].
    const table: number[][] = Array.from({ length: a.length + 1 }, () =>
      new Array<number>(b.length + 1).fill(0),
    );
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        table[i][j] =
          a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }

    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        steps.push({ kind: "same", left: head + i, right: head + j });
        i += 1;
        j += 1;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        steps.push({ kind: "removed", left: head + i, right: -1 });
        i += 1;
      } else {
        steps.push({ kind: "added", left: -1, right: head + j });
        j += 1;
      }
    }
    while (i < a.length) {
      steps.push({ kind: "removed", left: head + i, right: -1 });
      i += 1;
    }
    while (j < b.length) {
      steps.push({ kind: "added", left: -1, right: head + j });
      j += 1;
    }
  }

  for (let index = 0; index < tail; index += 1) {
    steps.push({
      kind: "same",
      left: left.length - tail + index,
      right: right.length - tail + index,
    });
  }

  return steps;
}

/** A character a word can be cut at, so a mark never starts inside a word. */
const BOUNDARY = /[\s<>"'=/]/;

/**
 * The part of a changed line that is actually new, as a range on each side.
 *
 * A paragraph that gains an anchor differs by a dozen characters in the middle
 * of three hundred. Marking the whole line would be true and useless; this is
 * the shared head and tail trimmed away, then widened to the nearest word edge
 * so the mark does not open in the middle of a word.
 */
function markRange(before: string, after: string): [[number, number], [number, number]] {
  const shortest = Math.min(before.length, after.length);

  let head = 0;
  while (head < shortest && before[head] === after[head]) head += 1;
  while (head > 0 && !BOUNDARY.test(before[head - 1])) head -= 1;

  let tail = 0;
  while (
    tail < shortest - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }
  while (tail > 0 && !BOUNDARY.test(before[before.length - tail])) tail -= 1;

  return [
    [head, before.length - tail],
    [head, after.length - tail],
  ];
}

const line = (tokens: Token[], number: number, mark: [number, number] | null): DiffLine => ({
  number,
  tokens,
  mark,
});

/**
 * The original and the updated markup, as rows a side-by-side viewer can draw.
 *
 * Removed and added lines that meet are paired into one `changed` row rather
 * than stacked, because that is what a rewritten line is: an operator reading
 * "before" and "after" wants the two versions of a line on the same row, not
 * one of them pushed a row down the pane.
 */
export function diffHtml(original: string, updated: string): DiffRow[] {
  const leftTokens = tokenizeLines(original);
  const rightTokens = tokenizeLines(updated);
  const leftText = leftTokens.map(lineText);
  const rightText = rightTokens.map(lineText);

  const steps = lineSteps(leftText, rightText);
  const rows: DiffRow[] = [];

  let index = 0;
  while (index < steps.length) {
    const step = steps[index];

    if (step.kind === "same") {
      rows.push({
        kind: "same",
        left: line(leftTokens[step.left], step.left + 1, null),
        right: line(rightTokens[step.right], step.right + 1, null),
      });
      index += 1;
      continue;
    }

    // One run of removals and the run of additions that follows it, paired.
    const removed: number[] = [];
    while (index < steps.length && steps[index].kind === "removed") {
      removed.push(steps[index].left);
      index += 1;
    }
    const added: number[] = [];
    while (index < steps.length && steps[index].kind === "added") {
      added.push(steps[index].right);
      index += 1;
    }

    const pairs = Math.max(removed.length, added.length);
    for (let pair = 0; pair < pairs; pair += 1) {
      const from = removed[pair];
      const to = added[pair];

      if (from !== undefined && to !== undefined) {
        const [leftMark, rightMark] = markRange(leftText[from], rightText[to]);
        rows.push({
          kind: "changed",
          left: line(leftTokens[from], from + 1, leftMark),
          right: line(rightTokens[to], to + 1, rightMark),
        });
      } else if (from !== undefined) {
        rows.push({
          kind: "removed",
          left: line(leftTokens[from], from + 1, null),
          right: null,
        });
      } else {
        rows.push({
          kind: "added",
          left: null,
          right: line(rightTokens[to], to + 1, null),
        });
      }
    }
  }

  return rows;
}

/** A run of unchanged rows the viewer folds away, with how many it hides. */
export interface SkippedRows {
  kind: "skipped";
  count: number;
  /** Where the run starts on each side, so the fold can name the lines it hides. */
  from: number;
}

export type ViewRow = DiffRow | SkippedRows;

/**
 * The changed rows with a few unchanged ones around them, and the rest folded.
 *
 * A whole article is hundreds of lines of markup the approval does not touch.
 * Scrolling through them to find the one anchor is how a reviewer stops reading
 * and starts clicking approve.
 */
export function foldUnchanged(rows: DiffRow[], context: number): ViewRow[] {
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, index) => {
    if (row.kind === "same") return;
    for (let at = index - context; at <= index + context; at += 1) {
      if (at >= 0 && at < rows.length) keep[at] = true;
    }
  });

  const out: ViewRow[] = [];
  let index = 0;
  while (index < rows.length) {
    if (keep[index]) {
      out.push(rows[index]);
      index += 1;
      continue;
    }

    const start = index;
    while (index < rows.length && !keep[index]) index += 1;
    out.push({
      kind: "skipped",
      count: index - start,
      from: rows[start].left?.number ?? rows[start].right?.number ?? 0,
    });
  }

  return out;
}

/** How many lines this approval writes, and how many it takes away. */
export function countChanges(rows: DiffRow[]) {
  let added = 0;
  let removed = 0;
  for (const row of rows) {
    if (row.kind === "same") continue;
    if (row.right) added += 1;
    if (row.left) removed += 1;
  }
  return { added, removed };
}
