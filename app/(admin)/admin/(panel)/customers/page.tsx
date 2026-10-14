import { and, db, desc, eq, ilike, or, sql, ticketOrders, users } from "@/db";
import { aud, dateShort } from "@/ui/format";
import { guard } from "@/lib/admin/guard";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await guard("customers");
  const { q } = await searchParams;
  const term = q?.trim();
  const list = await db.query.users.findMany({
    where: and(eq(users.role, "CUSTOMER"), term ? or(ilike(users.name, `%${term}%`), ilike(users.email, `%${term}%`)) : undefined),
    orderBy: desc(users.createdAt),
    limit: 200,
    columns: { passwordHash: false },
  });
  const spend = list.length
    ? await db.select({
        userId: ticketOrders.userId,
        n: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${ticketOrders.totalCents}),0)::int`,
      }).from(ticketOrders).where(eq(ticketOrders.status, "PAID")).groupBy(ticketOrders.userId)
    : [];
  const by = new Map(spend.map((s) => [s.userId, s]));

  return (
    <>
      <div className="spread">
        <div><p className="eyebrow">People</p><h1 className="page" style={{ marginTop: 6 }}>Customers</h1>
          <p className="dim small" style={{ marginTop: 6 }}>Ticket buyers with an Events account.</p></div>
        <form className="row" role="search"><input type="search" name="q" defaultValue={q} placeholder="Name or email" aria-label="Search customers" style={{ width: 240 }} /><button className="btn btn-sm">Search</button></form>
      </div>
      <section className="panel prox">
        <div className="scroll"><table className="tbl rtable">
          <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th className="num">Ticket orders</th><th className="num">Event spend</th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b></td>
                <td className="small" data-label="Email">{u.email}</td>
                <td data-label="Joined">{dateShort(u.createdAt)}</td>
                <td className="num" data-label="Orders">{by.get(u.id)?.n ?? 0}</td>
                <td className="num" data-label="Spend">{aud(by.get(u.id)?.cents ?? 0)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="dim">No customers match.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
