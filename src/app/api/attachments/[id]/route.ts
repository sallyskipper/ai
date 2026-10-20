import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/domain/messages";

// Attachments are stored outside /public and served only to conversation members.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const att = await db.attachment.findUnique({
    where: { id },
    include: { message: { include: { conversation: { include: { order: { select: { customerId: true, providerId: true } } } } } } },
  });
  const order = att?.message.conversation.order;
  if (!att || !order || (viewer.id !== order.customerId && viewer.id !== order.providerId && viewer.role !== "ADMIN"))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = await readFile(path.join(UPLOAD_DIR, path.basename(att.storageKey)));
  const inline = att.mimeType.startsWith("image/") || att.mimeType === "application/pdf";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(att.fileName)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
