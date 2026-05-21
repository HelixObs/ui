"use client";

import { useEffect, useRef, useState } from "react";
import type { EntityOperation } from "@/lib/herald";

// ── Layout ───────────────────────────────────────────────────────
const LABEL_W  = 200;
const ROW_H    = 36;
const BAR_H    = 20;
const PAD_TOP  = 8;
const PAD_R    = 52;
const AXIS_H   = 100; // bottom axis: space for angled UTC labels
const MIN_BAR  = 3;

const BAR       = "#2dd4bf";
const ROW_HOVER = "#f0fdfa";

// ── Formatters ───────────────────────────────────────────────────
function fmtDuration(ns: number): string {
  if (ns <= 0)            return "0";
  if (ns < 1_000)         return `${ns}ns`;
  if (ns < 1_000_000)     return `${(ns / 1_000).toFixed(2)}µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(2)}ms`;
  return `${(ns / 1_000_000_000).toFixed(3)}s`;
}

function fmtAbsTime(ns: number): string {
  const d    = new Date(ns / 1_000_000);
  const yyyy = d.getUTCFullYear();
  const mo   = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(d.getUTCDate()).padStart(2, "0");
  const hh   = String(d.getUTCHours()).padStart(2, "0");
  const mm   = String(d.getUTCMinutes()).padStart(2, "0");
  const ss   = String(d.getUTCSeconds()).padStart(2, "0");
  const ms   = String(d.getUTCMilliseconds()).padStart(3, "0");
  return `${yyyy}-${mo}-${dd} ${hh}:${mm}:${ss}.${ms} UTC`;
}

function niceTicks(rangeNs: number, count = 5): number[] {
  const steps = [
    1e3, 2e3, 5e3, 10e3, 20e3, 50e3, 100e3, 200e3, 500e3,
    1e6, 2e6, 5e6, 10e6, 20e6, 50e6, 100e6, 200e6, 500e6,
    1e9, 2e9, 5e9, 10e9, 30e9, 60e9, 300e9, 600e9, 3600e9,
  ];
  const target   = rangeNs / count;
  const interval = steps.find((s) => s >= target) ?? 3600e9;
  const ticks: number[] = [0];
  for (let t = interval; t <= rangeNs + interval * 0.01; t += interval)
    ticks.push(Math.min(t, rangeNs));
  return [...new Set(ticks)];
}

// ── Component ────────────────────────────────────────────────────
interface Tooltip { x: number; y: number; op: EntityOperation }
interface Props   { operations: EntityOperation[]; entityID: string; grafanaURL: string }

function grafanaTraceURL(grafanaURL: string, entityID: string, traceID: string): string {
  return (
    `${grafanaURL}/d/helix-entity-inspector` +
    `?var-entity_id=${encodeURIComponent(entityID)}` +
    `&var-active_trace_id=${encodeURIComponent(traceID)}`
  );
}

