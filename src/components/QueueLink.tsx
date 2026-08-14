import { Link, type LinkProps } from "react-router-dom";

import { queueDestination, useQueueSearch } from "../hooks/useQueueNavigation";

type QueueLinkProps = Omit<LinkProps, "to"> & { to?: LinkProps["to"] };

/** A return-to-queue link that keeps the operator's last queue filters. */
export default function QueueLink({ to = "/queue", ...props }: QueueLinkProps) {
  const queueSearch = useQueueSearch();
  const destination = typeof to === "string" ? queueDestination(to, queueSearch) : to;

  return <Link {...props} to={destination} />;
}
