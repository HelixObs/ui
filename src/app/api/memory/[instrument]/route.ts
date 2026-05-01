import { NextResponse } from "next/server";
import { SHERLOCK_URL } from "@/lib/config";

export async function GET(
  _req: Request,
  props: { params: Promise<{ instrument: string }> },
) {
  const { instrument } = await props.params;
  try {
    const res = await fetch(`${SHERLOCK_URL}/memory/${encodeURIComponent(instrument)}`, {
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json([], { status: 200 });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json([]);
  }
}
