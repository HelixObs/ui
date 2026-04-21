"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DiagnoseChunk,
  type DoneData,
  type HypothesisData,
  streamChunks,
} from "@/lib/sherlock";

interface Props {
  entityID: string;
  instrumentID?: string;
  onClose: () => void;
  fullPage?: boolean;
}

type Message =
  | { role: "assistant"; text: string }
  | { role: "tool_call"; name: string; args: string }
  | { role: "hypothesis"; data: HypothesisData }
  | { role: "question"; text: string; context: string }
  | { role: "user"; text: string }
  | { role: "error"; text: string };

const CONFIDENCE_COLOR: Record<string, string> = {
  high:   "text-emerald-600 bg-emerald-50 border-emerald-200",
  medium: "text-yellow-700 bg-yellow-50 border-yellow-200",
  low:    "text-orange-600 bg-orange-50 border-orange-200",
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
  const [githubToken,      setGithubToken]      = useState("");
  const [tokenSaved,       setTokenSaved]       = useState(false);

  // Pre-fill token from localStorage after mount — gate still shows so user clicks Investigate.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setGithubToken(saved);
    } catch { /* storage unavailable */ }
  }, []);
  const [sessionId,        setSessionId]        = useState<string | null>(null);
  const [messages,         setMessages]         = useState<Message[]>([]);
  const [streaming,        setStreaming]        = useState(false);
  const [done,             setDone]             = useState<DoneData | null>(null);
  const [reply,            setReply]            = useState("");
  const [waitingForReply,  setWaitingForReply]  = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);

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
          // Tool call announcements (→ **name**(...)) become tool_call bubbles.
          const toolMatch = chunk.text.match(/^[\n\r]*→ \*\*(.+?)\*\*\(([\s\S]*)?\)\s*$/);
          if (toolMatch) {
            setMessages((p) => [...p, {
              role: "tool_call",
              name: toolMatch[1],
              args: toolMatch[2] ?? "",
            }]);
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
        setMessages((p) => [...p, {
          role: "question",
          text: chunk.text,
          context: (chunk.data.context as string) ?? "",
        }]);
        setWaitingForReply(true);
        break;
      case "error":
        // Surface tool/infra errors as a gentle note, not a raw traceback.
        setMessages((p) => [...p, {
          role: "error",
          text: "Something went wrong on the server. The investigation may be incomplete.",
        }]);
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
    runStream(`/api/diagnose/${encodeURIComponent(sessionRef.current)}/reply`, {
      content: text,
    });
  }, [reply, runStream]);

  return (
    <aside className={`${fullPage ? "w-full rounded-none border-0 shadow-none" : "w-[480px] shrink-0 rounded-2xl border border-zinc-200 shadow-2xl"} flex flex-col bg-white overflow-hidden h-full`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 shrink-0">
        <div className="size-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">S</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900">Sherlock</p>
          <p className="text-xs text-zinc-400 font-mono truncate">{entityID}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-zinc-300 hover:text-zinc-600 transition-colors text-xl leading-none">×</button>
      </div>

      {/* Token gate */}
      {!tokenSaved ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 py-10">
          <div className="size-14 rounded-full bg-zinc-900 flex items-center justify-center">
            <span className="text-white text-xl font-bold">S</span>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-900 mb-1">Start investigation</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
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
              className="w-full rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-sm font-mono text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 focus:bg-white transition-colors"
            />
            {githubToken && (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-zinc-400">Token saved in browser</span>
                <button
                  onClick={() => {
                    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
                    setGithubToken("");
                  }}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Forget
                </button>
              </div>
            )}
          </div>
          <button
            onClick={startInvestigation}
            className="w-full rounded-xl bg-zinc-900 hover:bg-zinc-700 px-4 py-2.5 text-sm font-medium text-white transition-colors"
          >
            Investigate
          </button>
        </div>
      ) : (
        <>
          {/* Message thread */}
          <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
            {messages.map((m, i) => {
              if (m.role === "assistant") return (
                <AssistantBubble key={i} text={m.text} />
              );
              if (m.role === "tool_call") return (
                <ToolCallPill key={i} name={m.name} args={m.args} />
              );
              if (m.role === "user") return (
                <UserBubble key={i} text={m.text} />
              );
              if (m.role === "question") return (
                <QuestionBubble key={i} text={m.text} context={m.context} />
              );
              if (m.role === "hypothesis") return (
                <HypothesisCard key={i} data={m.data} />
              );
              if (m.role === "error") return (
                <ErrorNote key={i} text={m.text} />
              );
              return null;
            })}

            {streaming && !waitingForReply && (
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
                  <span className="text-white text-[10px] font-bold">S</span>
                </div>
                <div className="flex gap-1 px-3 py-2 rounded-2xl bg-zinc-100">
                  <span className="size-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="size-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="size-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            {done && (
              <p className="text-[11px] text-zinc-400 text-center mt-1">
                {(done.input_tokens + done.output_tokens).toLocaleString()} tokens · ${done.cost_usd.toFixed(4)} · {done.model}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Reply input */}
          {(waitingForReply || (done && sessionId)) && (
            <div className="shrink-0 border-t border-zinc-100 px-4 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 focus-within:border-zinc-400 focus-within:bg-white transition-colors">
                <input
                  type="text"
                  placeholder="Reply to Sherlock…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendReply()}
                  className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none"
                />
                <button
                  onClick={sendReply}
                  disabled={!reply.trim() || streaming}
                  className="size-7 rounded-lg bg-zinc-900 hover:bg-zinc-700 disabled:opacity-30 flex items-center justify-center transition-colors shrink-0"
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
      <div className="size-7 rounded-full bg-zinc-900 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-white text-[10px] font-bold">S</span>
      </div>
      <div className="flex-1 rounded-2xl rounded-tl-sm bg-zinc-100 px-4 py-3 text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-zinc-900 px-4 py-3 text-sm text-white leading-relaxed">
        {text}
      </div>
    </div>
  );
}

function ToolCallPill({ name, args }: { name: string; args: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-start gap-2.5 pl-9">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 px-3 py-1.5 text-xs text-zinc-500 transition-colors w-full text-left"
      >
        <span className="size-1.5 rounded-full bg-zinc-400 shrink-0" />
        <span className="font-mono font-medium text-zinc-700">{name}</span>
        <span className="text-zinc-400 truncate flex-1">{args ? `(${args.length > 60 ? args.slice(0, 60) + "…" : args})` : "()"}</span>
        <span className="shrink-0 text-zinc-300">{open ? "▲" : "▼"}</span>
      </button>
      {open && args && (
        <div className="absolute mt-7 ml-0 rounded-lg border border-zinc-200 bg-white shadow-md px-3 py-2 text-xs font-mono text-zinc-600 max-w-sm z-10 break-all">
          {args}
        </div>
      )}
    </div>
  );
}

function QuestionBubble({ text, context }: { text: string; context: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="size-7 rounded-full bg-zinc-900 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-white text-[10px] font-bold">S</span>
      </div>
      <div className="flex-1 rounded-2xl rounded-tl-sm border border-yellow-200 bg-yellow-50 px-4 py-3">
        <p className="text-xs font-semibold text-yellow-700 mb-1">Sherlock needs more information</p>
        <p className="text-sm text-zinc-800 leading-relaxed">{text}</p>
        {context && <p className="mt-2 text-xs text-zinc-400 italic">{context}</p>}
      </div>
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex justify-center">
      <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{text}</p>
    </div>
  );
}

function HypothesisCard({ data }: { data: HypothesisData }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="size-7 rounded-full bg-zinc-900 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-white text-[10px] font-bold">S</span>
      </div>
      <div className="flex-1 rounded-2xl rounded-tl-sm border border-zinc-200 bg-white shadow-sm px-4 py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-zinc-900">
            {CLASS_LABEL[data.classification] ?? data.classification}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CONFIDENCE_COLOR[data.confidence] ?? "text-zinc-500 bg-zinc-50 border-zinc-200"}`}>
            {data.confidence} confidence
          </span>
        </div>
        <p className="text-sm text-zinc-700 leading-relaxed">{data.summary}</p>
        {data.evidence.length > 0 && (
          <ul className="flex flex-col gap-1.5 border-t border-zinc-100 pt-3">
            {data.evidence.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-500">
                <span className="text-zinc-300 shrink-0 mt-0.5">→</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        )}
        {data.recommendation && (
          <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2.5 text-xs text-zinc-700">
            <span className="font-semibold text-zinc-500 mr-1.5">Next step</span>{data.recommendation}
          </div>
        )}
        {data.gaps && (
          <p className="text-xs text-zinc-400 italic border-t border-zinc-100 pt-2">{data.gaps}</p>
        )}
      </div>
    </div>
  );
}
