import { useCallback, useRef, useState } from "react";

import { simulateGraph } from "../api/graph";

/**
 * Structural simulation is a read-only, explicit action. Keep its state local
 * instead of putting it in the query cache: a result is tied to the selected
 * publication batch and must not reappear for a different batch or site.
 */
export const useGraphSimulation = () => {
  const [data, setData] = useState<Awaited<ReturnType<typeof simulateGraph>>>();
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);
  const attempt = useRef(0);

  const mutate = useCallback(
    ({ siteId, suggestionIds }: { siteId: number; suggestionIds: number[] }) => {
      const ticket = ++attempt.current;
      setData(undefined);
      setIsPending(true);
      setIsError(false);
      void simulateGraph(siteId, suggestionIds).then(
        (result) => {
          if (ticket !== attempt.current) return;
          setData(result);
          setIsPending(false);
        },
        () => {
          if (ticket !== attempt.current) return;
          setIsError(true);
          setIsPending(false);
        },
      );
    },
    [],
  );

  const reset = useCallback(() => {
    attempt.current += 1;
    setData(undefined);
    setIsPending(false);
    setIsError(false);
  }, []);

  return { data, isPending, isError, mutate, reset };
};
