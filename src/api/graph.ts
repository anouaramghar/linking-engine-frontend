import { api } from "./client";
import type { GraphNetwork, GraphSummary } from "../types/graph";

export const getGraphSummary = (siteId: number, limit = 50, offset = 0) =>
  api
    .get<GraphSummary>(`/sites/${siteId}/graph/summary`, {
      params: { limit, offset },
    })
    .then((response) => response.data);

export const getGraphNetwork = (siteId: number) =>
  api.get<GraphNetwork>(`/sites/${siteId}/graph/network`).then((response) => response.data);
