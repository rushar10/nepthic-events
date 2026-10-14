import Link from "next/link";
import { and, db, desc, eq, isNotNull, payments, type PaymentKind } from "@/db";
import { env } from "@/core/env";
import { aud, dateShort, time } from "@/ui/format";
import { guard } from "@/lib/admin/guard";

export const metadata = { title: "Payments" };

const KINDS: (PaymentKind | "ALL")[] = ["ALL", "TICKET", "REFUND"];
const label = (k: string) => ({ ALL: "All", TICKET: "Tickets", REFUND: "Refunds" })[k] ?? k;

export default async function Payments({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await guard("payments");
  const { kind } = await searchParams;
  const k = KINDS.find((x) => x === kind) ?? "ALL";
  const list = await db.query.payments.findMany({
    where: and(eq(payments.status, "SUCCEEDED"), isNotNull(payments.paidAt), k === "ALL" ? undefined : eq(payments.kind, k)),
    orderBy: desc(payments.paidAt),
    limit: 300,
  });
  const net = list.reduce((a, p) => a + p.amountCents, 0);

  return (
    <>
      <div className="spread">
        <div><p className="eyebrow">Money</p><h1 className="page" style={{ marginTop: 6 }}>Payments</h1></div>
        <span className="dim small">Net shown: <b className="mono">{aud(net)}</b></span>
      </div>
      <nav className="chips" aria-label="Payment type">
        {KINDS.map((x) => <Link key={x} className="tab" href={x === "ALL" ? "/admin/payments" : `/admin/payments?kind=${x}`} aria-current={k === x ? "page" : undefined}>{label(x)}</Link>)}
      </nav>
      <section className="panel prox">
        <div className="scroll"><table className="tbl rtable">
          <thead><tr><th>When</th><th>Type</th><th>Description</th><th>Reference</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td className="small">{dateShort(p.paidAt!)} {time(p.paidAt!)}</td>
                <td data-label="Type"><span className={`pill ${p.kind === "REFUND" ? "bad" : "ok"}`}>{label(p.kind)}</span></td>
                <td data-label="For">{p.description}</td>
                <td className="mono small dim" data-label="Ref">{p.stripeRefundId ?? p.stripePaymentIntentId ?? "—"}</td>
                <td className="num" data-label="Amount" style={{ color: p.amountCents < 0 ? "var(--bad)" : undefined }}>{aud(p.amountCents)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="dim">No payments yet.</td></tr>}
          </tbody>
        </table></div>
        <p className="small dim">
          {env.paymentsMode === "mock" ? "Payments are in mock mode: nothing is charged. Set PAYMENTS_MODE=stripe and your Stripe keys to take real payments." : "Refunds appear here only after an admin approves them. Payouts and fees are in your Stripe dashboard."}
        </p>
      </section>
    </>
  );
}
