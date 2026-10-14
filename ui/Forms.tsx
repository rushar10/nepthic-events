"use client";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "./ux/toast";
import { haptic } from "./ux/haptics";

export type FormState = { error?: string; ok?: string } | undefined;

type Ctx = { pending: boolean; done: boolean };
const State = createContext<Ctx>({ pending: false, done: false });

/**
 * A form bound to a server action that returns { error } or { ok } (or redirects).
 * - Submits manually instead of through <form action>, so React doesn't clear what the
 *   person typed when the server sends back an error.
 * - `optimistic`: the card shows this result ("Approved") the moment you press the button;
 *   if the server says no, it goes back and a toast explains why.
 * - Success messages appear as a toast; errors stay next to the form, where the fix is.
 * - `persist`: remembers what was typed (this tab only) if you leave and come back.
 */
export function ActionForm({ action, children, className, id, onDone, optimistic, persist, onSend, quiet }: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  id?: string;
  onDone?: (state: FormState) => void;
  optimistic?: string;
  persist?: string;
  /** runs the moment the form is sent, before the server answers (optimistic updates) */
  onSend?: (data: FormData) => void;
  /** don't show the default success toast (the caller shows its own) */
  quiet?: boolean;
}) {
  const [opt, setOpt] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const optLabel = useRef<string | null>(null);
  const [state, dispatch, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    let next: FormState;
    try { next = await action(prev, fd); }
    catch (e) {
      // redirect() and notFound() surface as thrown control-flow errors: let them through
      if (e && typeof e === "object" && "digest" in e) throw e;
      next = { error: "Something went wrong on our side. Nothing was changed. Try again." };
    }
    onDone?.(next);
    return next;
  }, undefined);

  useEffect(() => {
    if (!state) return;
    if (state.error) {
      if (optLabel.current) toast({ message: `Not saved: ${state.error}`, tone: "bad" });
      setOpt(null); optLabel.current = null;
      haptic("error");
    } else if (state.ok) {
      if (!quiet) toast({ message: state.ok, tone: "ok" });
      haptic("success");
      setDone(true);
      const t = setTimeout(() => setDone(false), 1400);
      return () => clearTimeout(t);
    }
  }, [state, quiet]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    const label = submitter?.dataset.optimistic ?? optimistic ?? null;
    if (label) { setOpt(label); optLabel.current = label; }
    onSend?.(fd);
    startTransition(() => dispatch(fd));
  };

  return (
    <State.Provider value={{ pending, done }}>
      <form onSubmit={submit} method="post" className={className} id={id} encType="multipart/form-data" noValidate={false}
        data-optimistic={opt ? "on" : optimistic ? "off" : undefined} data-persist={persist}>
        {opt && <span className="pill ok opt-badge" role="status">{opt}</span>}
        {children}
        {state?.error && <p className="note bad" role="alert">{state.error}</p>}
      </form>
    </State.Provider>
  );
}

export function usePending() {
  return useContext(State).pending;
}

/** Submit button: a spinner inside while working, then a check for a moment when it worked. */
export function Submit({ children, className = "btn btn-primary prox", pendingText, name, value, disabled, swipe, optimistic }: {
  children: ReactNode; className?: string; pendingText?: string; name?: string; value?: string; disabled?: boolean;
  /** marks this button as the target of a Swipeable left/right gesture */
  swipe?: "approve" | "reject";
  /** result to show on the card immediately when this button is pressed (e.g. "Approved") */
  optimistic?: string;
}) {
  const { pending, done } = useContext(State);
  return (
    <button className={className} disabled={pending || disabled} aria-busy={pending} name={name} value={value} data-swipe={swipe}
      data-optimistic={optimistic} data-state={pending ? "pending" : done ? "done" : undefined}>
      {pending ? <span className="sr-only">{pendingText ?? "Working…"}</span> : null}
      {pending ? children : done ? <span className="ux-check" aria-label="Done"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg></span> : children}
    </button>
  );
}
