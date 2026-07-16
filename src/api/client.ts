import axios from "axios";

// Dev: vite proxies /api -> localhost:8000. Prod: nginx does the same.
export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL ?? "/api") + "/v1",
});
