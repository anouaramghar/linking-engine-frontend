import { api } from "./client";
import type { GraphSimulation, GraphSummary } from "../types/graph";

export const getGraphSummary = (siteId: number, limit = 50, offset = 0) =>
  api
    .get<GraphSummary>(`/sites/${siteId}/graph/summary`, {
      params: { limit, offset },
    })
    .then((response) => response.data);

export const simulateGraph = (siteId: number, suggestionIds: number[]) =>
  api
    .post<GraphSimulation>(`/sites/${siteId}/graph/simulations`, {
      suggestion_ids: suggestionIds,
    })
    .then((response) => response.data);
