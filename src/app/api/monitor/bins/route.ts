import { NextRequest, NextResponse } from "next/server";
import { HERALD_URL } from "@/lib/config";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.toString();
  const url = `${HERALD_URL}/api/v1/monitor/bins?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
