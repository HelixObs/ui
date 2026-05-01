// Server-side helper for fetching data from the gateway API.
// Never imported by Client Components — gateway URL stays server-side only.
import { GATEWAY_URL as gatewayURL } from "@/lib/config";

export interface GraphNode {
  id: string;
  instrument_id: string;
  trace_id: string;
  timestamp_ns: number;
  parent_ids: string[];
  metadata: Record<string, string>;
  has_error: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface EntityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PlotConfig {
  name: string;
  label: string;
  y_min: number;
  y_max: number;
  y_unit: string;
}


export async function fetchMonitorPlots(): Promise<PlotConfig[]> {
  const url = `${gatewayURL}/api/v1/monitor/plots`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${url}`);
  return res.json() as Promise<PlotConfig[]>;
}

export interface EntityOperation {
  operation: string;
  trace_id: string;
  timestamp_ns: number;
  duration_ns: number;
  metadata: Record<string, string>;
}

export async function fetchEntityOperations(entityID: string): Promise<EntityOperation[]> {
  const url = `${gatewayURL}/api/v1/entity/${encodeURIComponent(entityID)}/operations`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json() as Promise<EntityOperation[]>;
}

export async function fetchEntityGraph(
  entityID: string,
): Promise<EntityGraph | null> {
  const url = `${gatewayURL}/api/v1/entity/${encodeURIComponent(entityID)}/graph`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`gateway ${res.status}: ${url}`);
  return res.json() as Promise<EntityGraph>;
}
