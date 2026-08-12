import { useMutation, useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";

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
    queryFn: async () => {
      try {
        return await getSession();
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

/**
 * Sign out, then reload.
 *
 * `queryClient.clear()` was here and did nothing visible: clearing destroys the
 * cached queries without notifying the observers already mounted on them, so
 * `useSession` above kept reporting the person who had just left and the screen
 * never changed. Reloading is also the only thing that reliably leaves none of
 * their data behind for whoever signs in next.
 *
 * `onSettled`, not `onSuccess`: if the request failed the cookie is still good,
 * and landing back on the dashboard is the honest answer.
 */
export const useLogout = () =>
  useMutation({
    mutationFn: logout,
    onSettled: () => window.location.assign("/"),
  });
