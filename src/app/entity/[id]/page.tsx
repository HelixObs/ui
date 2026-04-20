import Link from "next/link";
import { fetchEntityGraph } from "@/lib/gateway";

export default async function EntityPage(props: PageProps<"/entity/[id]">) {
  const { id } = await props.params;
  const entityID = decodeURIComponent(id);

  const graph = await fetchEntityGraph(entityID);

  if (!graph) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-zinc-400 text-sm">
          Entity <span className="font-mono text-zinc-200">{entityID}</span> not found.
        </p>
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 underline">
          ← Search again
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-6 px-6 py-6 max-w-6xl w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Back
          </Link>
          <h1 className="mt-1 font-mono text-lg text-zinc-100">{entityID}</h1>
          <p className="text-xs text-zinc-500">
            {graph.nodes.length} node{graph.nodes.length !== 1 ? "s" : ""},{" "}
            {graph.edges.length} edge{graph.edges.length !== 1 ? "s" : ""}
          </p>
        </div>
        {/* Diagnose button — wired up in Task 7 */}
        <button
          disabled
          title="AI troubleshooting — coming soon"
          className="rounded-md bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-zinc-500 cursor-not-allowed"
        >
          Diagnose with AI
        </button>
      </div>

      {/* DAG canvas — Cytoscape.js component added in Task 3 */}
      <div className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center min-h-96">
        <p className="text-xs text-zinc-600">DAG visualizer — Task 3</p>
      </div>

      {/* Node list */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Nodes
        </h2>
        <div className="grid gap-2">
          {graph.nodes.map((node) => (
            <div
              key={node.id}
              className={`rounded-md border px-4 py-3 text-sm flex items-center justify-between gap-4 ${
                node.has_error
                  ? "border-red-800 bg-red-950/30"
                  : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`size-2 rounded-full shrink-0 ${
                    node.has_error ? "bg-red-500" : "bg-emerald-500"
                  }`}
                />
                <span className="font-mono text-zinc-200 truncate">{node.id}</span>
                <span className="text-zinc-500 shrink-0">{node.instrument_id}</span>
              </div>
              {Object.keys(node.metadata).length > 0 && (
                <span className="text-xs text-zinc-600 shrink-0">
                  {Object.keys(node.metadata).length} metadata key
                  {Object.keys(node.metadata).length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
