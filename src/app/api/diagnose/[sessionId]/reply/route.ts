// BFF proxy: browser → Next.js → Sherlock /diagnose/{session_id}/reply

import { NextResponse } from "next/server";

const SHERLOCK_URL = process.env.SHERLOCK_URL ?? "http://localhost:8082";

export async function POST(
  req: Request,
  props: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await props.params;
  const body = await req.json();

  const upstream = await fetch(
    `${SHERLOCK_URL}/diagnose/${encodeURIComponent(sessionId)}/reply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!upstream.ok && !upstream.body) {
    return NextResponse.json(
      { error: `sherlock ${upstream.status}` },
      { status: upstream.status },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
