// Server-side helper for fetching data from the herald API.
// Never imported by Client Components — herald URL stays server-side only.
import { HERALD_URL } from "@/lib/config";

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
  const url = `${HERALD_URL}/api/v1/monitor/plots`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`herald ${res.status}: ${url}`);
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
  const url = `${HERALD_URL}/api/v1/entity/${encodeURIComponent(entityID)}/operations`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json() as Promise<EntityOperation[]>;
}

export interface Alert {
  group_key: string;
  fingerprint: string;
  github_issue_url?: string;
  metadata: Record<string, string>;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  entity_ids: string[];
}

export async function fetchAlerts(instrumentID: string): Promise<Alert[]> {
  const url = `${HERALD_URL}/api/v1/notifications/alerts?instrument_id=${encodeURIComponent(instrumentID)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json() as Promise<Alert[]>;
}

export interface Silence {
  id: number;
  instrument_id: string;
  event_type?: string;
  fingerprint?: string;
  silenced_by: string;
  silenced_at: string;
  expires_at: string;
  reason?: string;
  github_issue_url?: string;
}

export async function fetchSilences(instrumentID: string): Promise<Silence[]> {
  const url = `${HERALD_URL}/api/v1/notifications/silences?instrument_id=${encodeURIComponent(instrumentID)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json() as Promise<Silence[]>;
}

export async function fetchEntityGraph(
  entityID: string,
): Promise<EntityGraph | null> {
  const url = `${HERALD_URL}/api/v1/entity/${encodeURIComponent(entityID)}/graph`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`herald ${res.status}: ${url}`);
  return res.json() as Promise<EntityGraph>;
}
