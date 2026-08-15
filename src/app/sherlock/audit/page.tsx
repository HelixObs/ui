"use client";

import { Fragment, useState, useEffect } from "react";
import Link from "next/link";
import SherlockLogo from "@/components/SherlockLogo";

interface AuditEntry {
  id: string;
  ts: string;
  session_id: string;
  interface: string;
  operator_id: string;
  operator_name: string;
  channel: string;
  instrument_id: string;
  entity_id: string;
  profile: string;
  kb_version: string;
  question: string;
  response: string;
  tools_used: string[];
  model: string;
  cost_usd: number;
  latency_ms: number;
  filter_hit: boolean;
}

const PAGE_SIZE = 25;
const INSTRUMENTS = ["CHIME"];

const RANGES = [
  { label: "Last hour", hours: 1 },
  { label: "Last 24h", hours: 24 },
  { label: "Last 7d", hours: 24 * 7 },
  { label: "All time", hours: 0 },
] as const;

const inputCls =
  "rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? `${oneLine.slice(0, n)}…` : oneLine;
}

export default function AuditPage() {
  const [instrumentId, setInstrumentId] = useState("CHIME");
  const [operatorName, setOperatorName] = useState("");
  const [channel, setChannel] = useState("");
  const [rangeHours, setRangeHours] = useState<number>(24);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch is defined and invoked entirely within the effect, rather than
  // as a separately-declared function referenced via a dependency array —
  // the latter trips react-hooks/set-state-in-effect, since the linter
  // can't tell the setState calls inside it only happen after the await.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (instrumentId) params.set("instrument_id", instrumentId);
      if (operatorName) params.set("operator_name", operatorName);
      if (channel) params.set("channel", channel);
      if (rangeHours > 0) {
        params.set("since", new Date(Date.now() - rangeHours * 3600_000).toISOString());
      }

      let next: AuditEntry[] = [];
      try {
        const res = await fetch(`/api/audit?${params.toString()}`, { cache: "no-store" });
        next = await res.json();
      } catch {
        next = [];
      }
      if (!cancelled) {
        setEntries(next);
        setLoading(false);
        setLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [instrumentId, operatorName, channel, rangeHours, page]);

  // Filter changes reset to page 0 directly in each handler, rather than
  // via a separate effect watching for filter changes (same lint concern
  // as above, and this is simpler besides).
  function updateFilter<T>(setter: (v: T) => void, value: T) {
    setter(value);
    setPage(0);
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-gradient-to-br from-amber-900 via-amber-800 to-orange-700 px-8 py-10 flex items-center gap-4">
        <div className="size-14 rounded-full bg-amber-600 flex items-center justify-center shadow-xl shrink-0">
          <SherlockLogo size={30} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Audit log</h1>
          <p className="text-amber-300 text-sm">
            Every exchange, write-only — never used as context by Sherlock itself.
          </p>
        </div>
        <Link
          href="/sherlock"
          className="ml-auto text-sm text-amber-200 hover:text-white transition-colors"
        >
          ← Back to Sherlock
        </Link>
      </div>

      <div className="px-8 py-6 max-w-6xl mx-auto w-full flex flex-col gap-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={instrumentId}
            onChange={(e) => updateFilter(setInstrumentId, e.target.value)}
            className={inputCls}
          >
            <option value="">All instruments</option>
            {INSTRUMENTS.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Operator name…"
            value={operatorName}
            onChange={(e) => updateFilter(setOperatorName, e.target.value)}
            className={inputCls}
          />
          <input
            type="text"
            placeholder="Channel (e.g. #chime-ops)…"
            value={channel}
            onChange={(e) => updateFilter(setChannel, e.target.value)}
            className={inputCls}
          />
          <div className="flex gap-1 ml-auto">
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => updateFilter(setRangeHours, r.hours)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  rangeHours === r.hours
                    ? "bg-amber-800 text-white border-amber-800"
                    : "border-stone-300 text-stone-600 hover:border-stone-500"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading && !loaded ? (
          <p className="text-sm text-stone-400 py-8 text-center">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-stone-400 py-8 text-center">
            No exchanges match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                  <th className="px-3 py-2 font-semibold">Time</th>
                  <th className="px-3 py-2 font-semibold">Operator</th>
                  <th className="px-3 py-2 font-semibold">Channel</th>
                  <th className="px-3 py-2 font-semibold">Question</th>
                  <th className="px-3 py-2 font-semibold">Response</th>
                  <th className="px-3 py-2 font-semibold">Tools</th>
                  <th className="px-3 py-2 font-semibold text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const expanded = expandedId === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : e.id)}
                        className="border-t border-stone-100 hover:bg-amber-50/50 align-top cursor-pointer"
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-stone-500" title={e.ts}>
                          {timeAgo(e.ts)}
                        </td>
                        <td className="px-3 py-2 font-medium text-stone-900">
                          {e.operator_name || e.operator_id}
                        </td>
                        <td className="px-3 py-2 text-stone-500">{e.channel || "—"}</td>
                        <td className="px-3 py-2 max-w-xs">
                          {expanded ? e.question : truncate(e.question, 80)}
                        </td>
                        <td className="px-3 py-2 max-w-sm">
                          {expanded ? e.response : truncate(e.response, 100)}
                          {e.filter_hit && (
                            <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-300">
                              redacted
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-stone-500 font-mono text-xs">
                          {e.tools_used.length > 0 ? e.tools_used.join(", ") : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-stone-500 font-mono text-xs">
                          ${e.cost_usd.toFixed(4)}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t border-amber-100 bg-amber-50/40">
                          <td colSpan={7} className="px-3 py-4">
                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
                                  Question
                                </p>
                                <p className="whitespace-pre-wrap text-stone-800">{e.question}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
                                  Response
                                </p>
                                <p className="whitespace-pre-wrap text-stone-800">{e.response}</p>
                              </div>
                            </div>
                            <p className="mt-3 text-xs text-stone-400 font-mono">
                              session {e.session_id} · {e.ts}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination — no total count from the API, so this is prev/next
            only, disabling "next" once a page comes back short. */}
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span>Page {page + 1}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-0.5 rounded border border-stone-300 hover:border-stone-500 disabled:opacity-30 transition-colors"
            >
              ‹ Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={entries.length < PAGE_SIZE}
              className="px-2 py-0.5 rounded border border-stone-300 hover:border-stone-500 disabled:opacity-30 transition-colors"
            >
              Next ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
