import { api } from "./client";
import type { GraphNeighborhood, GraphNetwork, GraphSummary } from "../types/graph";

export const getGraphSummary = (siteId: number, limit = 50, offset = 0) =>
  api
    .get<GraphSummary>(`/sites/${siteId}/graph/summary`, {
      params: { limit, offset },
    })
    .then((response) => response.data);

export const getGraphNetwork = (siteId: number) =>
  api.get<GraphNetwork>(`/sites/${siteId}/graph/network`).then((response) => response.data);

export const getGraphNeighborhood = (
  siteId: number,
  suggestionIds: number[],
  maxNodes = 80,
) =>
  api
    .post<GraphNeighborhood>(`/sites/${siteId}/graph/neighborhood`, {
      suggestion_ids: suggestionIds,
      max_nodes: maxNodes,
    })
    .then((response) => response.data);
