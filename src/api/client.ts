import axios from "axios";

export const API_TIMEOUT_MS = 30_000;

/**
 * The assistant answers over several model turns, so it is the one request the
 * shared budget above was never sized for: the engine may call a tool, read the
 * result, and only then write a reply. On a slow provider each of those turns
 * can take twenty to forty seconds on its own, which made the panel fail
 * intermittently while the engine went on to answer successfully.
 *
 * This is still a bound, not a licence to hang. A request that outlives it has
 * genuinely stalled, and the panel offers a retry rather than waiting for ever.
 */
export const AGENT_CHAT_TIMEOUT_MS = 120_000;

/** Marker the authenticated proxy requires on unsafe /api methods (CSRF). */
export const LINKMESH_CLIENT_HEADER = "X-LinkMesh-Client";
export const LINKMESH_CLIENT_VALUE = "dashboard";

// Keep browser requests same-origin; Vite proxies /api to the local backend in development.
export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL ?? "/api") + "/v1",
  timeout: API_TIMEOUT_MS,
  headers: {
    [LINKMESH_CLIENT_HEADER]: LINKMESH_CLIENT_VALUE,
  },
});
