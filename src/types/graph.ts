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

export interface GraphCounts {
  active_articles: number;
  active_links: number;
  orphan_count: number;
  underlinked_count: number;
  hub_count: number;
  saturated_count: number;
  max_in_degree: number;
  max_out_degree: number;
}

export interface GraphSimulation {
  site_id: number;
  snapshot_id: number;
  graph_version: string;
  requested_suggestion_ids: number[];
  applied_suggestion_ids: number[];
  skipped_suggestion_ids: number[];
  duplicate_edge_count: number;
  before: GraphCounts;
  after: GraphCounts;
  orphan_delta: number;
  underlinked_delta: number;
  newly_connected_article_ids: number[];
  newly_saturated_article_ids: number[];
  target_concentration: number;
  warnings: string[];
}
