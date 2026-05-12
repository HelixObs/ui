"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface BinResult {
  t: number;
  y: number;
  snr: number;
  id: string;
  ts: number;
  yv: number;
  meta: Record<string, string>;
}

interface BinsResponse {
  bins: BinResult[];
  t_bins: number;
  y_bins: number;
  from_ns: number;
  to_ns: number;
  y_min: number;
  y_max: number;
  snr_max: number;
}

interface Props {
  plotName: string;
  plotLabel: string;
  yUnit: string;
  yMin: number;
  instrument: string;
  fromMs: number;
  toMs: number;
  yMaxDefault: number;
}

const CANVAS_W = 1200;
const CANVAS_H = 160;
// Fixed width reserved for y-axis (rotated label + tick text).
const Y_AXIS_W = 60;

// Inferno colormap — black → dark crimson → red → orange → yellow/white
const INFERNO: [number, number, number][] = [
  [  0,   0,   4],
  [ 40,  11,  84],
  [ 101,  21, 110],
  [159,  42,  99],
  [212,  72,  66],
  [245, 125,  21],
  [250, 193,  39],
  [252, 255, 164],
];

function snrToRGB(t: number): [number, number, number] {
  if (t <= 0) return INFERNO[0];
  if (t >= 1) return INFERNO[INFERNO.length - 1];
  const scaled = t * (INFERNO.length - 1);
  const lo = Math.floor(scaled);
  const frac = scaled - lo;
  const a = INFERNO[lo], b = INFERNO[lo + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

// ~5 nicely-spaced ticks across [yMin, yMax].
function computeYTicks(yMin: number, yMax: number): { frac: number; label: string }[] {
  const range = yMax - yMin;
  if (range <= 0) return [];
  const rawStep = range / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map(c => c * mag).find(c => range / c <= 6) ?? mag * 10;
  const ticks: { frac: number; label: string }[] = [];
  const first = Math.ceil(yMin / step) * step;
  for (let v = first; v <= yMax + 1e-9; v += step) {
    ticks.push({
      frac: (v - yMin) / range,
      label: Number.isInteger(step) ? String(Math.round(v)) : v.toFixed(1),
    });
  }
  return ticks;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// ~6 nicely-spaced ticks across [fromMs, toMs].
function computeXTicks(fromMs: number, toMs: number): { frac: number; label: string }[] {
  const range = toMs - fromMs;
  if (range <= 0) return [];
  const MIN = 60_000, HOUR = 3_600_000;
  const raw = range / 6;
  let step: number;
  if      (raw < MIN)       step = Math.ceil(raw / 10_000)       * 10_000;
  else if (raw < 10 * MIN)  step = Math.ceil(raw / MIN)          * MIN;
  else if (raw < HOUR)      step = Math.ceil(raw / (10 * MIN))   * 10 * MIN;
  else                      step = Math.ceil(raw / HOUR)         * HOUR;

  const ticks: { frac: number; label: string }[] = [];
  const showSeconds = range < 2 * HOUR;
  for (let v = Math.ceil(fromMs / step) * step; v <= toMs; v += step) {
    const d = new Date(v);
    const label = showSeconds
      ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
      : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    ticks.push({ frac: (v - fromMs) / range, label });
  }
  return ticks;
}

export default function CandidatePlot({
  plotName,
  plotLabel,
  yUnit,
  yMin,
  instrument,
  fromMs,
  toMs,
  yMaxDefault,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  const [yMinFilter, setYMinFilter] = useState(yMin);
  const [yMinInput, setYMinInput] = useState(String(yMin));
  const [yMax, setYMax] = useState(yMaxDefault);
  const [yMaxInput, setYMaxInput] = useState(String(yMaxDefault));
  const [snrDataMax, setSnrDataMax] = useState(0);
  const [snrFloor, setSnrFloor] = useState(8.5);
  const [snrCeil, setSnrCeil] = useState(25.0);
  const [hoveredBin, setHoveredBin] = useState<BinResult | null>(null);
  const [loading, setLoading] = useState(false);
  const binsRef = useRef<BinsResponse | null>(null);
  // Flat lookup array indexed by t * CANVAS_H + y → O(1) hover
  const binLookupRef = useRef<(BinResult | null)[]>([]);

  const SNR_SLIDER_MAX = 100;

  const renderCanvas = useCallback((data: BinsResponse, floor: number, ceil: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.createImageData(CANVAS_W, CANVAS_H);
    for (let i = 0; i < imageData.data.length; i += 4) imageData.data[i + 3] = 255;
    const range = ceil - floor;
    // Build O(1) hover lookup at the same time as rendering
    const lookup = new Array<BinResult | null>(CANVAS_W * CANVAS_H).fill(null);
    for (const bin of data.bins) {
      const t = range > 0 ? Math.max(0, Math.min(1, (bin.snr - floor) / range)) : 0;
      const [r, g, b] = snrToRGB(t);
      const idx = ((CANVAS_H - 1 - bin.y) * CANVAS_W + bin.t) * 4;
      imageData.data[idx] = r;
      imageData.data[idx + 1] = g;
      imageData.data[idx + 2] = b;
      imageData.data[idx + 3] = 255;
      lookup[bin.t * CANVAS_H + bin.y] = bin;
    }
    ctx.putImageData(imageData, 0, 0);
    binLookupRef.current = lookup;
  }, []);

  const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

  const fetchAndRender = useCallback(async (floor: number, ceil: number) => {
    if (!canvasRef.current) return;
    setLoading(true);
    const clampedFromMs = Math.max(fromMs, toMs - MAX_WINDOW_MS);
    try {
      const params = new URLSearchParams({
        plot: plotName,
        instrument,
        from_ms: String(clampedFromMs),
        to_ms: String(toMs),
        t_bins: String(CANVAS_W),
        y_bins: String(CANVAS_H),
        y_min: String(yMinFilter),
        y_max: String(yMax),
      });
      const res = await fetch(`/api/monitor/bins?${params}`);
      if (!res.ok) return;
      const data: BinsResponse = await res.json();
      binsRef.current = data;
      setSnrDataMax(data.snr_max);
      renderCanvas(data, floor, ceil);
    } finally {
      setLoading(false);
    }
  }, [plotName, instrument, fromMs, toMs, yMinFilter, yMax, renderCanvas]);

  // Re-fetch when data params change
  useEffect(() => { fetchAndRender(snrFloor, snrCeil); }, [fetchAndRender]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-paint instantly when SNR range changes — no refetch
  useEffect(() => {
    if (binsRef.current) renderCanvas(binsRef.current, snrFloor, snrCeil);
  }, [snrFloor, snrCeil, renderCanvas]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || binLookupRef.current.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const tBin = Math.floor((e.clientX - rect.left) / rect.width  * CANVAS_W);
    const yBin = CANVAS_H - 1 - Math.floor((e.clientY - rect.top) / rect.height * CANVAS_H);
    setHoveredBin(binLookupRef.current[tBin * CANVAS_H + yBin] ?? null);
  }, []);

  const handleClick = useCallback(() => {
    if (hoveredBin) router.push(`/entity/${hoveredBin.id}`);
  }, [hoveredBin, router]);

  const tsLabel = (ns: number) =>
    new Date(ns / 1_000_000).toISOString().replace("T", " ").slice(0, 19) + " UTC";

  // Short timezone abbreviation for the x-axis label (e.g. "PDT", "EDT", "UTC")
  const tzAbbr = Intl.DateTimeFormat("en", { timeZoneName: "short" })
    .format(new Date())
    .split(" ")
    .at(-1) ?? "";

  const yTicks = computeYTicks(yMinFilter, yMax);
  const xTicks = computeXTicks(fromMs, toMs);

  return (
    <div className="flex flex-col gap-0">
      {/* Controls row — indented to align with canvas left edge */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 mb-1"
           style={{ paddingLeft: Y_AXIS_W }}>
        {/* Y range controls */}
        <label className="flex items-center gap-1">
          <span>y:</span>
          <input
            type="number"
            className="w-20 border border-zinc-300 rounded px-1 py-0.5 text-xs"
            value={yMinInput}
            onChange={(e) => setYMinInput(e.target.value)}
            onBlur={() => { const v = parseFloat(yMinInput); if (!isNaN(v) && v < yMax) setYMinFilter(v); }}
            onKeyDown={(e) => { if (e.key === "Enter") { const v = parseFloat(yMinInput); if (!isNaN(v) && v < yMax) setYMinFilter(v); }}}
          />
          <span className="text-zinc-400">–</span>
          <input
            type="number"
            className="w-20 border border-zinc-300 rounded px-1 py-0.5 text-xs"
            value={yMaxInput}
            onChange={(e) => setYMaxInput(e.target.value)}
            onBlur={() => { const v = parseFloat(yMaxInput); if (!isNaN(v) && v > yMinFilter) setYMax(v); }}
            onKeyDown={(e) => { if (e.key === "Enter") { const v = parseFloat(yMaxInput); if (!isNaN(v) && v > yMinFilter) setYMax(v); }}}
          />
          <span>{yUnit}</span>
        </label>

        {/* SNR range sliders */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">SNR</span>
          <span className="w-8 text-right tabular-nums">{snrFloor.toFixed(0)}</span>
          <input
            type="range"
            min={0} max={SNR_SLIDER_MAX} step={0.5}
            value={snrFloor}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setSnrFloor(Math.min(v, snrCeil - 1));
            }}
            className="w-24 accent-zinc-600"
          />
          <span>–</span>
          <input
            type="range"
            min={0} max={SNR_SLIDER_MAX} step={0.5}
            value={snrCeil}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setSnrCeil(Math.max(v, snrFloor + 1));
            }}
            className="w-24 accent-zinc-600"
          />
          <span className="w-8 tabular-nums">{snrCeil.toFixed(0)}</span>
        </div>

        {snrDataMax > 0 && <span className="text-zinc-400">data max: {snrDataMax.toFixed(1)}</span>}
        {loading && <span className="text-zinc-400">loading…</span>}
      </div>

      {/* Canvas row: y-axis + canvas */}
      <div className="flex items-stretch">
        {/* Y-axis */}
        <div className="flex items-stretch shrink-0" style={{ width: Y_AXIS_W }}>
          {/* Rotated axis label */}
          <div className="flex items-center justify-center" style={{ width: 14 }}>
            <span
              className="text-[10px] text-zinc-400 whitespace-nowrap select-none"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              {plotLabel}
            </span>
          </div>
          {/* Tick labels */}
          <div className="relative flex-1">
            {yTicks.map((tick) => (
              <div
                key={tick.label}
                className="absolute right-1 text-[10px] leading-none text-zinc-400 select-none -translate-y-1/2 text-right"
                style={{ bottom: `${tick.frac * 100}%` }}
              >
                {tick.label}
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative min-w-0">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{
              imageRendering: "pixelated",
              width: "100%",
              height: "auto",
              display: "block",
              cursor: hoveredBin ? "pointer" : "crosshair",
            }}
            className="border border-zinc-700/40 rounded-sm"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredBin(null)}
            onClick={handleClick}
          />
          {hoveredBin && (
            <div className="absolute top-2 right-2 bg-zinc-900/85 text-white text-xs rounded px-2 py-1.5 pointer-events-none space-y-0.5 min-w-[180px]">
              {Object.entries(hoveredBin.meta).map(([k, v]) => {
                const label = k.replace(/^helix\.[^.]+\./, "");
                const num = parseFloat(v);
                return (
                  <div key={k} className="flex justify-between gap-3">
                    <span className="text-zinc-400">{label}</span>
                    <span className="font-medium tabular-nums">{isNaN(num) ? v : num.toFixed(2)}</span>
                  </div>
                );
              })}
              <div className="border-t border-zinc-700 pt-0.5 mt-0.5 text-zinc-300 font-mono">{tsLabel(hoveredBin.ts)}</div>
              <div className="text-zinc-500 truncate max-w-[200px]">{hoveredBin.id}</div>
            </div>
          )}
        </div>
      </div>

      {/* X-axis row */}
      <div className="flex">
        <div className="shrink-0" style={{ width: Y_AXIS_W }} />
        <div className="flex-1 relative h-5 border-t border-zinc-700/30">
          {xTicks.map((tick) => (
            <div
              key={tick.label}
              className="absolute text-[10px] text-zinc-400 -translate-x-1/2 pt-0.5 select-none"
              style={{ left: `${tick.frac * 100}%` }}
            >
              {tick.label}
            </div>
          ))}
          {/* Timezone label pinned to the right edge */}
          <div className="absolute right-0 pt-0.5 text-[10px] text-zinc-400 select-none">
            {tzAbbr}
          </div>
        </div>
      </div>
    </div>
  );
}
