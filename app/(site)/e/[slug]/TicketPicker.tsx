"use client";
import { useState } from "react";
import Link from "next/link";
import { ActionForm, Submit } from "@/ui/Forms";
import { aud } from "@/ui/format";
import { startTicketCheckout } from "@/app/actions/tickets";

type T = { id: string; name: string; priceCents: number; left: number };

/* Two short steps with a sticky Continue / Pay bar:
   1. choose tickets  2. confirm the name on tickets → Stripe Checkout (card, Apple Pay, Google Pay). */
type Format = "ETICKET" | "PHYSICAL" | "BOTH";
const FORMAT_LABEL: Record<Format, [string, string]> = {
  ETICKET: ["E-ticket", "QR code in My tickets and by email. Ready straight away."],
  PHYSICAL: ["Physical ticket", "A printed ticket with a QR code, collected or posted."],
  BOTH: ["Both", "E-ticket now plus a printed keepsake. They share one QR: whichever is scanned first gets in."],
};

export function TicketPicker({ eventId, types, signedIn, defaultName, email, loginHref, max, refundHours, formats, postAllowed, postFeeCents, referral }: {
  eventId: string; types: T[]; signedIn: boolean; defaultName: string; email: string; loginHref: string; max: number; refundHours: number;
  formats: Format[]; postAllowed: boolean; postFeeCents: number; referral: { name: string } | null;
}) {
  const [q, setQ] = useState<Record<string, number>>({});
  const [step, setStep] = useState<0 | 1>(0);
  const [format, setFormat] = useState<Format>(formats.includes("ETICKET") ? "ETICKET" : formats[0]);
  const [delivery, setDelivery] = useState<"PICKUP" | "POST">("PICKUP");
  const count = Object.values(q).reduce((a, b) => a + b, 0);
  const fee = format !== "ETICKET" && delivery === "POST" ? postFeeCents : 0;
  const total = types.reduce((a, t) => a + (q[t.id] ?? 0) * t.priceCents, 0) + (count ? fee : 0);
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
          {formats.length > 1 && (
            <fieldset className="choice-group">
              <legend className="small">Ticket format</legend>
              {formats.map((f) => (
                <label key={f} className={`choice prox${format === f ? " on" : ""}`}>
                  <input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} />
                  <span><b>{FORMAT_LABEL[f][0]}</b><span className="small dim">{FORMAT_LABEL[f][1]}</span></span>
                </label>
              ))}
            </fieldset>
          )}
          {formats.length === 1 && <input type="hidden" name="format" value={format} />}
          {format !== "ETICKET" && (
            <fieldset className="choice-group">
              <legend className="small">Getting your printed tickets</legend>
              <label className={`choice prox${delivery === "PICKUP" ? " on" : ""}`}>
                <input type="radio" name="delivery" value="PICKUP" checked={delivery === "PICKUP"} onChange={() => setDelivery("PICKUP")} />
                <span><b>Pick up at the box office · free</b><span className="small dim">From the venue box office on the night, with photo ID and your order number.</span></span>
              </label>
              <label className={`choice prox${delivery === "POST" ? " on" : ""}${postAllowed ? "" : " off"}`}>
                <input type="radio" name="delivery" value="POST" checked={delivery === "POST"} disabled={!postAllowed} onChange={() => setDelivery("POST")} />
                <span><b>Tracked post · {aud(postFeeCents)}</b><span className="small dim">{postAllowed ? "Posted within 2 business days with a tracking number." : "Posting has closed for this event (7 days before)."}</span></span>
              </label>
              {delivery === "POST" && <label className="f">Postal address<textarea name="shipTo" rows={3} autoComplete="street-address" required placeholder="Name, street, suburb, state, postcode" /></label>}
            </fieldset>
          )}
          <details className="small">
            <summary style={{ cursor: "pointer" }}>{referral ? `Bought through ${referral.name}` : "Have a partner code?"}</summary>
            <label className="f" style={{ marginTop: 8 }}>Partner code<input type="text" name="partnerCode" autoCapitalize="none" spellCheck={false} placeholder={referral ? "Leave blank to keep this partner" : "e.g. tktek-3f9a2b"} /></label>
          </details>
          <p className="small dim">{format === "PHYSICAL" ? `Your order confirmation goes to ${email}.` : `E-tickets go to ${email} and appear in My tickets.`} Pay by card, Apple Pay or Google Pay on the next screen.</p>
          <ul className="small" style={{ margin: 0, paddingLeft: "1.2em" }}>
            {types.filter((t) => q[t.id]).map((t) => <li key={t.id}>{q[t.id]} × {t.name} · {aud(t.priceCents * q[t.id])}</li>)}
            {fee > 0 && <li>Tracked post · {aud(fee)}</li>}
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
