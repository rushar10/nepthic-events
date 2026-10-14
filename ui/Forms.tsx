"use client";
import { createContext, startTransition, useActionState, useContext, type FormEvent, type ReactNode } from "react";

export type FormState = { error?: string; ok?: string } | undefined;

const Pending = createContext(false);

/**
 * A form bound to a server action that returns { error } or { ok } (or redirects).
 * Submits manually instead of through <form action>, so React doesn't clear what the
 * person typed when the server sends back an error.
 */
export function ActionForm({ action, children, className, id, onDone }: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  id?: string;
  onDone?: (state: FormState) => void;
}) {
  const [state, dispatch, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const next = await action(prev, fd);
    onDone?.(next);
    return next;
  }, undefined);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  };

  return (
    <Pending.Provider value={pending}>
      <form onSubmit={submit} className={className} id={id} encType="multipart/form-data" noValidate={false}>
        {children}
        {state?.error && <p className="note bad" role="alert">{state.error}</p>}
        {state?.ok && <p className="note ok" role="status">{state.ok}</p>}
      </form>
    </Pending.Provider>
  );
}

export function usePending() {
  return useContext(Pending);
}

export function Submit({ children, className = "btn btn-primary prox", pendingText, name, value, disabled, swipe }: {
  children: ReactNode; className?: string; pendingText?: string; name?: string; value?: string; disabled?: boolean;
  /** marks this button as the target of a Swipeable left/right gesture */
  swipe?: "approve" | "reject";
}) {
  const pending = useContext(Pending);
  return (
    <button className={className} disabled={pending || disabled} aria-busy={pending} name={name} value={value} data-swipe={swipe}>
      {pending ? pendingText ?? "Working…" : children}
    </button>
  );
}
