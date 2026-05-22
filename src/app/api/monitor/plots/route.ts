import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "endpoint removed — use /api/monitor/fields" }, { status: 410 });
}
