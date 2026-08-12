import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import App from "./App";
import { api } from "./api/client";
import RequireSession from "./components/RequireSession";
import { SESSION_QUERY_KEY } from "./hooks/useSession";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// A session can end mid-visit — it expires, or someone revokes it — and the
// proxy then answers 401 to everything. Re-asking who we are turns that into the
// login screen instead of a shell where every panel has failed. /auth/ is
// excluded: that is where the 401 means "nobody", and reacting to it here would
// loop.
api.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401 && !error.config?.url?.startsWith("/auth/")) {
    queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  }
  return Promise.reject(error);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RequireSession>
          <App />
        </RequireSession>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
