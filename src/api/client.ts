import axios from "axios";

// Keep browser requests same-origin; Vite proxies /api to the local backend in development.
export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL ?? "/api") + "/v1",
});
