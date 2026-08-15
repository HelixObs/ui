// BFF proxy: browser → Next.js → Sherlock GET /audit

import { NextResponse } from "next/server";
import { SHERLOCK_URL } from "@/lib/config";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();

  try {
    const res = await fetch(`${SHERLOCK_URL}/audit${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json([], { status: 200 });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json([]);
  }
}
