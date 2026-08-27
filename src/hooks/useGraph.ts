import { useCallback, useRef, useState } from "react";

import { getGraphNeighborhood, getGraphNetwork } from "../api/graph";
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

  const mutate = useCallback(
    ({ siteId, suggestionIds = [] }: { siteId: number; suggestionIds?: number[] }) => {
      const ids = [...new Set(suggestionIds)].filter((id) => Number.isInteger(id) && id > 0);
      run(() =>
        getGraphNetwork(siteId).then((network) => {
          if (ids.length === 0) return network;

          // The full network keeps every active page visible. The neighborhood
          // call supplies article ids for the prepared suggestions, so the
          // overlay never guesses from display URLs and never turns external
          // links into internal edges.
          return getGraphNeighborhood(siteId, ids, 80)
            .then((neighborhood) => ({
              ...network,
              proposed_edges: neighborhood.proposed_edges.filter(
                (edge) => edge.status === "new",
              ),
            }))
            .catch(() => network);
        }),
      );
    },
    [run],
  );

  const reset = useCallback(() => {
    attempt.current += 1;
    setData(undefined);
    setIsPending(false);
    setIsError(false);
  }, []);

  return { data, isPending, isError, mutate, reset };
};
