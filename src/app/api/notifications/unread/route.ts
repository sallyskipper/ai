import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/auth";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ count: 0 }, { status: 401 });
  const count = await db.notification.count({ where: { userId: viewer.id, readAt: null } });
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
