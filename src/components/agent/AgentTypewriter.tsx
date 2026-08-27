import { memo, useEffect, useRef, useState } from "react";

import { useMediaQuery } from "../../hooks/useMediaQuery";
import { REDUCED_MOTION_QUERY } from "../../hooks/useTheme";
import AgentMarkdown from "./AgentMarkdown";

/** Keep the reveal legible without making a long answer feel artificially slow. */
const REVEAL_INTERVAL_MS = 24;
const REVEAL_CHARS_PER_TICK = 2;

interface AgentTypewriterProps {
  content: string;
  streaming: boolean;
  /** Keep the conversation pinned while the visible text grows. */
  onReveal?: () => void;
}

/**
 * Reveal a streamed answer at a steady pace while the network is still open.
 *
 * The stream can deliver a whole sentence in one delta, so rendering `content`
 * directly still feels like a jump. One interval handles the reveal in small
 * chunks; the target lives in a ref so arriving deltas do not restart the
 * clock. Once the stream ends, the authoritative response is shown at once.
 */
const AgentTypewriter = memo(function AgentTypewriter({
  content,
  streaming,
  onReveal,
}: AgentTypewriterProps) {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const [visibleLength, setVisibleLength] = useState(() =>
    streaming && !reducedMotion ? 0 : content.length,
  );
  const visibleLengthRef = useRef(visibleLength);
  const targetRef = useRef(content);

  targetRef.current = content;

  useEffect(() => {
    if (!streaming || reducedMotion) {
      const nextLength = targetRef.current.length;
      if (visibleLengthRef.current !== nextLength) {
        visibleLengthRef.current = nextLength;
        setVisibleLength(nextLength);
      }
      return;
    }

    const interval = window.setInterval(() => {
      const targetLength = targetRef.current.length;
      const currentLength = visibleLengthRef.current;
      if (currentLength >= targetLength) return;

      const nextLength = Math.min(
        targetLength,
        currentLength + REVEAL_CHARS_PER_TICK,
      );
      visibleLengthRef.current = nextLength;
      setVisibleLength(nextLength);
    }, REVEAL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [reducedMotion, streaming]);

  useEffect(() => {
    if (streaming && visibleLength > 0) onReveal?.();
  }, [onReveal, streaming, visibleLength]);

  // Do not wait for the synchronization effect to run when the stream closes:
  // the final response may contain a server-side repair and must be visible in
  // the same render that removes the streaming state.
  const renderedLength = streaming && !reducedMotion ? visibleLength : content.length;
  return <AgentMarkdown content={content.slice(0, renderedLength)} />;
});

export default AgentTypewriter;
