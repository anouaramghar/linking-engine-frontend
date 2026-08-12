import axios from "axios";

export const API_TIMEOUT_MS = 30_000;

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