export default function OperationTimeline({ operations, entityID, grafanaURL }: Props) {
  const containerRef                = useRef<HTMLDivElement>(null);
  const [width, setWidth]           = useState(0);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [tooltip, setTooltip]       = useState<Tooltip | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!operations.length) return null;

  const minNs   = Math.min(...operations.map((o) => o.timestamp_ns));
  const maxNs   = Math.max(...operations.map((o) => o.timestamp_ns + o.duration_ns));
  const rangeNs = Math.max(maxNs - minNs, 1);
  const barsW   = Math.max(width - LABEL_W - PAD_R, 1);

  // SVG layout: PAD_TOP → rows → axis line → angled labels
  const rowsH = operations.length * ROW_H;
  const axisY = PAD_TOP + rowsH;
  const svgH  = axisY + AXIS_H;
  const ticks = niceTicks(rangeNs);

  const xOf = (ns: number)  => LABEL_W + ((ns - minNs) / rangeNs) * barsW;
  const wOf = (dur: number) => Math.max(MIN_BAR, (dur / rangeNs) * barsW);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Operation timeline
        </p>
        <p className="font-mono text-xs text-zinc-400">
          {fmtDuration(rangeNs)} total · {operations.length} operation{operations.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div ref={containerRef} className="relative select-none">
        {width > 0 && (
          <svg width={width} height={svgH} style={{ display: "block" }}>

            {/* ── Vertical grid lines ── */}
            {ticks.map((t) => (
              <line
                key={t}
                x1={xOf(minNs + t)} x2={xOf(minNs + t)}
                y1={PAD_TOP} y2={axisY}
                stroke="#f4f4f5" strokeWidth={1}
              />
            ))}

            {/* Label | bars separator */}
            <line
              x1={LABEL_W} x2={LABEL_W}
              y1={PAD_TOP} y2={axisY}
              stroke="#f4f4f5" strokeWidth={1}
            />

            {/* ── Rows ── */}
            {operations.map((op, i) => {
              const rowY  = PAD_TOP + i * ROW_H;
              const barX  = xOf(op.timestamp_ns);
              const barW  = wOf(op.duration_ns);
              const barY  = rowY + (ROW_H - BAR_H) / 2;
              const dur   = fmtDuration(op.duration_ns);
              const hov   = hoveredRow === i;
              const labelX = barX + barW + 6;
              const fitInside = barW > 56;

              return (
                <g
                  key={i}
                  onMouseEnter={() => setHoveredRow(i)}
                  onMouseLeave={() => { setHoveredRow(null); setTooltip(null); }}
                >
                  <rect
                    x={0} y={rowY} width={width} height={ROW_H}
                    fill={hov ? ROW_HOVER : "transparent"}
                  />
                  <line
                    x1={0} x2={width}
                    y1={rowY + ROW_H} y2={rowY + ROW_H}
                    stroke="#f4f4f5" strokeWidth={1}
                  />
                  <text
                    x={12} y={rowY + ROW_H / 2 + 4}
                    fontSize={11.5}
                    fontFamily="ui-monospace, 'Geist Mono', monospace"
                    fill={hov ? "#0f766e" : "#52525b"}
                  >
                    {op.operation.length > 24 ? op.operation.slice(0, 22) + "…" : op.operation}
                  </text>
                  <rect
                    x={barX} y={barY} width={barW} height={BAR_H} rx={3}
                    fill={BAR} opacity={hov ? 1 : 0.8}
                    style={{ cursor: op.trace_id ? "pointer" : "default" }}
                    onClick={() => {
                      if (op.trace_id)
                        window.open(grafanaTraceURL(grafanaURL, entityID, op.trace_id), "_blank");
                    }}
                    onMouseEnter={(e) => {
                      const rect = containerRef.current!.getBoundingClientRect();
                      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, op });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                  {fitInside ? (
                    <text
                      x={barX + barW / 2} y={barY + BAR_H / 2 + 4}
                      textAnchor="middle" fontSize={10}
                      fontFamily="ui-monospace, 'Geist Mono', monospace"
                      fill="white" pointerEvents="none"
                    >
                      {dur}
                    </text>
                  ) : (
                    labelX + 40 < width && (
                      <text
                        x={labelX} y={barY + BAR_H / 2 + 4}
                        fontSize={10}
                        fontFamily="ui-monospace, 'Geist Mono', monospace"
                        fill="#a1a1aa" pointerEvents="none"
                      >
                        {dur}
                      </text>
                    )
                  )}
                </g>
              );
            })}

            {/* ── Bottom axis line ── */}
            <line
              x1={LABEL_W} x2={width - PAD_R}
              y1={axisY} y2={axisY}
              stroke="#d4d4d8" strokeWidth={1}
            />

            {/* ── Tick marks + angled UTC labels ── */}
            {ticks.map((t) => {
              const x = xOf(minNs + t);
              return (
                <g key={t}>
                  <line
                    x1={x} x2={x} y1={axisY} y2={axisY + 5}
                    stroke="#a1a1aa" strokeWidth={1}
                  />
                  <text
                    transform={`rotate(35, ${x}, ${axisY + 7})`}
                    x={x} y={axisY + 7}
                    textAnchor="start"
                    fontSize={9.5}
                    fontFamily="ui-monospace, 'Geist Mono', monospace"
                    fill="#a1a1aa"
                  >
                    {fmtAbsTime(minNs + t)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* ── Tooltip ── */}
        {tooltip && (
          <div
            className="absolute z-10 pointer-events-none rounded-lg border border-zinc-200 bg-white shadow-xl px-3.5 py-2.5 text-xs min-w-[200px]"
            style={{
              left: Math.min(tooltip.x + 14, width - 216),
              top:  Math.max(tooltip.y - 80, 4),
            }}
          >
            <p className="font-mono font-semibold text-zinc-900 mb-2">{tooltip.op.operation}</p>
            {tooltip.op.trace_id && (
              <p className="text-[10px] text-teal-600 mb-1.5">Click to open trace in Grafana →</p>
            )}
            <div className="flex flex-col gap-1.5 text-[11px]">
              <div className="flex justify-between gap-6">
                <span className="text-zinc-400">duration</span>
                <span className="font-mono text-zinc-700">{fmtDuration(tooltip.op.duration_ns)}</span>
              </div>
              {tooltip.op.trace_id && (
                <div className="flex justify-between gap-6">
                  <span className="text-zinc-400">trace</span>
                  <span className="font-mono text-zinc-500">{tooltip.op.trace_id.slice(0, 14)}…</span>
                </div>
              )}
              {Object.entries(tooltip.op.metadata).slice(0, 3).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6">
                  <span className="text-zinc-400 truncate max-w-[80px]">{k}</span>
                  <span className="font-mono text-zinc-700 truncate max-w-[100px]">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
