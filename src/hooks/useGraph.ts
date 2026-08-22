import { useCallback, useRef, useState } from "react";

import { getGraphNetwork } from "../api/graph";
import type { GraphNetwork } from "../types/graph";

/**
 * The site network is an explicit, read-only action. Keep its state local to
 * the review page so a graph for one site or batch cannot reappear elsewhere.
 */
export const useGraphNetwork = () => {
  const [data, setData] = useState<GraphNetwork>();
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);
  const attempt = useRef(0);

  const run = useCallback((loader: () => Promise<GraphNetwork>) => {
    const ticket = ++attempt.current;
    setData(undefined);
    setIsPending(true);
    setIsError(false);
    void loader().then(
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
  }, []);

  const mutate = useCallback(({ siteId }: { siteId: number }) => run(() => getGraphNetwork(siteId)), [run]);

  const reset = useCallback(() => {
    attempt.current += 1;
    setData(undefined);
    setIsPending(false);
    setIsError(false);
  }, []);

  return { data, isPending, isError, mutate, reset };
};
