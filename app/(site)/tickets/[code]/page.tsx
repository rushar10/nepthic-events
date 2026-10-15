import Link from "next/link";
import { notFound } from "next/navigation";
import { db, desc, eq, refundRequests, tickets } from "@/db";
import { requireUser } from "@/core/auth";
import { getSettings } from "@/core/settings";
import { qrDataUrl } from "@/core/tickets";
import { renderTicket } from "@/core/ticket-templates";
import { aud, dateLong, dateShort, refundNo, time } from "@/ui/format";
import { Status } from "@/ui/Status";
import { ActionForm, Submit } from "@/ui/Forms";
import { requestRefund } from "@/app/actions/tickets";
import { walletConfig } from "@/core/wallet";
import { Icon } from "@/ui/Icons";
import { FullScreenTicket } from "./FullScreenTicket";

export const metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireUser(undefined, `/login?next=/tickets/${code}`);
  const t = await db.query.tickets.findFirst({
    where: eq(tickets.code, decodeURIComponent(code)),
    with: { ticketOrder: true, ticketType: true, event: true, refundRequests: { orderBy: desc(refundRequests.createdAt) } },
  });
  if (!t || t.ticketOrder.userId !== user.id) notFound();
  const settings = await getSettings();
  const dead = t.status === "REFUNDED" || t.status === "VOID";
  const qr = dead ? null : await qrDataUrl(t.code, 480);
  const design = await renderTicket(t);
  const cutoff = new Date(t.event.startsAt.getTime() - settings.ticketRefundCutoffHours * 3600e3);
  const canRefund = t.status === "VALID" && new Date() < cutoff;
  const latest = t.refundRequests[0];

  return (
    <div className="split" style={{ alignItems: "start" }}>
      <div className="stack">
        <Link className="btn btn-ghost btn-sm" href="/tickets" style={{ justifySelf: "start" }}>← My tickets</Link>
        {/* The ticket in its event's design (made in the Admin Portal). Rendered on the server from our own
            template renderer, which escapes every value; the QR always sits on a white panel so it scans. */}
        <div className="ticket-design" dangerouslySetInnerHTML={{ __html: design }} />
        <div className="row">
          <a className="btn prox" href={`/tickets/${encodeURIComponent(t.code)}/download`} download><Icon name="arrow" /> Download ticket</a>
        </div>
        {qr && (
          <div className="row">
            <FullScreenTicket qr={qr} code={t.code} eventName={t.event.name} holder={t.holderName} typeName={t.ticketType.name} />
            {walletConfig.apple && <a className="btn prox" href={`/api/wallet/apple/${t.code}`}><Icon name="wallet" /> Add to Apple Wallet</a>}
            {walletConfig.google && <a className="btn prox" href={`/api/wallet/google/${t.code}`}><Icon name="wallet" /> Save to Google Wallet</a>}
          </div>
        )}
        <p className="dim small">This ticket is saved on this phone, so it opens without signal once you&apos;ve viewed it. Each code admits one person, once.</p>
      </div>
      <div className="stack">
        <div className="spread"><h1 className="page">{t.event.name}</h1><Status value={t.status} /></div>
        <dl className="kv">
          <div><dt>Date</dt><dd>{dateLong(t.event.startsAt)}</dd></div>
          <div><dt>Doors</dt><dd>{time(t.event.startsAt)}</dd></div>
          <div><dt>Venue</dt><dd>{t.event.venue}, {t.event.city}</dd></div>
          <div><dt>Ticket</dt><dd>{t.ticketType.name} · {aud(t.ticketType.priceCents)}</dd></div>
          <div><dt>Name</dt><dd>{t.holderName}</dd></div>
        </dl>
        {latest && (
          <div className={`note ${latest.status === "APPROVED" ? "ok" : latest.status === "REJECTED" ? "bad" : "warn"}`}>
            Refund request {refundNo(latest.number)} · {latest.status === "PENDING" ? "waiting for review" : latest.status.toLowerCase()} · {dateShort(latest.createdAt)}
            {latest.decisionNote ? ` — ${latest.decisionNote}` : ""}
          </div>
        )}
        {canRefund && (
          <ActionForm action={requestRefund} className="panel prox">
            <input type="hidden" name="code" value={t.code} />
            <h2 className="h3">Request a refund</h2>
            <p className="dim small">Refunds are only issued after our team approves them. Your ticket stays valid until then. Requests close {dateShort(cutoff)} at {time(cutoff)}.</p>
            <label className="f">Reason
              <select name="reason" defaultValue="">
                <option value="" disabled>Choose a reason</option>
                <option>Can no longer attend</option>
                <option>Bought the wrong ticket type</option>
                <option>Event details changed</option>
                <option>Other</option>
              </select>
            </label>
            <Submit className="btn prox" pendingText="Sending…">Send refund request</Submit>
          </ActionForm>
        )}
        {t.status === "VALID" && !canRefund && <p className="dim small">Refund requests for this event have closed.</p>}
      </div>
    </div>
  );
}
