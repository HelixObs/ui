"use client";

import { useCallback, useEffect, useRef, useState } from "react"; // useEffect used by ToolCallPill auto-open
import {
  type DiagnoseChunk,
  type DoneData,
  type HypothesisData,
  streamChunks,
} from "@/lib/sherlock";
import ReactMarkdown from "react-markdown";
import SherlockLogo from "./SherlockLogo";

interface Props {
  entityID: string;
  instrumentID?: string;
  onClose: () => void;
  fullPage?: boolean;
}

type Message =
  | { role: "assistant"; text: string }
  | { role: "tool_call"; name: string; args: string; result?: Record<string, unknown> }
  | { role: "hypothesis"; data: HypothesisData }
  | { role: "question"; text: string; context: string }
  | { role: "user"; text: string }
  | { role: "error"; text: string };

const CONFIDENCE_COLOR: Record<string, string> = {
  high:   "text-emerald-700 bg-emerald-50 border-emerald-300",
  medium: "text-amber-700 bg-amber-50 border-amber-300",
  low:    "text-orange-700 bg-orange-50 border-orange-300",
};

const CLASS_LABEL: Record<string, string> = {
  code_bug:       "Code bug",
  data_quality:   "Data quality",
  configuration:  "Configuration",
  infrastructure: "Infrastructure",
  unknown:        "Unknown",
};

const LS_KEY = "sherlock.github_token";

