import { HERALD_URL } from "@/lib/config";
import { NextResponse } from "next/server";

export async function DELETE(
  _req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  try {
    const res = await fetch(`${HERALD_URL}/api/v1/notifications/silence/${id}`, {
      method: "DELETE",
    });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ error: "not found" }, { status: res.status });
  } catch (err) {
    console.error("delete silence proxy error", err);
    return NextResponse.json({ error: "internal error" }, { status: 502 });
  }
}
