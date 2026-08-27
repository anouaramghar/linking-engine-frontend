import { Fragment, useMemo, type ReactNode } from "react";

/**
 * The assistant's reply, rendered from the small Markdown vocabulary it writes.
 *
 * Not a Markdown library. The model emits one narrow, observable subset —
 * paragraphs, bulleted and numbered lists one level deep, bold figures, italic
 * article titles, and bare dashboard URLs — and a parser for exactly that is
 * easier to reason about than a general pipeline, which is the same argument
 * the diff viewer makes for its own tokenizer.
 *
 * Staying narrow is also the security property. Replies quote crawled article
 * titles verbatim, and that is text from someone else's website: every branch
 * below builds React elements, so a title made of markup renders as the
 * characters it is made of. Nothing here reaches `dangerouslySetInnerHTML`, and
 * an anchor is only ever built from an http(s) URL the scanner itself matched,
 * never from a href written in the reply.
 *
 * Anything outside the subset survives as its own text. An unbalanced `*` is a
 * literal asterisk, not a swallowed rest-of-answer — a reply that renders
 * plainly is a smaller failure than one that loses its numbers.
 */

/**
 * Ordered deliberately: `code` wins over `**`, and `**` over `*`.
 *
 * A marker only opens emphasis when it is against the word it emphasises, and
 * only closes against one — CommonMark's flanking rule, kept because operators
 * write arithmetic. Without it "3 * 4 articles per page" reads its own asterisk
 * as an opener and italicises the rest of the sentence.
 */
const INLINE =
  /`([^`]+)`|\*\*(?!\s)(.+?)(?<!\s)\*\*|\*(?!\s)([^*]+?)(?<!\s)\*|(https?:\/\/[^\s<>]+)/g;

const BULLET = /^(\s*)[*-]\s+(.*)$/;
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/;

type Block =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: { depth: number; text: string }[] };

/** Trailing sentence punctuation belongs to the sentence, not to the URL. */
function splitUrlTail(url: string): [string, string] {
  const tail = /[).,;:!?]+$/.exec(url);
  return tail ? [url.slice(0, -tail[0].length), tail[0]] : [url, ""];
}

function renderInline(line: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  let index = 0;

  INLINE.lastIndex = 0;
  for (let match = INLINE.exec(line); match !== null; match = INLINE.exec(line)) {
    if (match.index > at) out.push(line.slice(at, match.index));
    const key = `${keyPrefix}-${index}`;
    index += 1;
    const [, code, bold, italic, url] = match;

    if (code !== undefined) {
      out.push(
        <code key={key} className="assistant-md-code">
          {code}
        </code>,
      );
    } else if (bold !== undefined) {
      out.push(
        <strong key={key} className="assistant-md-strong">
          {bold}
        </strong>,
      );
    } else if (italic !== undefined) {
      out.push(
        <em key={key} className="assistant-md-em">
          {italic}
        </em>,
      );
    } else if (url !== undefined) {
      const [href, tail] = splitUrlTail(url);
      out.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="assistant-md-link"
        >
          {href}
        </a>,
      );
      if (tail) out.push(tail);
    }
    at = match.index + match[0].length;
  }

  if (at < line.length) out.push(line.slice(at));
  return out;
}

function parse(content: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Extract<Block, { kind: "list" }> | null = null;

  const closeParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", lines: paragraph });
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const raw of content.replace(/\r\n/g, "\n").split("\n")) {
    if (!raw.trim()) {
      closeParagraph();
      closeList();
      continue;
    }

    const bullet = BULLET.exec(raw);
    const numbered = bullet ? null : NUMBERED.exec(raw);
    const item = bullet ?? numbered;

    if (item) {
      closeParagraph();
      const ordered = bullet === null;
      // Indentation is the only nesting signal the model gives, and it writes
      // two or three spaces for one level. One level is all it ever uses, so
      // anything deeper flattens into that level rather than growing a tree.
      const depth = item[1].length >= 2 ? 1 : 0;
      // A numbered run after a bulleted one is a new list, but only at the top
      // level — indented items belong to the entry above them whatever marker
      // they carry.
      if (list && list.ordered !== ordered && depth === 0) closeList();
      if (!list) list = { kind: "list", ordered, items: [] };
      list.items.push({ depth, text: item[2] });
      continue;
    }

    // An indented line carrying no marker continues the entry above it. The
    // model writes them — a suggestion's method and trace trail its score that
    // way — and dropping out of the list here would strand that detail in a
    // paragraph of its own, describing nothing the reader can still see.
    const open = list;
    if (open && open.items.length > 0 && /^\s{2,}\S/.test(raw)) {
      const last = open.items[open.items.length - 1];
      last.text = `${last.text} ${raw.trim()}`;
      continue;
    }

    closeList();
    paragraph.push(raw.trim());
  }

  closeParagraph();
  closeList();
  return blocks;
}

function ListBlock({ block, keyPrefix }: { block: Extract<Block, { kind: "list" }>; keyPrefix: string }) {
  // Each top-level entry owns the indented ones that follow it, so a nested run
  // renders inside its parent rather than as a sibling that lost its context.
  const entries: Array<{ text: string; children: string[] }> = [];
  for (const item of block.items) {
    if (item.depth === 0 || entries.length === 0) entries.push({ text: item.text, children: [] });
    else entries[entries.length - 1].children.push(item.text);
  }

  const Tag = block.ordered ? "ol" : "ul";
  return (
    <Tag className={block.ordered ? "assistant-md-ol" : "assistant-md-ul"}>
      {entries.map((entry, entryIndex) => (
        <li key={entryIndex} className="assistant-md-li">
          {renderInline(entry.text, `${keyPrefix}-${entryIndex}`)}
          {entry.children.length > 0 && (
            /* Always a bulleted child list: the model nests detail under an
               entry, and numbering it a second time reads as a new sequence. */
            <ul className="assistant-md-ul assistant-md-ul--nested">
              {entry.children.map((child, childIndex) => (
                <li key={childIndex} className="assistant-md-li">
                  {renderInline(child, `${keyPrefix}-${entryIndex}-${childIndex}`)}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </Tag>
  );
}

export default function AgentMarkdown({ content }: { content: string }) {
  // The composer re-renders the whole log on every keystroke; parsing each
  // settled reply again on the way past is work nobody asked for.
  const blocks = useMemo(() => parse(content), [content]);

  return (
    <div className="assistant-md">
      {blocks.map((block, blockIndex) =>
        block.kind === "list" ? (
          <ListBlock key={blockIndex} block={block} keyPrefix={`b${blockIndex}`} />
        ) : (
          <p key={blockIndex} className="assistant-md-p">
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line, `b${blockIndex}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
