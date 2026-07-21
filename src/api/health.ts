import { api } from "./client";

export interface HealthStatus {
  status: "ok";
  database: "up";
  redis: "up";
}

export const getHealth = () => api.get<HealthStatus>("/health").then((response) => response.data);
