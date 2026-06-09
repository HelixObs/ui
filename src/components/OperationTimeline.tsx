"use client";

import { useEffect, useRef, useState } from "react";
import type { EntityOperation } from "@/lib/herald";

// ── Layout ───────────────────────────────────────────────────────
const LABEL_W   = 200;
const ROW_H     = 36;
const BAR_H     = 20;
const PAD_TOP   = 8;
const PAD_R     = 52;
const AXIS_H    = 100;
const OVERVIEW_H = 28;
const MIN_BAR   = 3;

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

// Adaptive precision: show less detail for longer visible ranges
function fmtAbsTime(ns: number, visRangeNs: number): string {
  const d  = new Date(ns / 1_000_000);
  const p  = (n: number, w = 2) => String(n).padStart(w, "0");
  const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  const hh = p(d.getUTCHours()), mm = p(d.getUTCMinutes()), ss = p(d.getUTCSeconds());
  const ms = p(d.getUTCMilliseconds(), 3);
  if (visRangeNs >= 24 * 3600e9) return `${date} ${hh}:${mm} UTC`;
  if (visRangeNs >= 60e9)        return `${date} ${hh}:${mm}:${ss} UTC`;
  return `${date} ${hh}:${mm}:${ss}.${ms} UTC`;
}

// Dynamic ticks: log10-based, works for any range from ns to months
function niceTicks(rangeNs: number, count = 6): number[] {
  if (rangeNs <= 0) return [0];
  const target = rangeNs / count;
  const exp    = Math.floor(Math.log10(target));
  const mag    = 10 ** exp;
  const norm   = target / mag;
  const nice   = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  const interval = nice * mag;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<{ startX: number; startOffset: number } | null>(null);
  const didDragRef   = useRef(false);

  const [width, setWidth]           = useState(0);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [tooltip, setTooltip]       = useState<Tooltip | null>(null);
  const [scale, setScale]           = useState(1);
  const [offsetFrac, setOffsetFrac] = useState(0);

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

  // Visible window
  const visRangeNs = rangeNs / scale;
  const visMinNs   = minNs + offsetFrac * rangeNs;

  const ticks = niceTicks(visRangeNs);

  // x coord for an absolute ns timestamp; w for a duration
  const xOf = (ns: number)  => LABEL_W + ((ns - visMinNs) / visRangeNs) * barsW;
  const wOf = (dur: number) => Math.max(MIN_BAR, (dur / visRangeNs) * barsW);

  // SVG layout
  const rowsH     = operations.length * ROW_H;
  const axisY     = PAD_TOP + rowsH;
  const overviewY = axisY + AXIS_H;
  const svgH      = overviewY + (scale > 1 ? OVERVIEW_H : 0);

  // Overview viewport rect (in barsW-space, no zoom applied)
  const ovX = LABEL_W + offsetFrac * barsW;
  const ovW = Math.max(4, barsW / scale);

  // ── Event handlers ───────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect  = containerRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    // Fraction of bars area where the cursor is
    const frac  = Math.max(0, Math.min(1, (mouseX - LABEL_W) / barsW));
    const factor = e.deltaY < 0 ? 1.3 : 1 / 1.3;
    const newScale = Math.max(1, Math.min(1000, scale * factor));

    if (newScale === 1) {
      setScale(1);
      setOffsetFrac(0);
      return;
    }

    // Keep the ns under the cursor fixed after zoom
    const mouseNs     = visMinNs + frac * visRangeNs;
    const newVisRange = rangeNs / newScale;
    const newOffset   = Math.max(0, Math.min(1 - 1 / newScale,
      (mouseNs - minNs - frac * newVisRange) / rangeNs));
    setScale(newScale);
    setOffsetFrac(newOffset);
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (scale <= 1) return;
    dragRef.current  = { startX: e.clientX, startOffset: offsetFrac };
    didDragRef.current = false;
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 3) didDragRef.current = true;
    // 1px = rangeNs/(scale*barsW) ns; dragging right reveals earlier content → offset decreases
    const newOffset = Math.max(0, Math.min(1 - 1 / scale,
      dragRef.current.startOffset - dx / (scale * barsW)));
    setOffsetFrac(newOffset);
  };

  const handleMouseUp = () => { dragRef.current = null; };

  const resetZoom = () => { setScale(1); setOffsetFrac(0); };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Operation timeline
        </p>
        <div className="flex items-center gap-3">
          {scale > 1 && (
            <button
              onClick={resetZoom}
              className="text-[11px] font-mono text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-2 py-0.5 rounded transition-colors"
            >
              {scale.toFixed(1)}× · reset zoom
            </button>
          )}
          <p className="font-mono text-xs text-zinc-400">
            {fmtDuration(rangeNs)} total · {operations.length} operation{operations.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div ref={containerRef} className="relative select-none">
        {width > 0 && (
          <svg
            width={width} height={svgH}
            style={{ display: "block", cursor: scale > 1 ? (dragRef.current ? "grabbing" : "grab") : "default" }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <defs>
              {/* Clip bars and grid lines to the bars area */}
              <clipPath id="bars-clip">
                <rect x={LABEL_W} y={0} width={barsW} height={axisY + AXIS_H} />
              </clipPath>
            </defs>

            {/* ── Vertical grid lines ── */}
            <g clipPath="url(#bars-clip)">
              {ticks.map((t) => (
                <line
                  key={t}
                  x1={xOf(visMinNs + t)} x2={xOf(visMinNs + t)}
                  y1={PAD_TOP} y2={axisY}
                  stroke="#f4f4f5" strokeWidth={1}
                />
              ))}
            </g>

            {/* Label | bars separator */}
            <line x1={LABEL_W} x2={LABEL_W} y1={PAD_TOP} y2={axisY} stroke="#f4f4f5" strokeWidth={1} />

            {/* ── Rows ── */}
            {operations.map((op, i) => {
              const rowY      = PAD_TOP + i * ROW_H;
              const barX      = xOf(op.timestamp_ns);
              const barW      = wOf(op.duration_ns);
              const barY      = rowY + (ROW_H - BAR_H) / 2;
              const dur       = fmtDuration(op.duration_ns);
              const hov       = hoveredRow === i;
              const labelX    = barX + barW + 6;
              const fitInside = barW > 56;

              return (
                <g
                  key={i}
                  onMouseEnter={() => setHoveredRow(i)}
                  onMouseLeave={() => { setHoveredRow(null); setTooltip(null); }}
                >
                  <rect x={0} y={rowY} width={width} height={ROW_H} fill={hov ? ROW_HOVER : "transparent"} />
                  <line x1={0} x2={width} y1={rowY + ROW_H} y2={rowY + ROW_H} stroke="#f4f4f5" strokeWidth={1} />
                  <text
                    x={12} y={rowY + ROW_H / 2 + 4}
                    fontSize={11.5} fontFamily="ui-monospace, 'Geist Mono', monospace"
                    fill={hov ? "#0f766e" : "#52525b"}
                  >
                    {op.operation.length > 24 ? op.operation.slice(0, 22) + "…" : op.operation}
                  </text>

                  <g clipPath="url(#bars-clip)">
                    <rect
                      x={barX} y={barY} width={barW} height={BAR_H} rx={3}
                      fill={BAR} opacity={hov ? 1 : 0.8}
                      style={{ cursor: op.trace_id ? "pointer" : "inherit" }}
                      onClick={() => {
                        if (op.trace_id && !didDragRef.current)
                          window.open(grafanaTraceURL(grafanaURL, entityID, op.trace_id), "_blank");
                      }}
                      onMouseEnter={(e) => {
                        const r = containerRef.current!.getBoundingClientRect();
                        setTooltip({ x: e.clientX - r.left, y: e.clientY - r.top, op });
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
                      labelX + 40 < LABEL_W + barsW && (
                        <text
                          x={labelX} y={barY + BAR_H / 2 + 4}
                          fontSize={10} fontFamily="ui-monospace, 'Geist Mono', monospace"
                          fill="#a1a1aa" pointerEvents="none"
                        >
                          {dur}
                        </text>
                      )
                    )}
                  </g>
                </g>
              );
            })}

            {/* ── Bottom axis line ── */}
            <line x1={LABEL_W} x2={width - PAD_R} y1={axisY} y2={axisY} stroke="#d4d4d8" strokeWidth={1} />

            {/* ── Tick marks + adaptive UTC labels ── */}
            <g clipPath="url(#bars-clip)">
              {ticks.map((t) => {
                const x = xOf(visMinNs + t);
                return (
                  <g key={t}>
                    <line x1={x} x2={x} y1={axisY} y2={axisY + 5} stroke="#a1a1aa" strokeWidth={1} />
                    <text
                      transform={`rotate(35, ${x}, ${axisY + 7})`}
                      x={x} y={axisY + 7}
                      textAnchor="start" fontSize={9.5}
                      fontFamily="ui-monospace, 'Geist Mono', monospace"
                      fill="#a1a1aa"
                    >
                      {fmtAbsTime(visMinNs + t, visRangeNs)}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* ── Overview strip (visible when zoomed in) ── */}
            {scale > 1 && (
              <g>
                <rect
                  x={LABEL_W} y={overviewY} width={barsW} height={OVERVIEW_H}
                  fill="#fafafa" stroke="#e4e4e7" strokeWidth={1} rx={3}
                />
                {operations.map((op, i) => {
                  const ox = LABEL_W + ((op.timestamp_ns - minNs) / rangeNs) * barsW;
                  const ow = Math.max(1, (op.duration_ns / rangeNs) * barsW);
                  return (
                    <rect key={i} x={ox} y={overviewY + 8} width={ow} height={12} rx={1} fill={BAR} opacity={0.4} />
                  );
                })}
                {/* Viewport indicator */}
                <rect
                  x={ovX} y={overviewY + 2} width={ovW} height={OVERVIEW_H - 4}
                  fill="#0d9488" opacity={0.12} rx={2}
                />
                <rect
                  x={ovX} y={overviewY + 2} width={ovW} height={OVERVIEW_H - 4}
                  fill="none" stroke="#0d9488" strokeWidth={1} rx={2}
                />
              </g>
            )}
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
