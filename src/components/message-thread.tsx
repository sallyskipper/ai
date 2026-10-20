"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { sendMessageAction } from "@/actions/orders";
import { btnClass } from "./ui";
import { Spinner } from "./forms";

type Msg = {
  id: string;
  body: string;
  isSystem: boolean;
  createdAt: string;
  sender: { id: string; displayName: string; avatarColor: string; role: string };
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
};

export function MessageThread({ orderId, viewerId, canSend }: { orderId: string; viewerId: string; canSend: boolean }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/orders/${orderId}/messages`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) return setError(j.error ?? "Could not load messages");
      setMessages(j.messages);
      setError(null);
    } catch {
      setError("Connection lost — retrying…");
    }
  }, [orderId]);

  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const last = messages?.at(-1)?.id ?? null;
    if (last && last !== lastId.current) {
      lastId.current = last;
      bottom.current?.scrollIntoView({ block: "nearest" });
    }
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() && files.length === 0) return;
    setSending(true);
    const fd = new FormData();
    fd.set("orderId", orderId);
    fd.set("body", body);
    files.forEach((f) => fd.append("files", f));
    const r = await sendMessageAction(fd);
    setSending(false);
    if (!r.ok) return setError(r.error);
    setBody("");
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  return (
    <div className="flex h-[560px] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages === null && !error && <p className="flex items-center gap-2 text-sm text-muted"><Spinner /> Loading messages…</p>}
        {messages?.length === 0 && <p className="py-10 text-center text-sm text-muted">No messages yet. Say hi and agree on a schedule.</p>}
        {messages?.map((m) => {
          const mine = m.sender.id === viewerId;
          return (
            <div key={m.id} className={clsx("flex gap-2.5", mine && "flex-row-reverse")}>
              <span className="mt-5 size-7 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${m.sender.avatarColor}, #1c1c21)` }} aria-hidden />
              <div className={clsx("max-w-[78%]", mine && "text-right")}>
                <p className="mb-1 text-[11px] text-faint">
                  {m.sender.displayName}
                  {m.sender.role === "ADMIN" && <span className="ml-1 font-semibold text-red-hot">Staff</span>}
                  {" · "}
                  {new Date(m.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
                <div className={clsx("inline-block rounded-xl px-3.5 py-2 text-left text-sm whitespace-pre-wrap", mine ? "rounded-tr-sm bg-red text-white" : "rounded-tl-sm border border-line bg-panel-2")}>
                  {m.body}
                  {m.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {m.attachments.map((a) => (
                        <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className={clsx("flex items-center gap-2 rounded-md px-2 py-1 text-xs underline-offset-2 hover:underline", mine ? "bg-black/20" : "bg-ink")}>
                          📎 {a.fileName} <span className="opacity-60">({Math.ceil(a.sizeBytes / 1024)} KB)</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {error && <p className="border-t border-line px-5 py-2 text-xs text-red-hot">{error}</p>}
      {canSend ? (
        <form onSubmit={send} className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
              rows={2}
              maxLength={4000}
              placeholder="Write a message… (never share passwords)"
              className="input flex-1 resize-none"
              aria-label="Message"
            />
            <div className="flex flex-col gap-1.5">
              <label className={clsx(btnClass("secondary", "sm"), "cursor-pointer")}>
                Attach
                <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain" className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
              </label>
              <button disabled={sending} className={btnClass("primary", "sm")}>{sending ? <Spinner /> : "Send"}</button>
            </div>
          </div>
          {files.length > 0 && <p className="mt-1.5 text-xs text-muted">Attaching: {files.map((f) => f.name).join(", ")} (max 5 MB each)</p>}
        </form>
      ) : (
        <p className="border-t border-line px-5 py-3 text-xs text-faint">This conversation is read-only.</p>
      )}
    </div>
  );
}
