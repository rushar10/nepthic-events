import Link from "next/link";
import { PullToRefresh } from "@/ui/ux/PullToRefresh";
import { Icon } from "@/ui/Icons";
import { aud0 } from "@/ui/format";
import { guard } from "@/lib/admin/guard";
import { approvals, changePct, monthlyRevenue, nextEvent, recentActivity, revenueByEvent, salesToday, week } from "@/lib/admin/dashboard";
import { Card, Change, StatCard, accentVars } from "@/components/admin/dash/Card";
import { BarChart } from "@/components/admin/dash/BarChart";
import { DonutChart } from "@/components/admin/dash/DonutChart";
import { ActivityList } from "@/components/admin/dash/ActivityList";
import { Sparkline } from "@/components/admin/dash/Sparkline";

export const metadata = { title: "Overview" };

const EV = "var(--ev)";
const SEGMENT_COLOURS = ["#EC4899", "#8B5CF6", "#F9A8D4", "#6E6680"];

export default async function Overview() {
  await guard("overview");
  const [months, byEvent, wk, next, activity, today, appr] = await Promise.all([
    monthlyRevenue(), revenueByEvent(30), week(), nextEvent(), recentActivity(), salesToday(), approvals(),
  ]);
  const bars = months.map((m) => ({ key: m.key, label: m.label, long: m.long, value: m.value }));
  const thisMonth = bars[bars.length - 1].value, lastMonth = bars[bars.length - 2].value;
  const segments = byEvent.map((e, i) => ({ key: e.label, label: e.label, color: SEGMENT_COLOURS[i] ?? "#6E6680", value: e.value }));

  return (
    <PullToRefresh>
      <div className="dash-head"><h1>Events Dashboard</h1></div>
      <div className="dash-grid">
        <div className="dash-main">
          <Card className="o-flow" title="Revenue Flow" id="t-flow" accent={EV}
            action={<Link className="more" href="/admin/payments">View All <span aria-hidden="true">›</span></Link>}>
            <div className="stat-foot" style={{ marginTop: -6 }}>
              <span className="big" style={{ fontSize: "1.6rem", color: "var(--fg)" }}>{aud0(thisMonth)}</span>
              <Change pct={changePct(thisMonth, lastMonth)} />
              <span>ticket revenue this month vs last</span>
            </div>
            <BarChart data={bars} color={EV} label="Monthly net ticket revenue, last 12 months. Use tab to read each month." />
          </Card>
          <div className="dash-row">
            <Card className="o-donut" title="Revenue by Event" id="t-ev" action={<span className="small dim">Last 30 days</span>}>
              {segments.length ? <DonutChart segments={segments} /> : <p className="muted">No ticket sales in the last 30 days.</p>}
            </Card>
            <div className="dash-stack o-stats">
              <StatCard label="Ticket orders" icon="bag" accent={EV} href="/admin/payments" value={wk.orders.now.toLocaleString("en-AU")}
                pct={changePct(wk.orders.now, wk.orders.prev)} note="paid orders · 7 days" />
              <StatCard label="Ticket Sales" icon="ticket" accent={EV} href="/admin/events" value={wk.tickets.now.toLocaleString("en-AU")}
                pct={changePct(wk.tickets.now, wk.tickets.prev)} note="tickets sold · 7 days" />
            </div>
          </div>
        </div>

        <div className="dash-side">
          <section className="stack-card o-next" aria-labelledby="t-next">
            <div className="ev-top" data-glow style={accentVars("brand")}>
              {next ? (
                <>
                  <div className="row1">
                    <div>
                      <span className="kicker" id="t-next">Next Event · in {Math.max(0, Math.ceil((next.startsAt.getTime() - Date.now()) / 864e5))} days</span>
                      <h3>{next.name}</h3>
                    </div>
                    <Link className="ev-plus" href="/admin/events/new" aria-label="Create a new event"><Icon name="plus" size={20} /></Link>
                  </div>
                  <span className="meta">{next.startsAt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", timeZone: "Australia/Brisbane" })} · {next.venue}, {next.city}</span>
                  <div className="ev-progress" role="progressbar" aria-label="Tickets sold" aria-valuemin={0} aria-valuemax={next.capacity} aria-valuenow={next.sold} style={{ ["--p" as string]: next.capacity ? next.sold / next.capacity : 0 }}><i /></div>
                  <div className="ev-nums"><span>{next.sold.toLocaleString("en-AU")} sold</span><span>{next.capacity.toLocaleString("en-AU")} capacity</span></div>
                  <Link href={`/admin/events/${next.id}`} style={{ color: "#fff", fontWeight: 700, fontSize: ".88rem" }}>Open event <span aria-hidden="true">›</span></Link>
                </>
              ) : (
                <div className="row1">
                  <div><span className="kicker" id="t-next">Next Event</span><h3>No upcoming events</h3></div>
                  <Link className="ev-plus" href="/admin/events/new" aria-label="Create a new event"><Icon name="plus" size={20} /></Link>
                </div>
              )}
            </div>
          </section>

          <Card className="o-act" title="Recent Activity" id="t-act" action={<Link className="more" href="/admin/payments">View All <span aria-hidden="true">›</span></Link>}>
            <ActivityList items={activity.map((a) => ({ ...a, icon: a.kind === "refund" ? "undo" : "ticket", color: a.kind === "refund" ? "var(--warn)" : EV, label: a.kind === "refund" ? "Refund request" : "Ticket order" }))} />
          </Card>

          <div className="dash-pair">
            <Card className="o-appr" title="Pending Approvals" id="t-appr">
              <ul className="appr"><li><span>Refund requests</span><b className={appr.refunds ? "has" : undefined}>{appr.refunds}</b></li></ul>
              <Link className="btn-pill" href="/admin/refunds">Review{appr.refunds ? ` ${appr.refunds}` : ""}</Link>
            </Card>
            <Card className="o-live" title="Live Sales" id="t-live" accent={EV}>
              <div>
                <span className="big" style={{ fontSize: "1.5rem" }}>{aud0(today.total)}</span>
                <div className="small muted">today{today.yesterday ? ` · ${aud0(today.yesterday)} by now yesterday` : ""}</div>
              </div>
              <Sparkline values={today.hours} label={`Ticket sales today by hour: ${aud0(today.total)} so far`} />
            </Card>
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}
