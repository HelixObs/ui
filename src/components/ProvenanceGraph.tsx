"use client";

import cytoscape, { type Core, type NodeSingular } from "cytoscape";
import dagre from "cytoscape-dagre";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphNode, GraphEdge } from "@/lib/gateway";

cytoscape.use(dagre);

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootID: string;
}

// ── Colours ────────────────────────────────────────────────────────────────────
const C = {
  nodeBg:         "#27272a", // zinc-800
  nodeBorder:     "#52525b", // zinc-600
  nodeErrorBg:    "#7f1d1d", // red-900
  nodeErrorBorder:"#ef4444", // red-500
  nodeRootBorder: "#a1a1aa", // zinc-400
  nodeSelected:   "#e4e4e7", // zinc-200
  nodeHover:      "#71717a", // zinc-500
  label:          "#d4d4d8", // zinc-300
  labelSelected:  "#ffffff",
  edge:           "#3f3f46", // zinc-700
  edgeSelected:   "#71717a", // zinc-500
  bg:             "#09090b", // zinc-950
};

export default function ProvenanceGraph({ nodes, edges, rootID }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef        = useRef<Core | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [ready,    setReady]    = useState(false);

  // ── Mount Cytoscape ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container:  containerRef.current,
      pixelRatio: "auto",               // fixes blurry canvas on HiDPI/Retina
      minZoom:    0.2,
      maxZoom:    4,
      elements: [
        ...nodes.map((n) => ({
          data: {
            id:       n.id,
            label:    n.id.length > 22 ? n.id.slice(0, 20) + "…" : n.id,
            hasError: n.has_error,
            isRoot:   n.id === rootID,
            _node:    n,
          },
        })),
        ...edges.map((e) => ({
          data: { id: `${e.source}▶${e.target}`, source: e.source, target: e.target },
        })),
      ],
      layout: { name: "preset" }, // positions set by dagre below
      style: [
        // ── Nodes ──────────────────────────────────────────────────────────
        {
          selector: "node",
          style: {
            shape:              "ellipse",
            "background-color": C.nodeBg,
            "border-width":     2,
            "border-color":     C.nodeBorder,
            label:              "data(label)",
            color:              C.label,
            "font-size":        11,
            "font-family":      "ui-monospace, 'Geist Mono', monospace",
            "text-valign":      "bottom",
            "text-halign":      "center",
            "text-margin-y":    8,
            width:              44,
            height:             44,
            "transition-property":       "background-color, border-color, width, height",
            "transition-duration":       150,
          },
        },
        {
          selector: "node[?hasError]",
          style: {
            "background-color": C.nodeErrorBg,
            "border-color":     C.nodeErrorBorder,
            "border-width":     2.5,
          },
        },
        {
          selector: `node[id = "${CSS.escape(rootID)}"]`,
          style: {
            "border-color": C.nodeRootBorder,
            "border-width":  3,
            width:           52,
            height:          52,
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-color": C.nodeSelected,
            "border-width":  3,
            color:           C.labelSelected,
          },
        },
        {
          selector: "node.hover",
          style: {
            "border-color": C.nodeHover,
            width:          50,
            height:         50,
          },
        },
        // ── Dimmed (when something else is selected) ───────────────────────
        {
          selector: "node.dimmed, edge.dimmed",
          style: { opacity: 0.25 },
        },
        // ── Edges ──────────────────────────────────────────────────────────
        {
          selector: "edge",
          style: {
            width:                1.5,
            "line-color":         C.edge,
            "target-arrow-color": C.edge,
            "target-arrow-shape": "triangle",
            "curve-style":        "bezier",
            "arrow-scale":        0.9,
            "transition-property": "line-color, target-arrow-color, opacity",
            "transition-duration": 150,
          },
        },
        {
          selector: "edge:selected, edge.highlighted",
          style: {
            "line-color":         C.edgeSelected,
            "target-arrow-color": C.edgeSelected,
            width:                2.5,
          },
        },
      ],
    });

    // ── Interactions ─────────────────────────────────────────────────────────
    cy.on("mouseover", "node", (e) => {
      const node = e.target as NodeSingular;
      node.addClass("hover");
      (containerRef.current as HTMLElement).style.cursor = "pointer";
    });
    cy.on("mouseout", "node", (e) => {
      const node = e.target as NodeSingular;
      node.removeClass("hover");
      (containerRef.current as HTMLElement).style.cursor = "default";
    });

    cy.on("tap", "node", (e) => {
      const node = e.target as NodeSingular;
      // Highlight neighbourhood, dim everything else.
      cy.elements().addClass("dimmed");
      node.removeClass("dimmed");
      node.connectedEdges().removeClass("dimmed").addClass("highlighted");
      node.connectedEdges().connectedNodes().removeClass("dimmed");
      setSelected(node.data("_node") as GraphNode);
    });

    cy.on("tap", (e) => {
      if (e.target !== cy) return;
      cy.elements().removeClass("dimmed highlighted");
      setSelected(null);
    });

    cyRef.current = cy;

    // Run dagre layout, then fit once positions are finalised.
    const layout = cy.layout({
      name:    "dagre",
      rankDir: "LR",
      rankSep: 80,
      nodeSep: 40,
      padding: 48,
    } as cytoscape.LayoutOptions);

    layout.one("layoutstop", () => {
      cy.fit(undefined, 48);
      setReady(true);
    });
    layout.run();

    return () => {
      cy.destroy();
      cyRef.current = null;
      setReady(false);
    };
  }, [nodes, edges, rootID]);

  // ── Toolbar callbacks ────────────────────────────────────────────────────────
  const zoomIn  = useCallback(() => cyRef.current?.zoom({ level: (cyRef.current?.zoom() ?? 1) * 1.3, renderedPosition: { x: (containerRef.current?.clientWidth ?? 0) / 2, y: (containerRef.current?.clientHeight ?? 0) / 2 } }), []);
  const zoomOut = useCallback(() => cyRef.current?.zoom({ level: (cyRef.current?.zoom() ?? 1) / 1.3, renderedPosition: { x: (containerRef.current?.clientWidth ?? 0) / 2, y: (containerRef.current?.clientHeight ?? 0) / 2 } }), []);
  const fit     = useCallback(() => cyRef.current?.fit(undefined, 48), []);

  return (
    <div className="flex flex-1 gap-3 min-h-0">
      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950 min-h-96">
        {/* graph canvas */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* fade-in overlay while layout animates */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-zinc-600 animate-pulse">Laying out graph…</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/80 backdrop-blur px-2 py-1.5 shadow-xl">
          <ToolbarButton onClick={zoomIn}  title="Zoom in">+</ToolbarButton>
          <ToolbarButton onClick={zoomOut} title="Zoom out">−</ToolbarButton>
          <div className="w-px h-4 bg-zinc-700 mx-1" />
          <ToolbarButton onClick={fit} title="Fit graph">⊡</ToolbarButton>
        </div>

        {/* Node count badge */}
        <div className="absolute top-3 left-3 rounded-md bg-zinc-900/70 backdrop-blur border border-zinc-800 px-2.5 py-1 text-xs text-zinc-500 pointer-events-none">
          {nodes.length} node{nodes.length !== 1 ? "s" : ""} · {edges.length} edge{edges.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ── Node detail panel ───────────────────────────────────────────────── */}
      {selected && (
        <NodePanel node={selected} onClose={() => {
          setSelected(null);
          cyRef.current?.elements().removeClass("dimmed highlighted");
        }} />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ToolbarButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 text-base font-medium transition-colors"
    >
      {children}
    </button>
  );
}

function NodePanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  return (
    <aside className="w-72 shrink-0 rounded-xl border border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden shadow-xl">
      {/* Header */}
      <div className={`px-4 py-3 border-b flex items-start justify-between gap-2 ${node.has_error ? "border-red-900 bg-red-950/40" : "border-zinc-800"}`}>
        <div className="min-w-0">
          <p className="font-mono text-sm text-zinc-100 break-all leading-snug">{node.id}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{node.instrument_id}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-zinc-600 hover:text-zinc-300 text-xl leading-none shrink-0 mt-0.5 transition-colors">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full shrink-0 ${node.has_error ? "bg-red-500 shadow-[0_0_6px_theme(colors.red.500)]" : "bg-emerald-500 shadow-[0_0_6px_theme(colors.emerald.500)]"}`} />
          <span className="text-xs text-zinc-400">{node.has_error ? "error detected" : "ok"}</span>
        </div>

        {/* Trace ID */}
        {node.trace_id && (
          <Field label="Trace ID">
            <p className="font-mono text-xs text-zinc-400 break-all">{node.trace_id}</p>
          </Field>
        )}

        {/* Metadata */}
        {Object.keys(node.metadata).length > 0 && (
          <Field label="Metadata">
            <dl className="grid gap-1.5">
              {Object.entries(node.metadata).map(([k, v]) => (
                <div key={k} className="grid grid-cols-2 gap-2 text-xs">
                  <dt className="text-zinc-500 truncate" title={k}>{k}</dt>
                  <dd className="font-mono text-zinc-300 break-all">{v}</dd>
                </div>
              ))}
            </dl>
          </Field>
        )}

        {/* Parents */}
        {node.parent_ids.length > 0 && (
          <Field label="Parents">
            <ul className="flex flex-col gap-1">
              {node.parent_ids.map((pid) => (
                <li key={pid} className="font-mono text-xs text-zinc-400 break-all">{pid}</li>
              ))}
            </ul>
          </Field>
        )}
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{label}</p>
      {children}
    </div>
  );
}
