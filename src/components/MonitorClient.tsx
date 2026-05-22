"use client";

import { useState, useEffect, useRef } from "react";
import CandidatePlot from "./CandidatePlot";

interface PanelConfig {
  id: string;
  yField: string;
  weightField: string;
  yMin: number;
  yMax: number;
  label: string;
}

const WINDOW_PRESETS = [
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "2h", ms: 2 * 60 * 60 * 1000 },
  { label: "4h", ms: 4 * 60 * 60 * 1000 },
  { label: "12h", ms: 12 * 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
];

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

const LS_INSTRUMENT = "monitor_instrument";
const LS_PANELS = "monitor_panels";

export default function MonitorClient() {
  const [instrument, setInstrument] = useState("");
  const [instrumentInput, setInstrumentInput] = useState("");
  const [panels, setPanels] = useState<PanelConfig[]>([]);
  const [live, setLive] = useState(true);
  const [windowMs, setWindowMs] = useState(2 * 60 * 60 * 1000);
  const [toMs, setToMs] = useState(() => Date.now());
  const [fromMs, setFromMs] = useState(() => Date.now() - 2 * 60 * 60 * 1000);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Add-panel form state
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [fields, setFields] = useState<string[]>([]);
  const [newYField, setNewYField] = useState("");
  const [newWeightField, setNewWeightField] = useState("");
  const [newYMin, setNewYMin] = useState("0");
  const [newYMax, setNewYMax] = useState("1000");
  const [newLabel, setNewLabel] = useState("");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted state on mount
  useEffect(() => {
    const inst = localStorage.getItem(LS_INSTRUMENT) ?? "";
    setInstrument(inst);
    setInstrumentInput(inst);
    try {
      const saved = localStorage.getItem(LS_PANELS);
      if (saved) setPanels(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { localStorage.setItem(LS_INSTRUMENT, instrument); }, [instrument]);
  useEffect(() => { localStorage.setItem(LS_PANELS, JSON.stringify(panels)); }, [panels]);

  // Live ticker — updates fromMs/toMs every 30s
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      const now = Date.now();
      setToMs(now);
      setFromMs(now - windowMs);
    };
    tick();
    intervalRef.current = setInterval(tick, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [live, windowMs]);

  // Fetch available metadata keys when the add-panel form opens
  useEffect(() => {
    if (!showAddPanel || !instrument) { setFields([]); return; }
    fetch(`/api/monitor/fields?instrument=${encodeURIComponent(instrument)}`)
      .then(r => r.ok ? r.json() : [])
      .then((keys: string[]) => setFields(keys))
      .catch(() => setFields([]));
  }, [showAddPanel, instrument]);

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

  function applyInstrument() {
    setInstrument(instrumentInput.trim());
  }

  function addPanel() {
    if (!newYField) return;
    const panel: PanelConfig = {
      id: randomId(),
      yField: newYField,
      weightField: newWeightField,
      yMin: parseFloat(newYMin) || 0,
      yMax: parseFloat(newYMax) || 1000,
      label: newLabel.trim() || newYField.split(".").at(-1) || newYField,
    };
    setPanels(prev => [...prev, panel]);
    setShowAddPanel(false);
    setNewYField("");
    setNewWeightField("");
    setNewYMin("0");
    setNewYMax("1000");
    setNewLabel("");
  }

  function removePanel(id: string) {
    setPanels(prev => prev.filter(p => p.id !== id));
  }

  const windowLabel = WINDOW_PRESETS.find(p => p.ms === windowMs)?.label ?? "custom";

  const FieldSelect = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) =>
    fields.length > 0 ? (
      <select
        className="border border-zinc-300 rounded px-2 py-1 text-sm"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {fields.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
    ) : (
      <input
        type="text"
        className="border border-zinc-300 rounded px-2 py-1 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    );

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Instrument row */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-zinc-700 shrink-0">Instrument</span>
        <input
          type="text"
          placeholder="e.g. CHIMEFRB"
          className="border border-zinc-300 rounded px-2 py-1 text-sm w-40"
          value={instrumentInput}
          onChange={e => setInstrumentInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") applyInstrument(); }}
        />
        <button
          onClick={applyInstrument}
          className="px-3 py-1 rounded text-xs font-medium bg-zinc-800 text-white hover:bg-zinc-900 transition-colors"
        >
          Apply
        </button>
      </div>

      {/* Time window row */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-semibold text-zinc-700">Time window</span>
        <div className="flex gap-1">
          {WINDOW_PRESETS.map(p => (
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
            onChange={e => { setCustomFrom(e.target.value); setLive(false); }}
          />
          <span className="text-zinc-400">to</span>
          <input
            type="datetime-local"
            className="border border-zinc-300 rounded px-2 py-1 text-xs"
            value={customTo}
            onChange={e => { setCustomTo(e.target.value); setLive(false); }}
          />
          <button
            onClick={applyCustomRange}
            className="px-3 py-1 rounded text-xs font-medium bg-zinc-800 text-white hover:bg-zinc-900 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Panels */}
      {instrument && panels.length === 0 && !showAddPanel && (
        <p className="text-sm text-zinc-400">No panels configured — add one below.</p>
      )}

      <div className="flex flex-col gap-8">
        {panels.map(panel => (
          <div key={panel.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-zinc-700">{panel.label}</span>
              <button
                onClick={() => removePanel(panel.id)}
                className="text-sm leading-none text-zinc-300 hover:text-red-400 transition-colors"
                title="Remove panel"
              >
                ×
              </button>
            </div>
            {instrument ? (
              <CandidatePlot
                yField={panel.yField}
                weightField={panel.weightField}
                plotLabel={panel.label}
                yUnit={panel.yField.split(".").at(-1) ?? ""}
                yMin={panel.yMin}
                instrument={instrument}
                fromMs={fromMs}
                toMs={toMs}
                yMaxDefault={panel.yMax}
              />
            ) : (
              <p className="text-xs text-zinc-400">Set an instrument above to load data.</p>
            )}
          </div>
        ))}
      </div>

      {/* Add Panel button / form */}
      {!showAddPanel ? (
        <button
          onClick={() => setShowAddPanel(true)}
          disabled={!instrument}
          title={!instrument ? "Set an instrument first" : undefined}
          className="self-start px-3 py-1.5 rounded text-xs font-medium border border-dashed border-zinc-400 text-zinc-500 hover:border-zinc-600 hover:text-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          + Add panel
        </button>
      ) : (
        <div className="border border-zinc-200 rounded-lg p-4 flex flex-col gap-3 max-w-sm bg-zinc-50">
          <span className="text-sm font-semibold text-zinc-700">New panel</span>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Y-axis field</label>
            <FieldSelect
              value={newYField}
              onChange={v => { setNewYField(v); if (!newLabel) setNewLabel(v.split(".").at(-1) ?? v); }}
              placeholder="— select field —"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Weight field <span className="text-zinc-400">(optional — controls brightness)</span></label>
            <FieldSelect
              value={newWeightField}
              onChange={setNewWeightField}
              placeholder="— none (uniform) —"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-zinc-500">Y min</label>
              <input
                type="number"
                className="border border-zinc-300 rounded px-2 py-1 text-sm bg-white"
                value={newYMin}
                onChange={e => setNewYMin(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-zinc-500">Y max</label>
              <input
                type="number"
                className="border border-zinc-300 rounded px-2 py-1 text-sm bg-white"
                value={newYMax}
                onChange={e => setNewYMax(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Label</label>
            <input
              type="text"
              className="border border-zinc-300 rounded px-2 py-1 text-sm bg-white"
              placeholder="Panel label"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={addPanel}
              disabled={!newYField}
              className="px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 text-white hover:bg-zinc-900 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddPanel(false)}
              className="px-3 py-1.5 rounded text-xs font-medium border border-zinc-300 text-zinc-600 hover:border-zinc-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
