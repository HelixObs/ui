"use client";

import { useState, useEffect, useRef } from "react";
import CandidatePlot from "./CandidatePlot";
import type { PlotConfig } from "@/lib/herald";

interface Props {
  plots: PlotConfig[];
}

const WINDOW_PRESETS = [
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "2h", ms: 2 * 60 * 60 * 1000 },
  { label: "4h", ms: 4 * 60 * 60 * 1000 },
  { label: "12h", ms: 12 * 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
];

function toDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  // Format as YYYY-MM-DDTHH:mm (local time for input)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MonitorClient({ plots }: Props) {
  const [live, setLive] = useState(true);
  const [windowMs, setWindowMs] = useState(2 * 60 * 60 * 1000);
  const [toMs, setToMs] = useState(() => Date.now());
  const [fromMs, setFromMs] = useState(() => Date.now() - 2 * 60 * 60 * 1000);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const instrument = "CHIMEFRB"; // TODO: make selectable when multi-instrument
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Advance window in live mode every 2s
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      const now = Date.now();
      setToMs(now);
      setFromMs(now - windowMs);
    };
    tick();
    intervalRef.current = setInterval(tick, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [live, windowMs]);

  function applyPreset(ms: number) {
    setWindowMs(ms);
    setLive(true);
    setCustomFrom("");
    setCustomTo("");
  }

  function applyCustomRange() {
    const f = new Date(customFrom).getTime();
    const t = new Date(customTo).getTime();
    if (isNaN(f) || isNaN(t) || t <= f) return;
    setLive(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setFromMs(f);
    setToMs(t);
  }

  const windowLabel = (() => {
    const preset = WINDOW_PRESETS.find((p) => p.ms === windowMs);
    return preset ? preset.label : "custom";
  })();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-semibold text-zinc-700">Time window</span>
        <div className="flex gap-1">
          {WINDOW_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.ms)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                live && windowMs === p.ms
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-600 border-zinc-300 hover:border-zinc-500"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {live && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live ({windowLabel})
          </span>
        )}
        <div className="flex items-center gap-2 text-xs">
          <input
            type="datetime-local"
            className="border border-zinc-300 rounded px-2 py-1 text-xs"
            value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); setLive(false); }}
          />
          <span className="text-zinc-400">to</span>
          <input
            type="datetime-local"
            className="border border-zinc-300 rounded px-2 py-1 text-xs"
            value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); setLive(false); }}
          />
          <button
            onClick={applyCustomRange}
            className="px-3 py-1 rounded text-xs font-medium bg-zinc-800 text-white hover:bg-zinc-900 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {plots.length === 0 ? (
        <div className="text-sm text-zinc-400">No monitor plots registered.</div>
      ) : (
        <div className="flex flex-col gap-8">
          {plots.map((plot) => (
            <CandidatePlot
              key={plot.name}
              plotName={plot.name}
              plotLabel={plot.label}
              yUnit={plot.y_unit}
              yMin={plot.y_min}
              instrument={instrument}
              fromMs={fromMs}
              toMs={toMs}
              yMaxDefault={plot.y_max}
            />
          ))}
        </div>
      )}
    </div>
  );
}
