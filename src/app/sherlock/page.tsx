"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface MemoryEntry {
  id: string;
  instrument_id: string;
  entity_id: string;
  error_type: string;
  stage: string;
  classification: string;
  confidence: string;
  summary: string;
  created_at: string;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  medium: "text-amber-700 bg-amber-50 border-amber-300",
  low:    "text-orange-700 bg-orange-50 border-orange-300",
};

const CLASS_LABEL: Record<string, string> = {
  code_bug: "Code bug", data_quality: "Data quality",
  configuration: "Configuration", infrastructure: "Infrastructure", unknown: "Unknown",
};

const INSTRUMENTS = ["CHIME"];

export default function SherlockHomePage() {
  const router = useRouter();
  const [entityID,   setEntityID]   = useState("");
  const [instrument, setInstrument] = useState("CHIME");
  const [memory,     setMemory]     = useState<MemoryEntry[]>([]);

  useEffect(() => {
    fetch(`/api/memory/${encodeURIComponent(instrument)}`)
      .then((r) => r.json())
      .then(setMemory)
      .catch(() => {});
  }, [instrument]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = entityID.trim();
    if (!id) return;
    router.push(`/sherlock/${encodeURIComponent(id)}?instrument=${encodeURIComponent(instrument)}`);
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Hero */}
      <div className="bg-gradient-to-br from-amber-900 via-amber-800 to-orange-700 px-8 py-16 flex flex-col items-center text-center gap-6">
        <div className="size-20 rounded-full bg-amber-600 flex items-center justify-center shadow-xl">
          <span className="text-white text-3xl font-bold">S</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Sherlock</h1>
          <p className="text-amber-300 text-base max-w-md leading-relaxed">
            AI-powered root cause analysis for HelixObs entities.
            Paste an entity ID to start a structured investigation.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full max-w-xl flex flex-col gap-3 mt-2">
          <input
            type="text"
            value={entityID}
            onChange={(e) => setEntityID(e.target.value)}
            placeholder="Entity ID — e.g. frb-498ec55c5a10"
            className="w-full rounded-xl bg-white/10 border border-amber-400/40 px-5 py-3 text-white placeholder-amber-300/60 font-mono text-sm focus:outline-none focus:border-amber-300 focus:bg-white/20 transition-colors"
            autoFocus
          />
          <div className="flex gap-3">
            <select
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              className="rounded-xl bg-white/10 border border-amber-400/40 px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-300 transition-colors"
            >
              {INSTRUMENTS.map((i) => <option key={i} value={i} className="text-stone-900">{i}</option>)}
            </select>
            <button
              type="submit"
              disabled={!entityID.trim()}
              className="flex-1 rounded-xl bg-white text-amber-900 font-semibold px-6 py-2.5 text-sm hover:bg-amber-50 disabled:opacity-40 transition-colors shadow-lg"
            >
              Investigate
            </button>
          </div>
        </form>
      </div>

      <div className="px-8 py-10 max-w-4xl mx-auto w-full flex flex-col gap-10">
        {/* Recent investigations */}
        {memory.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-700 mb-4">
              Recent investigations — {instrument}
            </h2>
            <div className="flex flex-col gap-3">
              {memory.map((m) => (
                <Link
                  key={m.id}
                  href={`/sherlock/${encodeURIComponent(m.entity_id)}?instrument=${encodeURIComponent(m.instrument_id)}`}
                  className="rounded-2xl border border-amber-100 bg-amber-50 hover:bg-amber-100 px-5 py-4 flex items-start justify-between gap-4 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-semibold text-amber-900 truncate group-hover:text-amber-700">
                      {m.entity_id}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5 leading-relaxed line-clamp-2">{m.summary}</p>
                    {(m.error_type || m.stage) && (
                      <p className="text-xs text-amber-600 mt-1 font-mono">
                        {[m.error_type, m.stage].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-xs text-stone-400">{m.created_at.slice(0, 10)}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE_COLOR[m.confidence] ?? "text-stone-500 bg-stone-50 border-stone-200"}`}>
                      {CLASS_LABEL[m.classification] ?? m.classification}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* How it works */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-700 mb-4">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s) => (
              <div key={s.level} className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 flex flex-col gap-2">
                <div className="size-8 rounded-full bg-amber-800 flex items-center justify-center">
                  <span className="text-amber-200 text-xs font-bold">{s.level}</span>
                </div>
                <p className="text-sm font-semibold text-amber-900">{s.title}</p>
                <p className="text-xs text-stone-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-stone-400 text-center">
            You can also open Sherlock from any entity via the{" "}
            <Link href="/" className="text-amber-700 hover:text-amber-900 underline">provenance graph</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}

const STEPS = [
  { level: "0", title: "Error events",          desc: "Reads helix.error events and operations to identify the failing stage immediately." },
  { level: "1", title: "Source code",            desc: "Fetches the relevant source file from GitHub and reads around the error line." },
  { level: "2", title: "Logs",                   desc: "Queries Loki for structured logs around the error timestamp." },
  { level: "3", title: "Provenance & metrics",   desc: "Checks parent entities and Prometheus node metrics to distinguish isolated vs widespread failures." },
];
