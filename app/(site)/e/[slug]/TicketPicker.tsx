"use client";
import { useState } from "react";
import Link from "next/link";
import { ActionForm, Submit } from "@/ui/Forms";
import { aud } from "@/ui/format";
import { startTicketCheckout } from "@/app/actions/tickets";

type T = { id: string; name: string; priceCents: number; left: number };

/* Two short steps with a sticky Continue / Pay bar:
   1. choose tickets  2. confirm the name on tickets → Stripe Checkout (card, Apple Pay, Google Pay). */
export function TicketPicker({ eventId, types, signedIn, defaultName, email, loginHref, max, refundHours }: {
  eventId: string; types: T[]; signedIn: boolean; defaultName: string; email: string; loginHref: string; max: number; refundHours: number;
}) {
  const [q, setQ] = useState<Record<string, number>>({});
  const [step, setStep] = useState<0 | 1>(0);
  const count = Object.values(q).reduce((a, b) => a + b, 0);
  const total = types.reduce((a, t) => a + (q[t.id] ?? 0) * t.priceCents, 0);
  const bump = (t: T, d: number) => {
    const cur = q[t.id] ?? 0;
    if (d > 0 && (count >= max || cur >= t.left)) return;
    setQ({ ...q, [t.id]: Math.max(0, cur + d) });
  };

  return (
    <ActionForm action={startTicketCheckout} className="stack-sm">
      <input type="hidden" name="eventId" value={eventId} />
      {types.map((t) => <input key={t.id} type="hidden" name={`qty_${t.id}`} value={q[t.id] ?? 0} />)}
      <div className="steps" aria-hidden="true"><span className="on" /><span className={step === 1 ? "on" : ""} /></div>

      <div hidden={step !== 0} className="stack-sm">
        <h2 className="h3">Choose tickets</h2>
        {types.map((t) => {
          const n = q[t.id] ?? 0;
          return (
            <div className="ttype prox" key={t.id}>
              <div>
                <b>{t.name}</b>
                <div className="small dim"><span className="mono">{aud(t.priceCents)}</span> · {t.left > 0 ? (t.left < 25 ? `Only ${t.left} left` : `${t.left} left`) : "Sold out"}</div>
              </div>
              {t.left > 0 ? (
                <div className="stepper">
                  <button type="button" onClick={() => bump(t, -1)} aria-label={`One fewer ${t.name}`} disabled={n === 0}>−</button>
                  <output aria-live="polite">{n}</output>
                  <button type="button" onClick={() => bump(t, 1)} aria-label={`One more ${t.name}`}>+</button>
                </div>
              ) : <span className="pill bad">Sold out</span>}
            </div>
          );
        })}
        <p className="dim small">Up to {max} per order. Seats are held for 30 minutes while you pay. Refund requests close {refundHours} hours before doors and are only issued once Nepthic approves them.</p>
      </div>

      {signedIn && (
        <div hidden={step !== 1} className="stack-sm">
          <h2 className="h3">Who&apos;s going?</h2>
          <label className="f">Name on tickets<input type="text" name="buyerName" defaultValue={defaultName} autoComplete="name" autoCapitalize="words" enterKeyHint="go" required /></label>
          <p className="small dim">E-tickets go to {email} and appear in My tickets. Pay by card, Apple Pay or Google Pay on the next screen.</p>
          <ul className="small" style={{ margin: 0, paddingLeft: "1.2em" }}>
            {types.filter((t) => q[t.id]).map((t) => <li key={t.id}>{q[t.id]} × {t.name} · {aud(t.priceCents * q[t.id])}</li>)}
          </ul>
        </div>
      )}

      <div className="pinbar">
        <div className="total"><span className="small dim">{count} ticket{count === 1 ? "" : "s"}</span><b>{aud(total)}</b></div>
        {!signedIn ? (
          <Link className="btn btn-primary prox" href={loginHref}>Sign in to buy</Link>
        ) : step === 0 ? (
          <button type="button" className="btn btn-primary prox" disabled={count === 0} onClick={() => setStep(1)}>Continue</button>
        ) : (
          <span className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
            <Submit pendingText="Holding seats…">Pay {aud(total)}</Submit>
          </span>
        )}
      </div>
    </ActionForm>
  );
}
