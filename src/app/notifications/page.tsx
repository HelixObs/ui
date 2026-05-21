"use client";

import { useState } from "react";
import Link from "next/link";
import type { Alert, Silence } from "@/lib/herald";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function metaSummary(meta: Record<string, string>): string {
  const entries = Object.entries(meta);
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}=${v}`)
    .join("  ");
}

function scopeLabel(s: Silence): string {
  if (s.fingerprint) return "fingerprint";
  if (s.event_type) return s.event_type;
  return "instrument-wide";
}

const inputCls =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400";

export default function NotificationsPage() {
  const [filterInstrument, setFilterInstrument] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [silences, setSilences] = useState<Silence[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  const [form, setForm] = useState({
    instrument_id: "",
    event_type: "",
    fingerprint: "",
    duration_minutes: 60,
    silenced_by: "",
    reason: "",
  });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function load() {
    const id = filterInstrument.trim();
    if (!id) return;
    setLoadError("");
    try {
      const [alertsRes, silencesRes] = await Promise.all([
        fetch(`/api/alerts?instrument_id=${encodeURIComponent(id)}`),
        fetch(`/api/silences?instrument_id=${encodeURIComponent(id)}`),
      ]);
      if (!alertsRes.ok) throw new Error(`alerts: ${alertsRes.status}`);
      if (!silencesRes.ok) throw new Error(`silences: ${silencesRes.status}`);
      const [alertData, silenceData] = await Promise.all([
        alertsRes.json(),
        silencesRes.json(),
      ]);
      setAlerts(alertData);
      setSilences(silenceData);
      setLoaded(true);
      setForm((prev) => ({ ...prev, instrument_id: id }));
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load.");
    }
  }

  function prefillSilence(a: Alert) {
    setForm((prev) => ({
      ...prev,
      instrument_id: filterInstrument.trim(),
      event_type: "helix.error",
      fingerprint: "",
      reason: "",
    }));
    document.getElementById("silence-form")?.scrollIntoView({ behavior: "smooth" });
  }

  async function deleteSilence(id: number) {
    setDeleting(id);
    try {
      await fetch(`/api/silences/${id}`, { method: "DELETE" });
      setSilences((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function createSilence(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.instrument_id.trim() || !form.silenced_by.trim() || form.duration_minutes < 1) {
      setFormError("Instrument ID, silenced by, and duration are required.");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        instrument_id: form.instrument_id.trim(),
        duration_minutes: Number(form.duration_minutes),
        silenced_by: form.silenced_by.trim(),
      };
      if (form.event_type.trim()) body.event_type = form.event_type.trim();
      if (form.fingerprint.trim()) body.fingerprint = form.fingerprint.trim();
      if (form.reason.trim()) body.reason = form.reason.trim();

      const res = await fetch("/api/silences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `${res.status}`);
      }
      const created: Silence = await res.json();
      if (filterInstrument.trim() === created.instrument_id) {
        setSilences((prev) => [created, ...prev]);
        setLoaded(true);
      }
      setForm((prev) => ({
        ...prev,
        event_type: "",
        fingerprint: "",
        reason: "",
        duration_minutes: 60,
      }));
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create silence.");
    } finally {
      setSubmitting(false);
    }
  }

  const activeSilences = silences.filter(
    (s) => new Date(s.expires_at) > new Date()
  );

  return (
    <div className="p-6 max-w-4xl mx-auto w-full">
      <h1 className="text-lg font-semibold text-zinc-900 mb-1">Notifications</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Active alerts for an instrument, and the silences suppressing them.
      </p>

      {/* Instrument filter */}
      <div className="flex gap-3 items-center mb-6">
        <input
          type="text"
          value={filterInstrument}
          onChange={(e) => setFilterInstrument(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Instrument ID (e.g. CHIMEFRB)"
          className={`w-64 ${inputCls}`}
        />
        <button
          onClick={load}
          className="rounded-md bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 text-sm font-medium text-white transition-colors"
        >
          Load
        </button>
      </div>

      {loadError && <p className="text-sm text-red-600 mb-4">{loadError}</p>}

      {loaded && (
        <>
          {/* Active alerts */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-zinc-700 mb-3">Active Alerts</h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No recent errors for <span className="font-mono">{filterInstrument}</span> in the last 7 days.
              </p>
            ) : (
              <div className="border border-zinc-200 rounded-md overflow-hidden">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-zinc-50">
                    <tr className="text-zinc-500 font-semibold text-left">
                      <th className="px-3 py-2">Last seen</th>
                      <th className="px-3 py-2">Count</th>
                      <th className="px-3 py-2">Details</th>
                      <th className="px-3 py-2">Example entity</th>
                      <th className="px-3 py-2 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a) => (
                      <tr key={a.group_key} className="border-t border-zinc-100 hover:bg-zinc-50">
                        <td className="px-3 py-2 text-zinc-500 whitespace-nowrap" title={a.last_seen}>
                          {timeAgo(a.last_seen)}
                        </td>
                        <td className="px-3 py-2 text-zinc-800 font-mono">{a.occurrence_count}×</td>
                        <td className="px-3 py-2 text-zinc-600 max-w-xs truncate" title={metaSummary(a.metadata)}>
                          {metaSummary(a.metadata)}
                        </td>
                        <td className="px-3 py-2 font-mono text-zinc-500">
                          {a.entity_ids[0] ? (
                            <Link
                              href={`/sherlock?entity_id=${encodeURIComponent(a.entity_ids[0])}`}
                              className="hover:text-amber-700 transition-colors"
                            >
                              {a.entity_ids[0].slice(0, 16)}…
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => prefillSilence(a)}
                            className="text-xs text-zinc-500 hover:text-zinc-900 border border-zinc-300 hover:border-zinc-500 rounded px-2 py-0.5 transition-colors"
                          >
                            Silence
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Active silences */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-zinc-700 mb-3">Active Silences</h2>
            {activeSilences.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No active silences for <span className="font-mono">{filterInstrument}</span>.
              </p>
            ) : (
              <div className="border border-zinc-200 rounded-md overflow-hidden">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-zinc-50">
                    <tr className="text-zinc-500 font-semibold text-left">
                      <th className="px-3 py-2">Scope</th>
                      <th className="px-3 py-2">Expires</th>
                      <th className="px-3 py-2">Silenced by</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeSilences.map((s) => (
                      <tr key={s.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                        <td className="px-3 py-2 text-zinc-600">{scopeLabel(s)}</td>
                        <td className="px-3 py-2 text-zinc-500" title={s.expires_at}>
                          {timeUntil(s.expires_at)}
                        </td>
                        <td className="px-3 py-2 text-zinc-600">{s.silenced_by}</td>
                        <td className="px-3 py-2 text-zinc-500 max-w-xs truncate">
                          {s.reason ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => deleteSilence(s.id)}
                            disabled={deleting === s.id}
                            title="Unsilence"
                            className="text-zinc-400 hover:text-red-600 disabled:opacity-40 transition-colors text-xs"
                          >
                            {deleting === s.id ? "…" : "✕"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Create silence form */}
      <div id="silence-form" className="border-t border-zinc-200 pt-6">
        <h2 className="text-sm font-semibold text-zinc-700 mb-4">Add Silence</h2>
        <form onSubmit={createSilence} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">
                Instrument ID <span className="text-red-400">*</span>
              </span>
              <input
                type="text"
                value={form.instrument_id}
                onChange={field("instrument_id")}
                placeholder="CHIMEFRB"
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">
                Event type{" "}
                <span className="text-zinc-400">(optional — omit to silence all)</span>
              </span>
              <input
                type="text"
                value={form.event_type}
                onChange={field("event_type")}
                placeholder="helix.error"
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">
                Fingerprint{" "}
                <span className="text-zinc-400">(optional — omit to silence by event type)</span>
              </span>
              <input
                type="text"
                value={form.fingerprint}
                onChange={field("fingerprint")}
                placeholder="sha256:…"
                className={`font-mono ${inputCls}`}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">
                Duration (minutes) <span className="text-red-400">*</span>
              </span>
              <input
                type="number"
                min={1}
                value={form.duration_minutes}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    duration_minutes: parseInt(e.target.value) || 60,
                  }))
                }
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">
                Silenced by <span className="text-red-400">*</span>
              </span>
              <input
                type="text"
                value={form.silenced_by}
                onChange={field("silenced_by")}
                placeholder="ops-team"
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">
                Reason <span className="text-zinc-400">(optional)</span>
              </span>
              <input
                type="text"
                value={form.reason}
                onChange={field("reason")}
                placeholder="Scheduled maintenance"
                className={inputCls}
              />
            </label>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-5 py-2 text-sm font-medium text-white transition-colors"
          >
            {submitting ? "Adding…" : "Add Silence"}
          </button>
        </form>
      </div>
    </div>
  );
}