export default function SherlockPanel({ entityID, instrumentID, onClose, fullPage = false }: Props) {
  const [githubToken,     setGithubToken]     = useState("");
  const [tokenSaved,      setTokenSaved]      = useState(false);
  const [sessionId,       setSessionId]       = useState<string | null>(null);
  const [messages,        setMessages]        = useState<Message[]>([]);
  const [streaming,       setStreaming]       = useState(false);
  const [done,            setDone]            = useState<DoneData | null>(null);
  const [reply,           setReply]           = useState("");
  const [waitingForReply, setWaitingForReply] = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);

  // Pre-fill token from localStorage after mount — gate still shows so user clicks Investigate.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setGithubToken(saved);
    } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const appendAssistant = useCallback((text: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return [...prev.slice(0, -1), { role: "assistant", text: last.text + text }];
      }
      return [...prev, { role: "assistant", text }];
    });
  }, []);

  const runStream = useCallback(async (url: string, body: object) => {
    setStreaming(true);
    setWaitingForReply(false);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setMessages((p) => [...p, { role: "error", text: `Server error ${res.status} — please try again.` }]);
        return;
      }
      for await (const chunk of streamChunks(res)) {
        handleChunk(chunk);
      }
    } catch (err) {
      void err;
      setMessages((p) => [...p, { role: "error", text: "Connection lost. Please try again." }]);
    } finally {
      setStreaming(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChunk = (chunk: DiagnoseChunk) => {
    switch (chunk.type) {
      case "step":
        if (chunk.text) {
          const toolMatch = chunk.text.match(/^[\n\r]*→ \*\*(.+?)\*\*\(([\s\S]*)?\)\s*$/);
          if (toolMatch) {
            setMessages((p) => [...p, { role: "tool_call", name: toolMatch[1], args: toolMatch[2] ?? "" }]);
          } else {
            const clean = chunk.text.replace(/^[\n\r]+/, "");
            if (clean) appendAssistant(clean);
          }
        }
        if (chunk.data.session_id) {
          sessionRef.current = chunk.data.session_id as string;
          setSessionId(chunk.data.session_id as string);
        }
        break;
      case "hypothesis":
        setMessages((p) => [...p, { role: "hypothesis", data: chunk.data as unknown as HypothesisData }]);
        break;
      case "question":
        setMessages((p) => [...p, { role: "question", text: chunk.text, context: (chunk.data.context as string) ?? "" }]);
        setWaitingForReply(true);
        break;
      case "evidence":
        // Attach the tool result to the most recent tool_call message.
        setMessages((p) => {
          const idx = [...p].reverse().findIndex((m) => m.role === "tool_call");
          if (idx === -1) return p;
          const realIdx = p.length - 1 - idx;
          const updated = [...p];
          updated[realIdx] = { ...updated[realIdx], result: chunk.data.result as Record<string, unknown> } as Message;
          return updated;
        });
        break;
      case "error":
        setMessages((p) => [...p, { role: "error", text: "Something went wrong on the server. The investigation may be incomplete." }]);
        break;
      case "done":
        if (chunk.data.cost_usd !== undefined) setDone(chunk.data as unknown as DoneData);
        break;
    }
  };

  const startInvestigation = useCallback(() => {
    try {
      if (githubToken) localStorage.setItem(LS_KEY, githubToken);
      else localStorage.removeItem(LS_KEY);
    } catch { /* storage unavailable */ }
    setTokenSaved(true);
    setMessages([]);
    setDone(null);
    runStream(`/api/diagnose/${encodeURIComponent(entityID)}`, {
      instrument_id: instrumentID ?? "",
      github_token:  githubToken,
    });
  }, [entityID, instrumentID, githubToken, runStream]);

  const sendReply = useCallback(() => {
    if (!reply.trim() || !sessionRef.current) return;
    const text = reply.trim();
    setReply("");
    setWaitingForReply(false);
    setMessages((p) => [...p, { role: "user", text }]);
    runStream(`/api/diagnose/${encodeURIComponent(sessionRef.current)}/reply`, { content: text });
  }, [reply, runStream]);

  return (
    <aside className={`${fullPage ? "w-full rounded-none border-0 shadow-none" : "w-[500px] shrink-0 rounded-2xl border border-amber-200 shadow-2xl"} flex flex-col bg-amber-50 overflow-hidden h-full`}>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-amber-900 shrink-0">
        <div className="size-8 rounded-full bg-amber-600 flex items-center justify-center shrink-0 shadow-inner">
          <SherlockLogo size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Sherlock</p>
          <p className="text-xs text-amber-300 font-mono truncate">{entityID}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-amber-400 hover:text-white transition-colors text-xl leading-none">×</button>
      </div>

      {/* Token gate */}
      {!tokenSaved ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 py-10">
          <div className="size-16 rounded-full bg-amber-900 flex items-center justify-center shadow-lg">
            <SherlockLogo size={34} className="text-amber-300" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-amber-900 mb-1">Start investigation</p>
            <p className="text-xs text-stone-500 leading-relaxed">
              Sherlock may need to read source code from private GitHub repos.<br />
              Paste a read-only PAT, or leave blank to skip.
            </p>
          </div>
          <div className="w-full flex flex-col gap-1">
            <input
              type="password"
              placeholder="GitHub PAT — ghp_… (optional)"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startInvestigation()}
              className="w-full rounded-xl bg-white border border-amber-200 px-4 py-2.5 text-sm font-mono text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-400 transition-colors"
            />
            {githubToken && (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-stone-400">Token saved in browser</span>
                <button
                  onClick={() => { try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ } setGithubToken(""); }}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Forget
                </button>
              </div>
            )}
          </div>
          <button
            onClick={startInvestigation}
            className="w-full rounded-xl bg-amber-800 hover:bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-sm"
          >
            Investigate
          </button>
        </div>
      ) : (
        <>
          {/* Message thread */}
          <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
            {messages.map((m, i) => {
              if (m.role === "assistant")  return <AssistantBubble key={i} text={m.text} />;
              if (m.role === "tool_call")  return <ToolCallPill    key={i} name={m.name} args={m.args} result={m.result} />;
              if (m.role === "user")       return <UserBubble      key={i} text={m.text} />;
              if (m.role === "question")   return <QuestionBubble  key={i} text={m.text} context={m.context} />;
              if (m.role === "hypothesis") return <HypothesisCard  key={i} data={m.data} />;
              if (m.role === "error")      return <ErrorNote       key={i} text={m.text} />;
              return null;
            })}

            {streaming && !waitingForReply && (
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-full bg-amber-800 flex items-center justify-center shrink-0">
                  <SherlockLogo size={14} className="text-amber-200" />
                </div>
                <div className="flex gap-1 px-3 py-2 rounded-2xl bg-white border border-amber-100">
                  <span className="size-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="size-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="size-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            {done && (
              <p className="text-[11px] text-stone-400 text-center mt-1">
                {done.model === "memory"
                  ? "Loaded from memory · $0.00"
                  : `${(done.input_tokens + done.output_tokens).toLocaleString()} tokens · $${done.cost_usd.toFixed(4)} · ${done.model}`}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Reply input */}
          {(waitingForReply || (done && sessionId)) && (
            <div className="shrink-0 border-t border-amber-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 focus-within:border-amber-400 focus-within:bg-white transition-colors">
                <input
                  type="text"
                  placeholder="Reply to Sherlock…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendReply()}
                  className="flex-1 bg-transparent text-sm text-stone-800 placeholder-stone-400 focus:outline-none"
                />
                <button
                  onClick={sendReply}
                  disabled={!reply.trim() || streaming}
                  className="size-7 rounded-lg bg-amber-800 hover:bg-amber-700 disabled:opacity-30 flex items-center justify-center transition-colors shrink-0"
                >
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="size-7 rounded-full bg-amber-800 flex items-center justify-center shrink-0 mt-0.5">
        <SherlockLogo size={14} className="text-amber-200" />
      </div>
      <div className="flex-1 rounded-2xl rounded-tl-sm bg-white border border-amber-100 px-4 py-3 shadow-sm prose prose-sm prose-stone max-w-none
        prose-p:my-1 prose-p:leading-relaxed
        prose-headings:text-stone-800 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
        prose-strong:text-stone-800 prose-strong:font-semibold
        prose-code:text-amber-800 prose-code:bg-amber-50 prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-amber-50 prose-pre:border prose-pre:border-amber-100 prose-pre:rounded-xl prose-pre:text-xs
        prose-table:text-xs prose-th:text-stone-600 prose-th:font-semibold prose-td:text-stone-700
        prose-hr:border-amber-100 prose-hr:my-2
        prose-ul:my-1 prose-li:my-0.5
        prose-ol:my-1
        prose-a:text-amber-700 prose-a:no-underline hover:prose-a:underline">
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-amber-800 px-4 py-3 text-sm text-white leading-relaxed shadow-sm">
        {text}
      </div>
    </div>
  );
}

const GITHUB_TOOLS = new Set([
  "fetch_github_file", "fetch_github_blame", "fetch_github_file_history", "search_github_callers",
]);

const GITHUB_TOOL_LABEL: Record<string, string> = {
  fetch_github_file:         "Reading file",
  fetch_github_blame:        "Git blame",
  fetch_github_file_history: "Commit history",
  search_github_callers:     "Searching callers",
};

function _extractGithubUrl(args: string): string | null {
  const m = args.match(/url=['"]?(https?:\/\/github\.com\/[^'">,\s]+)/);
  return m ? m[1] : null;
}

function _githubFileLabel(url: string): string {
  // "owner/repo · path/to/file.py" from a GitHub blob URL
  const m = url.match(/github\.com\/([^/]+\/[^/]+)\/blob\/[^/]+\/(.+)/);
  if (m) return `${m[1]} · ${m[2]}`;
  return url.replace("https://github.com/", "");
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900 underline underline-offset-2 text-xs"
      onClick={(e) => e.stopPropagation()}>
      {label}
      <svg className="size-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

function EvidencePanel({ name, result }: { name: string; result: Record<string, unknown> }) {
  if (result.error) {
    return (
      <div className="flex flex-col gap-1 text-xs text-red-700">
        <span>⚠ {result.error as string}</span>
        {typeof result.github_url === "string" && <ExternalLink href={result.github_url} label="Open on GitHub" />}
      </div>
    );
  }

  if (name === "query_entity_events") {
    const events = (result.events as Array<Record<string, unknown>>) ?? [];
    if (!events.length) return <span className="text-xs text-stone-400">No events found.</span>;
    return (
      <table className="w-full text-xs border-collapse">
        <thead><tr className="text-stone-500 font-semibold text-left">
          <th className="pr-3 pb-1">Event</th><th className="pr-3 pb-1">ts (ns)</th><th className="pb-1">Metadata</th>
        </tr></thead>
        <tbody>{events.map((e, i) => (
          <tr key={i} className="border-t border-amber-100">
            <td className="pr-3 py-1 font-mono text-amber-900 whitespace-nowrap">{e.event_name as string}</td>
            <td className="pr-3 py-1 text-stone-400 whitespace-nowrap">{String(e.timestamp_ns).slice(0, 13)}</td>
            <td className="py-1 text-stone-600 break-all">{JSON.stringify(e.metadata)}</td>
          </tr>
        ))}</tbody>
      </table>
    );
  }

  if (name === "query_entity_operations") {
    const ops = (result.operations as Array<Record<string, unknown>>) ?? [];
    if (!ops.length) return <span className="text-xs text-stone-400">No operations found.</span>;
    return (
      <div className="flex flex-col gap-1.5">
        {ops.map((op, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="font-mono text-amber-900">{op.operation as string}</span>
            <span className="text-stone-400">{(op.created_at as string).slice(0, 19).replace("T", " ")}</span>
            {typeof op.tempo_url === "string" && op.tempo_url && <ExternalLink href={op.tempo_url} label="Trace" />}
          </div>
        ))}
      </div>
    );
  }

  if (name === "query_loki") {
    const lines = (result.lines as Array<Record<string, unknown>>) ?? [];
    const grafanaUrl = result.grafana_url as string | undefined;
    const srcLinks = (result.src_links as string[]) ?? [];
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 text-xs text-stone-500">
          <span>{lines.length} log line{lines.length !== 1 ? "s" : ""}</span>
          {grafanaUrl && <ExternalLink href={grafanaUrl} label="View in Grafana" />}
        </div>
        {srcLinks.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {srcLinks.map((s, i) => <ExternalLink key={i} href={s.split("#")[0]} label={_githubFileLabel(s.split("#")[0])} />)}
          </div>
        )}
        {lines.length > 0 && (
          <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5 font-mono text-[10px] text-stone-600">
            {lines.slice(0, 20).map((l, i) => (
              <div key={i} className="flex gap-2">
                <span className={`shrink-0 ${l.level === "error" ? "text-red-500" : "text-stone-400"}`}>{(l.level as string) ?? "—"}</span>
                <span className="break-all">{l.msg as string ?? ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (name === "query_prometheus") {
    const series = (result.series as Array<Record<string, unknown>>) ?? [];
    const grafanaUrl = result.grafana_url as string | undefined;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 text-xs text-stone-500">
          <span>{series.length} series</span>
          {grafanaUrl && <ExternalLink href={grafanaUrl} label="View in Grafana" />}
        </div>
        {series.length > 0 && (
          <table className="w-full text-xs border-collapse">
            <tbody>{series.map((s, i) => (
              <tr key={i} className="border-t border-amber-100">
                <td className="pr-3 py-1 text-stone-500 font-mono text-[10px] break-all">{JSON.stringify(s.labels)}</td>
                <td className="py-1 text-amber-900 font-semibold whitespace-nowrap">{String(s.value ?? "")}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {typeof result.note === "string" && result.note && <span className="text-xs text-stone-400 italic">{result.note}</span>}
      </div>
    );
  }

  if (name === "query_similar_errors") {
    const entities = (result.entities as Array<Record<string, unknown>>) ?? [];
    const isPattern = result.pattern as boolean;
    return (
      <div className="flex flex-col gap-1 text-xs">
        <span className={`font-semibold ${isPattern ? "text-red-600" : "text-stone-600"}`}>
          {result.count as number} similar error{(result.count as number) !== 1 ? "s" : ""}
          {result.operation ? ` (${result.operation as string})` : ""}
          {isPattern ? " — widespread pattern" : " — isolated"}
        </span>
        {entities.slice(0, 5).map((e, i) => (
          <span key={i} className="font-mono text-stone-500 text-[10px]">{e.entity_id as string}</span>
        ))}
        {entities.length > 5 && <span className="text-stone-400">…and {entities.length - 5} more</span>}
      </div>
    );
  }

  if (name === "fetch_github_file") {
    const content = result.content as string | undefined;
    const url = result.url as string | undefined;
    return (
      <div className="flex flex-col gap-2">
        {url && <ExternalLink href={url} label={_githubFileLabel(url)} />}
        {content && (
          <pre className="max-h-48 overflow-y-auto text-[10px] font-mono text-stone-700 bg-stone-50 rounded p-2 border border-stone-100 whitespace-pre-wrap">
            {content}
          </pre>
        )}
      </div>
    );
  }

  if (name === "fetch_github_blame") {
    const blame = (result.blame as string[]) ?? [];
    const fileUrl = result.file_url as string | undefined;
    return (
      <div className="flex flex-col gap-1">
        {fileUrl && <ExternalLink href={fileUrl} label={_githubFileLabel(fileUrl)} />}
        {blame.map((b, i) => <span key={i} className="text-[10px] font-mono text-stone-600">{b}</span>)}
      </div>
    );
  }

  if (name === "fetch_github_file_history") {
    const commits = (result.commits as Array<Record<string, unknown>>) ?? [];
    return (
      <div className="flex flex-col gap-1">
        {commits.slice(0, 5).map((c, i) => (
          <div key={i} className="flex gap-2 text-[10px] font-mono">
            <span className="text-amber-800 shrink-0">{c.sha as string}</span>
            <span className="text-stone-400 shrink-0">{c.date as string}</span>
            <span className="text-stone-600 truncate">{c.message as string}</span>
            {typeof c.url === "string" && c.url && <ExternalLink href={c.url} label="↗" />}
          </div>
        ))}
      </div>
    );
  }

  // Default: show key scalar fields, skip long arrays
  const preview = Object.entries(result)
    .filter(([, v]) => typeof v !== "object" || v === null)
    .slice(0, 8)
    .map(([k, v]) => `${k}: ${String(v)}`);
  return <pre className="text-[10px] font-mono text-stone-600 whitespace-pre-wrap">{preview.join("\n")}</pre>;
}

function ToolCallPill({ name, args, result }: { name: string; args: string; result?: Record<string, unknown> }) {
  const [open, setOpen] = useState(!!result);
  const isGithub = GITHUB_TOOLS.has(name);
  const githubUrl = isGithub ? _extractGithubUrl(args) : null;

  // Auto-open when result arrives
  useEffect(() => {
    if (result) setOpen(true);
  }, [result]);

  return (
    <div className="pl-9 relative flex flex-col gap-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-amber-200 bg-orange-50 hover:bg-amber-100 px-3 py-1.5 text-xs text-stone-500 transition-colors w-full text-left"
      >
        <span className="size-1.5 rounded-full bg-amber-400 shrink-0" />
        <span className="font-mono font-medium text-amber-900">
          {isGithub ? (GITHUB_TOOL_LABEL[name] ?? name) : name}
        </span>
        {!githubUrl && (
          <span className="text-stone-400 truncate flex-1">{args ? `(${args.length > 60 ? args.slice(0, 60) + "…" : args})` : "()"}</span>
        )}
        {githubUrl && (
          <span className="text-stone-400 truncate flex-1">{_githubFileLabel(githubUrl)}</span>
        )}
        <span className="shrink-0 text-amber-300">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="rounded-lg border border-amber-200 bg-white shadow-sm px-3 py-2.5 flex flex-col gap-2">
          {result ? (
            <EvidencePanel name={name} result={result} />
          ) : (
            <span className="text-xs text-stone-400 font-mono">{args}</span>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionBubble({ text, context }: { text: string; context: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="size-7 rounded-full bg-amber-800 flex items-center justify-center shrink-0 mt-0.5">
        <SherlockLogo size={14} className="text-amber-200" />
      </div>
      <div className="flex-1 rounded-2xl rounded-tl-sm border border-orange-300 bg-orange-50 px-4 py-3 shadow-sm">
        <p className="text-xs font-semibold text-orange-700 mb-1">Sherlock needs more information</p>
        <p className="text-sm text-stone-800 leading-relaxed">{text}</p>
        {context && <p className="mt-2 text-xs text-stone-400 italic">{context}</p>}
      </div>
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex justify-center">
      <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{text}</p>
    </div>
  );
}

function HypothesisCard({ data }: { data: HypothesisData }) {
  const confColor = CONFIDENCE_COLOR[data.confidence] ?? "text-stone-600 bg-stone-50 border-stone-300";
  return (
    <div className="mt-2 rounded-2xl border-2 border-amber-800 bg-white shadow-lg overflow-hidden">
      {/* Verdict banner */}
      <div className="bg-gradient-to-r from-amber-900 to-amber-700 px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-300 mb-1">Root cause</p>
          <p className="text-xl font-bold text-white">
            {CLASS_LABEL[data.classification] ?? data.classification}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full border ${confColor}`}>
          {data.confidence} confidence
        </span>
      </div>

      {/* Body */}
      <div className="px-5 py-4 flex flex-col gap-4">
        <p className="text-sm text-stone-700 leading-relaxed">{data.summary}</p>

        {data.evidence.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700 mb-2">Evidence</p>
            <ul className="flex flex-col gap-2">
              {data.evidence.map((e, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-stone-600">
                  <span className="shrink-0 mt-0.5 size-4 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-[10px]">{i + 1}</span>
                  <span className="leading-relaxed">{e}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.recommendation && (
          <div className="rounded-xl bg-gradient-to-r from-amber-900 to-amber-700 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-300 mb-1">Next step</p>
            <p className="text-sm text-white leading-relaxed">{data.recommendation}</p>
          </div>
        )}

        {data.gaps && (
          <p className="text-xs text-stone-400 italic border-t border-amber-100 pt-3">{data.gaps}</p>
        )}
      </div>
    </div>
  );
}
