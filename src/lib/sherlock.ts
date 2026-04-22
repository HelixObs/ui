// Types and streaming helper for the Sherlock AI agent.
// Used only by Client Components and API routes — never imports server-only modules.

export type ChunkType = "step" | "evidence" | "hypothesis" | "question" | "memory_prompt" | "error" | "done";

export interface DiagnoseChunk {
  type: ChunkType;
  text: string;
  data: Record<string, unknown>;
}

export interface HypothesisData {
  classification: "code_bug" | "data_quality" | "configuration" | "infrastructure" | "unknown";
  confidence: "high" | "medium" | "low";
  summary: string;
  evidence: string[];
  recommendation: string;
  gaps?: string;
}

export interface DoneData {
  session_id?: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model: string;
}

// Stream NDJSON chunks from a fetch Response body.
export async function* streamChunks(
  response: Response,
): AsyncGenerator<DiagnoseChunk> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) yield JSON.parse(trimmed) as DiagnoseChunk;
    }
  }
  if (buf.trim()) yield JSON.parse(buf) as DiagnoseChunk;
}
