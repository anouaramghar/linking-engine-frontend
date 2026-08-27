import { api } from "./client";
import type { AppAlert } from "../types/alert";

export const ALERT_PAGE_SIZE = 10;

export const listAlerts = (unacknowledged?: boolean) =>
  api
    .get<AppAlert[]>("/alerts", {
      params: {
        limit: ALERT_PAGE_SIZE,
        unacknowledged,
      },
    })
    .then((response) => response.data);

export const acknowledgeAlert = (id: number) =>
  api.post<AppAlert>(`/alerts/${id}/acknowledge`).then((response) => response.data);
