import { HERALD_URL } from "@/lib/config";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(`${HERALD_URL}/api/v1/instruments`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error("instruments proxy error", err);
    return NextResponse.json({ error: "internal error" }, { status: 502 });
  }
}
