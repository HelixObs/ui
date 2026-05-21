// BFF route — proxies graph requests from client components to the internal herald.
// Lets client-side code hit one origin with no CORS issues.

import { fetchEntityGraph } from "@/lib/herald";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const entityID = decodeURIComponent(id);

  try {
    const graph = await fetchEntityGraph(entityID);
    if (!graph) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(graph);
  } catch (err) {
    console.error("graph proxy error", err);
    return NextResponse.json({ error: "internal error" }, { status: 502 });
  }
}
