import Link from "next/link";
import { fetchEntityGraph, fetchEntityOperations } from "@/lib/gateway";
import { GRAFANA_URL } from "@/lib/config";
import ProvenanceGraph from "@/components/ProvenanceGraph";
import OperationTimeline from "@/components/OperationTimeline";
import DiagnoseButton from "@/components/DiagnoseButton";

export default async function EntityPage(props: PageProps<"/entity/[id]">) {
  const { id } = await props.params;
  const entityID = decodeURIComponent(id);

  const [graph, operations] = await Promise.all([
    fetchEntityGraph(entityID),
    fetchEntityOperations(entityID),
  ]);

  if (!graph) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-zinc-500 text-sm">
          Entity <span className="font-mono text-zinc-800">{entityID}</span> not found.
        </p>
        <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-700 underline">
          ← Search again
        </Link>
      </div>
    );
  }

  const instrumentID = graph.nodes.find((n) => n.id === entityID)?.instrument_id;

  return (
    <div className="flex-1 flex flex-col gap-4 px-6 py-6 max-w-7xl w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-700">
            ← Back
          </Link>
          <h1 className="mt-1 font-mono text-lg text-zinc-900">{entityID}</h1>
          <p className="text-xs text-zinc-400">
            {graph.nodes.length} node{graph.nodes.length !== 1 ? "s" : ""},{" "}
            {graph.edges.length} edge{graph.edges.length !== 1 ? "s" : ""}
          </p>
        </div>
        <DiagnoseButton entityID={entityID} instrumentID={instrumentID} />
      </div>

      {/* DAG */}
      <ProvenanceGraph
        nodes={graph.nodes}
        edges={graph.edges}
        rootID={entityID}
        height={operations.length > 0 ? "50vh" : "calc(100vh - 180px)"}
      />

      {/* Operation timeline — only shown when operations exist */}
      <OperationTimeline operations={operations} entityID={entityID} grafanaURL={GRAFANA_URL} />
    </div>
  );
}
