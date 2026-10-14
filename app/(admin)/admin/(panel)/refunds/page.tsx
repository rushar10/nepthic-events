import Link from "next/link";
import { db, desc, refundRequests } from "@/db";
import { aud, dateLong, dateShort, daysUntil, refundNo } from "@/ui/format";
import { Status } from "@/ui/Status";
import { ActionForm, Submit } from "@/ui/Forms";
import { Swipeable } from "@/ui/Mobile";
import { guard } from "@/lib/admin/guard";
import { decideRefund } from "@/lib/admin/actions/events";

export const metadata = { title: "Refund approvals" };

export default async function Refunds({ searchParams }: { searchParams: Promise<{ show?: string; done?: string }> }) {
  const user = await guard("refunds");
  const admin = user.role === "ADMIN";
  const { show, done } = await searchParams;
  const all = await db.query.refundRequests.findMany({
    orderBy: desc(refundRequests.createdAt), limit: 200,
    with: { user: true, ticket: { with: { event: true, ticketType: true } } },
  });
  const list = show === "all" ? all : all.filter((r) => r.status === "PENDING");

  return (
    <>
      <div className="spread">
        <div><p className="eyebrow">Events</p><h1 className="page" style={{ marginTop: 6 }}>Refund approvals</h1></div>
        <nav className="row">
          <Link className="tab" href="/admin/refunds" aria-current={show !== "all" ? "page" : undefined}>Waiting</Link>
          <Link className="tab" href="/admin/refunds?show=all" aria-current={show === "all" ? "page" : undefined}>All</Link>
        </nav>
      </div>
      <p className="dim small">Approving refunds the ticket price to the buyer&apos;s card, cancels the ticket and puts the seat back on sale. Rejecting keeps the ticket valid.</p>
      {done && <p className="note ok" role="status">{done}</p>}
      {list.length === 0 && <div className="empty">No refund requests waiting.</div>}
      <div className="cards">
        {list.map((r) => (
          <Swipeable key={r.id} approveLabel={`Refund ${aud(r.amountCents)}`} rejectLabel="Reject refund">
          <article className={`card prox${r.status === "PENDING" ? " attn" : ""}`}>
            <div className="spread">
              <div className="row"><b className="mono">{refundNo(r.number)}</b><span>{r.user.name}</span><span className="dim small">{r.user.email} · {dateShort(r.createdAt)}</span></div>
              <Status value={r.status} />
            </div>
            <p>{r.ticket.event.name} · {r.ticket.ticketType.name} · <b className="mono">{aud(r.amountCents)}</b></p>
            <p className="small dim">Ticket <span className="mono">{r.ticket.code}</span> · reason: {r.reason} · event {dateLong(r.ticket.event.startsAt)} ({daysUntil(r.ticket.event.startsAt)} days away)</p>
            {r.status === "PENDING" ? (admin ? (
              <ActionForm action={decideRefund} className="stack-sm">
                <input type="hidden" name="refundId" value={r.id} />
                <label className="f">Note to buyer (optional)<input type="text" name="note" /></label>
                <div className="row">
                  <Submit className="btn btn-ok" name="decision" value="APPROVED" swipe="approve" optimistic="Refund approved" pendingText="Refunding…">Approve and refund {aud(r.amountCents)}</Submit>
                  <Submit className="btn btn-bad" name="decision" value="REJECTED" swipe="reject" optimistic="Rejected" pendingText="Saving…">Reject, keep ticket valid</Submit>
                </div>
              </ActionForm>
            ) : <p className="small dim">Waiting for an admin to decide.</p>) : r.decisionNote && <p className="note small">{r.decisionNote}</p>}
          </article>
          </Swipeable>
        ))}
      </div>
    </>
  );
}
