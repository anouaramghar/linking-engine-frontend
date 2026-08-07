import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSession, logout } from "../api/auth";

export const SESSION_QUERY_KEY = ["session"];

/**
 * Who is signed in, or `null`.
 *
 * A 401 is the answer "nobody", not a transport failure, so this never retries:
 * retrying would only delay the login screen by the length of the backoff.
 */
export const useSession = () =>
  useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => getSession().catch(() => null),
    retry: false,
    staleTime: 60_000,
  });

export const useLogout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    // Everything cached was fetched under the session just ended, and the next
    // person to sign in must not inherit it.
    onSettled: () => queryClient.clear(),
  });
};
