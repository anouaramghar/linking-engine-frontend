import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { acknowledgeAlert, listAlerts } from "../api/alerts";

export const ALERTS_QUERY_KEY = ["alerts"] as const;
const POLL_INTERVAL_MS = 15_000;

export const useAlerts = () => {
  const queryClient = useQueryClient();
  const latest = useQuery({
    queryKey: [...ALERTS_QUERY_KEY, "latest"],
    queryFn: () => listAlerts(),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
  const unread = useQuery({
    queryKey: [...ALERTS_QUERY_KEY, "unread"],
    queryFn: () => listAlerts(true),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
  const acknowledge = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY }),
  });

  return {
    ...latest,
    alerts: latest.data ?? [],
    unreadCount: unread.data?.length ?? null,
    acknowledge: acknowledge.mutate,
    acknowledgePending: acknowledge.isPending,
  };
};
