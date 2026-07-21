import { useQuery } from "@tanstack/react-query";

import { getHealth } from "../api/health";

export const useHealth = () =>
  useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 15000,
    retry: 1,
  });
