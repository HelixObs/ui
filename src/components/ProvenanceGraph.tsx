"use client";

import cytoscape, { type Core } from "cytoscape";
import { useEffect, useRef, useState } from "react";
import type { GraphNode, GraphEdge } from "@/lib/gateway";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootID: string;
}

export default function ProvenanceGraph({ nodes, edges, rootID }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Nodes with no incoming edge are DAG roots (most ancestral).
    const targeted = new Set(edges.map((e) => e.target));

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...nodes.map((n) => ({
          data: {
            id: n.id,
            label: n.id.length > 20 ? n.id.slice(0, 18) + "…" : n.id,
            hasError: n.has_error,
            isRoot: n.id === rootID,
            _node: n,
          },
        })),
        ...edges.map((e) => ({
          data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target },
        })),
      ],
      layout: {
        name: "breadthfirst",
        directed: true,
        roots: nodes
          .filter((n) => !targeted.has(n.id))
          .map((n) => `#${CSS.escape(n.id)}`),
        padding: 48,
        spacingFactor: 1.6,
        avoidOverlap: true,
      },
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#3f3f46",
            label: "data(label)",
            color: "#d4d4d8",
            "font-size": "11px",
            "font-family": "ui-monospace, monospace",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 6,
            width: 36,
            height: 36,
            "border-width": 2,
            "border-color": "#52525b",
          },
        },
        {
          selector: "node[?hasError]",
          style: {
            "background-color": "#dc2626",
            "border-color": "#ef4444",
          },
        },
        {
          selector: `node[id = "${rootID}"]`,
          style: {
            "border-width": 3,
            "border-color": "#a1a1aa",
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-color": "#e4e4e7",
            "border-width": 3,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#52525b",
            "target-arrow-color": "#52525b",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
          },
        },
      ],
    });

    cy.on("tap", "node", (evt) => {
      setSelected(evt.target.data("_node") as GraphNode);
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) setSelected(null);
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [nodes, edges, rootID]);

  return (
    <div className="flex flex-1 gap-4 min-h-0">
      <div
        ref={containerRef}
        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 min-h-96"
      />
      {selected && (
        <NodePanel node={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function NodePanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  return (
    <aside className="w-72 shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm text-zinc-100 break-all">{node.id}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{node.instrument_id}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="text-zinc-600 hover:text-zinc-300 text-xl leading-none shrink-0 mt-0.5"
        >
          ×
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`size-2 rounded-full shrink-0 ${node.has_error ? "bg-red-500" : "bg-emerald-500"}`}
        />
        <span className="text-xs text-zinc-400">
          {node.has_error ? "has error" : "ok"}
        </span>
      </div>

      {node.trace_id && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            Trace
          </p>
          <p className="font-mono text-xs text-zinc-400 break-all">{node.trace_id}</p>
        </div>
      )}

      {Object.keys(node.metadata).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Metadata
          </p>
          <dl className="grid gap-1.5">
            {Object.entries(node.metadata).map(([k, v]) => (
              <div key={k} className="grid grid-cols-2 gap-2 text-xs">
                <dt className="text-zinc-500 truncate" title={k}>
                  {k}
                </dt>
                <dd className="font-mono text-zinc-300 break-all">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {node.parent_ids.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Parents
          </p>
          <ul className="flex flex-col gap-1">
            {node.parent_ids.map((pid) => (
              <li key={pid} className="font-mono text-xs text-zinc-400 break-all">
                {pid}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
