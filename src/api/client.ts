import axios from "axios";

export const API_TIMEOUT_MS = 30_000;

// Keep browser requests same-origin; Vite proxies /api to the local backend in development.
export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL ?? "/api") + "/v1",
  timeout: API_TIMEOUT_MS,
});
