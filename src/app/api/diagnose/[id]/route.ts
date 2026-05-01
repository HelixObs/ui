// BFF proxy: browser → Next.js → Sherlock /diagnose/{entity_id}
// Keeps SHERLOCK_URL server-side; browser talks to one origin.

import { NextResponse } from "next/server";
import { SHERLOCK_URL } from "@/lib/config";

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const body = await req.json();

  const upstream = await fetch(
    `${SHERLOCK_URL}/diagnose/${encodeURIComponent(decodeURIComponent(id))}`,
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

  // Pass the NDJSON stream straight through.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
