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
  | { role: "step";       text: string }
  | { role: "hypothesis"; data: HypothesisData }
  | { role: "question";   text: string; context: string }
  | { role: "error";      text: string };

const CONFIDENCE_COLOUR: Record<string, string> = {
  high:   "text-emerald-600",
  medium: "text-yellow-600",
  low:    "text-orange-600",
};

const CLASS_LABEL: Record<string, string> = {
  code_bug:       "Code bug",
  data_quality:   "Data quality",
  configuration:  "Configuration",
  infrastructure: "Infrastructure",
  unknown:        "Unknown",
};

export default function SherlockPanel({ entityID, instrumentID, onClose, fullPage = false }: Props) {
  const [githubToken, setGithubToken] = useState("");
  const [tokenSaved,  setTokenSaved]  = useState(false);
  const [sessionId,   setSessionId]   = useState<string | null>(null);
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [streaming,   setStreaming]   = useState(false);
  const [done,        setDone]        = useState<DoneData | null>(null);
  const [reply,       setReply]       = useState("");
  const [waitingForReply, setWaitingForReply] = useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const sessionRef  = useRef<string | null>(null);

  // Auto-scroll to bottom as messages arrive.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const appendStep = useCallback((text: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      // Coalesce consecutive step tokens into one bubble.
      if (last?.role === "step") {
        return [...prev.slice(0, -1), { role: "step", text: last.text + text }];
      }
      return [...prev, { role: "step", text }];
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
        setMessages((p) => [...p, { role: "error", text: `HTTP ${res.status}` }]);
        return;
      }
      for await (const chunk of streamChunks(res)) {
        handleChunk(chunk);
      }
    } catch (err) {
      setMessages((p) => [...p, { role: "error", text: String(err) }]);
    } finally {
      setStreaming(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChunk = (chunk: DiagnoseChunk) => {
    switch (chunk.type) {
      case "step":
        if (chunk.text) appendStep(chunk.text);
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
        setMessages((p) => [...p, { role: "error", text: chunk.text }]);
        break;
      case "done":
        if (chunk.data.cost_usd !== undefined) setDone(chunk.data as unknown as DoneData);
        break;
    }
  };

  const startInvestigation = useCallback(() => {
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
    setMessages((p) => [...p, { role: "step", text: `**You:** ${text}` }]);
    runStream(`/api/diagnose/${encodeURIComponent(sessionRef.current)}/reply`, {
      content: text,
    });
  }, [reply, runStream]);

  return (
    <aside className={`${fullPage ? "w-full rounded-none border-0 shadow-none" : "w-96 shrink-0 rounded-xl border border-zinc-200 shadow-2xl"} flex flex-col bg-white overflow-hidden h-full`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 shrink-0">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Sherlock</p>
          <p className="text-xs text-zinc-400 font-mono truncate max-w-[240px]">{entityID}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-zinc-700 text-xl leading-none transition-colors">×</button>
      </div>

      {/* Token gate */}
      {!tokenSaved ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-8">
          <p className="text-xs text-zinc-500 text-center">
            Sherlock may need to read source code from private GitHub repos.<br />
            Paste a read-only PAT, or leave blank to skip source fetching.
          </p>
          <input
            type="password"
            placeholder="ghp_… (optional)"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            className="w-full rounded-md bg-white border border-zinc-300 px-3 py-2 text-xs font-mono text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
          />
          <button
            onClick={startInvestigation}
            className="w-full rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 text-sm text-white transition-colors"
          >
            Start investigation
          </button>
        </div>
      ) : (
        <>
          {/* Message stream */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 text-sm">
            {messages.map((m, i) => {
              if (m.role === "step") return (
                <p key={i} className="text-zinc-700 whitespace-pre-wrap leading-relaxed font-mono text-xs">{m.text}</p>
              );
              if (m.role === "error") return (
                <p key={i} className="text-red-600 text-xs font-mono">{m.text}</p>
              );
              if (m.role === "question") return (
                <div key={i} className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2.5">
                  <p className="text-xs text-yellow-700 font-semibold mb-1">Question</p>
                  <p className="text-xs text-zinc-700">{m.text}</p>
                  {m.context && <p className="mt-1 text-xs text-zinc-400 italic">{m.context}</p>}
                </div>
              );
              if (m.role === "hypothesis") return (
                <HypothesisCard key={i} data={m.data} />
              );
              return null;
            })}

            {streaming && !waitingForReply && (
              <span className="text-xs text-zinc-400 animate-pulse">Sherlock is thinking…</span>
            )}

            {done && (
              <p className="text-xs text-zinc-400 text-right mt-1">
                {done.input_tokens + done.output_tokens} tokens · ${done.cost_usd.toFixed(4)} · {done.model}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Reply input */}
          {(waitingForReply || (done && sessionId)) && (
            <div className="shrink-0 border-t border-zinc-200 px-3 py-2 flex gap-2">
              <input
                type="text"
                placeholder="Reply to Sherlock…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendReply()}
                className="flex-1 rounded-md bg-white border border-zinc-300 px-3 py-1.5 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
              />
              <button
                onClick={sendReply}
                disabled={!reply.trim() || streaming}
                className="rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 border border-zinc-700 px-3 py-1.5 text-xs text-white transition-colors"
              >
                Send
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function HypothesisCard({ data }: { data: HypothesisData }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-900">
          {CLASS_LABEL[data.classification] ?? data.classification}
        </span>
        <span className={`text-xs font-mono ${CONFIDENCE_COLOUR[data.confidence] ?? "text-zinc-500"}`}>
          {data.confidence} confidence
        </span>
      </div>
      <p className="text-xs text-zinc-700 leading-relaxed">{data.summary}</p>
      {data.evidence.length > 0 && (
        <ul className="flex flex-col gap-1">
          {data.evidence.map((e, i) => (
            <li key={i} className="text-xs text-zinc-500 font-mono before:content-['→_'] before:text-zinc-400">{e}</li>
          ))}
        </ul>
      )}
      {data.recommendation && (
        <div className="rounded-md bg-zinc-100 px-2.5 py-2 text-xs text-zinc-700">
          <span className="text-zinc-400 font-semibold mr-1">Next:</span>{data.recommendation}
        </div>
      )}
      {data.gaps && (
        <p className="text-xs text-zinc-400 italic">{data.gaps}</p>
      )}
    </div>
  );
}
