/**
 * A passage with its anchor marked.
 *
 * The anchor is searched for rather than assumed: a mismatch should cost the
 * highlight, not the passage the editor came to read. Shared by the placement
 * context in step 1 and the exact-edit review in step 2, so the same words are
 * marked the same way on both sides of the decision.
 */
export default function Highlighted({
  context,
  anchor,
}: {
  context: string;
  anchor: string | null;
}) {
  const at = anchor ? context.indexOf(anchor) : -1;
  if (!anchor || at === -1) return <>{context}</>;
  return (
    <>
      {context.slice(0, at)}
      {/* Grey, not yellow: colour in this system carries status, and this is
          not a status. The underline is what says "the link goes here". */}
      <mark className="rounded bg-surface-strong px-0.5 font-medium text-ink underline decoration-hairline-control underline-offset-2">
        {anchor}
      </mark>
      {context.slice(at + anchor.length)}
    </>
  );
}
