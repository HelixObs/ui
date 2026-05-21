import { fetchAlerts } from "@/lib/herald";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const instrumentID = searchParams.get("instrument_id") ?? "";
  if (!instrumentID)
    return NextResponse.json({ error: "instrument_id required" }, { status: 400 });
  try {
    const alerts = await fetchAlerts(instrumentID);
    return NextResponse.json(alerts);
  } catch (err) {
    console.error("alerts proxy error", err);
    return NextResponse.json({ error: "internal error" }, { status: 502 });
  }
}
