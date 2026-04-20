// Server-side helper for fetching data from the gateway API.
// Never imported by Client Components — gateway URL stays server-side only.

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

const gatewayURL = process.env.GATEWAY_URL ?? "http://localhost:8080";

export async function fetchEntityGraph(
  entityID: string,
): Promise<EntityGraph | null> {
  const url = `${gatewayURL}/api/v1/entity/${encodeURIComponent(entityID)}/graph`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`gateway ${res.status}: ${url}`);
  return res.json() as Promise<EntityGraph>;
}
