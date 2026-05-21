import { fetchSilences } from "@/lib/herald";
import { HERALD_URL } from "@/lib/config";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const instrumentID = searchParams.get("instrument_id") ?? "";
  if (!instrumentID)
    return NextResponse.json({ error: "instrument_id required" }, { status: 400 });
  try {
    const silences = await fetchSilences(instrumentID);
    return NextResponse.json(silences);
  } catch (err) {
    console.error("silences proxy error", err);
    return NextResponse.json({ error: "internal error" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(`${HERALD_URL}/api/v1/notifications/silence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("create silence proxy error", err);
    return NextResponse.json({ error: "internal error" }, { status: 502 });
  }
}
