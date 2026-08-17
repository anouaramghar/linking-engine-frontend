import { useQuery } from "@tanstack/react-query";

import { getTraceEvents, type TraceEventFilters } from "../api/traceability";

export const useTraceEvents = (
  filters: TraceEventFilters,
  limit: number,
  offset: number,
) =>
  useQuery({
    queryKey: ["suggestion-events", filters, limit, offset],
    queryFn: () => getTraceEvents(filters, limit, offset),
  });
