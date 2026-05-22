import { NextRequest, NextResponse } from "next/server";
import { HERALD_URL } from "@/lib/config";

export async function GET(req: NextRequest) {
  const instrument = req.nextUrl.searchParams.get("instrument") ?? "";
  const url = `${HERALD_URL}/api/v1/monitor/fields?instrument=${encodeURIComponent(instrument)}`;
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
