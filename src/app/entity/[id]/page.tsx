import Link from "next/link";
import { fetchEntityGraph } from "@/lib/gateway";
import ProvenanceGraph from "@/components/ProvenanceGraph";

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
    <div className="flex-1 flex flex-col gap-4 px-6 py-6 max-w-7xl w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
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

      {/* DAG — click any node to open the detail panel */}
      <ProvenanceGraph
        nodes={graph.nodes}
        edges={graph.edges}
        rootID={entityID}
      />
    </div>
  );
}
