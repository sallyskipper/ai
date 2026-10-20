"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; message: string; ok: boolean };

export function toast(message: string, ok = true) {
  window.dispatchEvent(new CustomEvent("rl-toast", { detail: { message, ok } }));
}

/** Shows success messages from server actions, which survive the form unmounting. */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const { message, ok } = (e as CustomEvent).detail;
      const id = ++n;
      setToasts((t) => [...t.slice(-2), { id, message, ok }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
    };
    window.addEventListener("rl-toast", onToast);
    return () => window.removeEventListener("rl-toast", onToast);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-panel-2 px-4 py-3 text-sm shadow-2xl">
          <span className={`size-2 rounded-full ${t.ok ? "bg-ok" : "bg-red"}`} />
          {t.message}
        </div>
      ))}
    </div>
  );
}
