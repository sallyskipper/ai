"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import type { ActionResult } from "@/lib/errors";
import { btnClass } from "./ui";
import { toast } from "./toaster";

export type FormAction = (fd: FormData) => Promise<ActionResult<unknown>>;

const PendingContext = createContext(false);

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  pendingText,
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
  pendingText?: string;
  name?: string;
  value?: string;
}) {
  const status = useFormStatus();
  const ctxPending = useContext(PendingContext);
  const pending = status.pending || ctxPending;
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={clsx(btnClass(variant, size), className)}>
      {pending && <Spinner />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden />;
}

export function FormMessage({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (state.ok && !state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={clsx("text-sm", state.ok ? "text-ok" : "text-red-hot")}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

/** A form bound to a server action, with pending state and error/success display. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult<unknown> | null, FormData>(async (_prev, fd) => {
    const r = await action(fd);
    // Toast here rather than in an effect: the form may unmount once the page refreshes.
    if (r?.ok && r.message) toast(r.message);
    return r;
  }, null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    // Submitting via onSubmit (not the `action` prop) stops React from resetting
    // the form, so users keep their input when the server rejects it.
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      <div className="mt-2 empty:hidden">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/**
 * Button that opens a confirmation dialog before running a server action.
 * Use for cancellations, disputes, refunds and other consequential actions.
 */
export function ConfirmAction({
  action,
  label,
  title,
  body,
  confirmLabel = "Confirm",
  variant = "danger",
  size = "md",
  hidden,
  reason,
  reasonLabel = "Reason",
  reasonRequired,
  children,
}: {
  action: FormAction;
  label: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  hidden?: Record<string, string>;
  reason?: boolean;
  reasonLabel?: string;
  reasonRequired?: boolean;
  children?: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0);
  return (
    <>
      <button type="button" className={btnClass(variant, size)} onClick={() => { setKey((k) => k + 1); dialog.current?.showModal(); }}>
        {label}
      </button>
      <dialog
        ref={dialog}
        className="m-auto w-[min(92vw,480px)] rounded-xl border border-line bg-panel p-0 text-text shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
        onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}
      >
        <ActionForm key={key} action={action} className="p-5" onSuccess={() => dialog.current?.close()}>
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          {body && <div className="mt-2 space-y-2 text-sm text-muted">{body}</div>}
          {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {children}
          {reason && (
            <div className="mt-4">
              <label className="label" htmlFor="reason">{reasonLabel}</label>
              <textarea id="reason" name="reason" rows={3} required={reasonRequired} className="input" />
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={btnClass("ghost")} onClick={() => dialog.current?.close()}>
              Go back
            </button>
            <SubmitButton variant={variant === "danger" ? "primary" : variant}>{confirmLabel}</SubmitButton>
          </div>
        </ActionForm>
      </dialog>
    </>
  );
}

export function CheckboxGroup({
  name,
  options,
  defaultValue = [],
  columns = 2,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string[];
  columns?: number;
}) {
  return (
    <div className={clsx("grid gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3", columns === 4 && "grid-cols-2 sm:grid-cols-4")}>
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-ink px-3 py-2 text-sm transition-colors has-[:checked]:border-red/60 has-[:checked]:bg-red/5 hover:border-line-strong">
          <input type="checkbox" name={name} value={o.value} defaultChecked={defaultValue.includes(o.value)} className="accent-[#E50914]" />
          {o.label}
        </label>
      ))}
    </div>
  );
}
