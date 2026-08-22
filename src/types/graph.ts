export interface GraphFeature {
  article_id: number;
  article_url: string;
  article_title: string;
  in_degree: number;
  out_degree: number;
  orphan: boolean;
  underlinked: boolean;
  hub: boolean;
  saturated: boolean;
  hub_score: number;
  saturation_score: number;
}

export interface GraphSummary {
  site_id: number;
  snapshot_id: number;
  source_ingestion_run_id: number | null;
  algorithm_version: string;
  graph_version: string;
  computed_at: string;
  article_count: number;
  edge_count: number;
  orphan_count: number;
  underlinked_count: number;
  hub_count: number;
  saturated_count: number;
  items: GraphFeature[];
  limit: number;
  offset: number;
}

export interface GraphNetworkEdge {
  source_article_id: number;
  target_article_id: number;
}

export interface GraphNetwork {
  site_id: number;
  snapshot_id: number;
  graph_version: string;
  computed_at: string;
  article_count: number;
  edge_count: number;
  orphan_count: number;
  underlinked_count: number;
  hub_count: number;
  saturated_count: number;
  nodes: GraphFeature[];
  edges: GraphNetworkEdge[];
}
