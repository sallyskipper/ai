import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { listMessages } from "@/lib/domain/messages";

// Polled by the order workspace for new messages. Access is checked per request.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const messages = await listMessages(viewer, id);
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
