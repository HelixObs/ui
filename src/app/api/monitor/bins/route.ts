import { NextRequest, NextResponse } from "next/server";

const gatewayURL = process.env.GATEWAY_URL ?? "http://localhost:8080";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.toString();
  const url = `${gatewayURL}/api/v1/monitor/bins?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
