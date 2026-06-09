"use client";

import { useRef, useState, useEffect } from "react";
import type { EntityOperation } from "@/lib/herald";

// ── Layout ───────────────────────────────────────────────────────
const LABEL_W    = 200;
const ROW_H      = 36;
const BAR_H      = 20;
const PAD_TOP    = 8;
const PAD_R      = 52;
const AXIS_H     = 100;
const OVERVIEW_H = 28;
const MIN_BAR    = 3;

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

function fmtAbsTime(ns: number, visRangeNs: number): string {
  const d    = new Date(ns / 1_000_000);
  const p    = (n: number, w = 2) => String(n).padStart(w, "0");
  const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  const hh   = p(d.getUTCHours()), mm = p(d.getUTCMinutes()), ss = p(d.getUTCSeconds());
  const ms   = p(d.getUTCMilliseconds(), 3);
  if (visRangeNs >= 24 * 3600e9) return `${date} ${hh}:${mm} UTC`;
  if (visRangeNs >= 60e9)        return `${date} ${hh}:${mm}:${ss} UTC`;
  return `${date} ${hh}:${mm}:${ss}.${ms} UTC`;
}

function niceTicks(rangeNs: number, count = 6): number[] {
  if (rangeNs <= 0) return [0];
  const target   = rangeNs / count;
  const exp      = Math.floor(Math.log10(target));
  const mag      = 10 ** exp;
  const norm     = target / mag;
  const nice     = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
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
  // brush: x position (in SVG coords) where the drag started and where it currently is
  const brushRef     = useRef<{ startX: number; curX: number } | null>(null);

  const [width, setWidth]           = useState(0);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [tooltip, setTooltip]       = useState<Tooltip | null>(null);
  const [scale, setScale]           = useState(1);
  const [offsetFrac, setOffsetFrac] = useState(0);
  // brushRect: screen x coords for the live selection rectangle (null = not drawing)
  const [brushRect, setBrushRect]   = useState<{ x1: number; x2: number } | null>(null);

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

  const visRangeNs = rangeNs / scale;
  const visMinNs   = minNs + offsetFrac * rangeNs;

  const ticks = niceTicks(visRangeNs);

  const xOf = (ns: number)  => LABEL_W + ((ns - visMinNs) / visRangeNs) * barsW;
  const wOf = (dur: number) => Math.max(MIN_BAR, (dur / visRangeNs) * barsW);

  const rowsH     = operations.length * ROW_H;
  const axisY     = PAD_TOP + rowsH;
  const overviewY = axisY + AXIS_H;
  const svgH      = overviewY + (scale > 1 ? OVERVIEW_H : 0);

  const ovX = LABEL_W + offsetFrac * barsW;
  const ovW = Math.max(4, barsW / scale);

  // Convert an SVG x coordinate (within bars area) to an absolute ns timestamp
  const svgXtoNs = (svgX: number): number =>
    visMinNs + ((svgX - LABEL_W) / barsW) * visRangeNs;

  // ── Event handlers ───────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect  = containerRef.current!.getBoundingClientRect();
    const svgX  = e.clientX - rect.left;
    // Only start a brush inside the bars area
    if (svgX < LABEL_W || svgX > LABEL_W + barsW) return;
    brushRef.current = { startX: svgX, curX: svgX };
    setBrushRect(null);
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!brushRef.current) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const svgX = Math.max(LABEL_W, Math.min(LABEL_W + barsW, e.clientX - rect.left));
    brushRef.current.curX = svgX;
    const x1 = Math.min(brushRef.current.startX, svgX);
    const x2 = Math.max(brushRef.current.startX, svgX);
    setBrushRect(x2 - x1 > 3 ? { x1, x2 } : null);
  };

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!brushRef.current) return;
    const br = brushRef.current;
    brushRef.current = null;
    setBrushRect(null);

    const dragPx = Math.abs(br.curX - br.startX);
    if (dragPx < 5) {
      // Treat as a click — pass through to bar onClick via bubbling; no zoom
      return;
    }

    // Zoom into the brushed time range
    const ns1    = svgXtoNs(Math.min(br.startX, br.curX));
    const ns2    = svgXtoNs(Math.max(br.startX, br.curX));
    const newRange = Math.max(ns2 - ns1, 1);
    const newScale = Math.min(1000, rangeNs / newRange);
    const newOffset = Math.max(0, Math.min(1 - 1 / newScale,
      (ns1 - minNs) / rangeNs));
    setScale(newScale);
    setOffsetFrac(newOffset);
  };

  const handleMouseLeave = () => {
    brushRef.current = null;
    setBrushRect(null);
  };

  const resetZoom = () => { setScale(1); setOffsetFrac(0); };

  // Clicking on the overview strip pans to that position
  const handleOverviewClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect    = containerRef.current!.getBoundingClientRect();
    const svgX    = e.clientX - rect.left;
    if (svgX < LABEL_W || svgX > LABEL_W + barsW) return;
    const frac    = (svgX - LABEL_W) / barsW;
    const newOffset = Math.max(0, Math.min(1 - 1 / scale, frac - 0.5 / scale));
    setOffsetFrac(newOffset);
  };

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
            style={{ display: "block", cursor: brushRect ? "col-resize" : "crosshair" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
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
                        if (op.trace_id && !brushRect)
                          window.open(grafanaTraceURL(grafanaURL, entityID, op.trace_id), "_blank");
                      }}
                      onMouseEnter={(e) => {
                        if (brushRef.current) return;
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

            {/* ── Tick marks + labels ── */}
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

            {/* ── Brush selection rectangle ── */}
            {brushRect && (
              <g clipPath="url(#bars-clip)">
                <rect
                  x={brushRect.x1} y={PAD_TOP}
                  width={brushRect.x2 - brushRect.x1} height={rowsH}
                  fill="#0d9488" opacity={0.08}
                  stroke="#0d9488" strokeWidth={1}
                />
                <line x1={brushRect.x1} x2={brushRect.x1} y1={PAD_TOP} y2={PAD_TOP + rowsH} stroke="#0d9488" strokeWidth={1.5} />
                <line x1={brushRect.x2} x2={brushRect.x2} y1={PAD_TOP} y2={PAD_TOP + rowsH} stroke="#0d9488" strokeWidth={1.5} />
              </g>
            )}

            {/* ── Overview strip (visible when zoomed) ── */}
            {scale > 1 && (
              <g onClick={handleOverviewClick} style={{ cursor: "pointer" }}>
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
        {tooltip && !brushRect && (
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
