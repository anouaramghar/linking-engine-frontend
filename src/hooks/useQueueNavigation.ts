import { createContext, useContext } from "react";

interface QueueNavigationValue {
  /** The last queue URL, supplied by the app shell while routes change. */
  search: string;
  /** Capture the queue URL immediately before a route leaves the queue. */
  remember: (search: string) => void;
}

export const QueueSearchContext = createContext<QueueNavigationValue>({
  search: "",
  remember: () => undefined,
});

export const useQueueNavigation = () => useContext(QueueSearchContext);

export const useQueueSearch = () => useQueueNavigation().search;

/** Append the remembered queue filters only to an otherwise bare queue path. */
export const queueDestination = (to: string, queueSearch: string) =>
  to === "/queue" && queueSearch ? `${to}${queueSearch}` : to;
