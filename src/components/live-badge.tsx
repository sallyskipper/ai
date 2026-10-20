"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Polls the unread notification count and refreshes server data when it changes. */
export function NotificationPoller({ initial }: { initial: number }) {
  const router = useRouter();
  const last = useRef(initial);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/notifications/unread", { cache: "no-store" });
        if (!r.ok) return;
        const { count } = await r.json();
        if (count !== last.current) {
          last.current = count;
          router.refresh();
        }
      } catch {}
    }, 15000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
