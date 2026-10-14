import { db, desc, inArray, users } from "@/db";
import { getSettings } from "@/core/settings";
import { env } from "@/core/env";
import { ActionForm, Submit } from "@/ui/Forms";
import { guard } from "@/lib/admin/guard";
import { addStaff, saveSettings, setRole } from "@/lib/admin/actions/settings";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const me = await guard("settings");
  const s = await getSettings();
  const staff = await db.query.users.findMany({ where: inArray(users.role, ["ADMIN", "STAFF", "DOOR"]), orderBy: desc(users.createdAt), columns: { passwordHash: false } });

  return (
    <>
      <div><p className="eyebrow">Settings</p><h1 className="page" style={{ marginTop: 6 }}>Events settings</h1></div>

      <ActionForm action={saveSettings} className="stack">
        <section className="panel prox">
          <h2 className="h3">Tickets and refunds</h2>
          <div className="form-grid">
            <label className="f">Refund requests close (hours before doors)<input type="number" name="ticketRefundCutoffHours" min={0} defaultValue={s.ticketRefundCutoffHours} /></label>
            <label className="f">Max tickets per order<input type="number" name="maxTicketsPerOrder" min={1} defaultValue={s.maxTicketsPerOrder} /></label>
          </div>
        </section>
        <section className="panel prox">
          <h2 className="h3">Proximity glow</h2>
          <p className="dim small">Cards and buttons light up as the cursor gets close. Off automatically for touch screens and anyone with reduced motion turned on. Admin runs it at about half strength.</p>
          <div className="form-grid">
            <label className="f">Radius (px)<input type="number" name="proximityRadius" min={20} max={400} defaultValue={s.proximityRadius} /></label>
            <label className="f">Intensity (0–1)<input type="number" name="proximityIntensity" min={0} max={1} step={0.05} defaultValue={s.proximityIntensity} /></label>
          </div>
          <label className="row small"><input type="checkbox" name="proximityEnabled" defaultChecked={s.proximityEnabled} /> Effect on</label>
        </section>
        <Submit pendingText="Saving…">Save settings</Submit>
      </ActionForm>

      <section className="panel prox">
        <h2 className="h3">Staff &amp; roles</h2>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td><td className="small">{u.email}</td>
                <td>{u.id === me.id ? <span className="pill info">{u.role.toLowerCase()} (you)</span> : (
                  <form action={setRole} className="row" style={{ flexWrap: "nowrap" }}>
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`} style={{ width: "auto" }}>
                      <option value="ADMIN">Admin</option><option value="STAFF">Staff</option><option value="DOOR">Door staff</option><option value="CUSTOMER">Remove access</option>
                    </select>
                    <button className="btn btn-sm">Save</button>
                  </form>
                )}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table></div>
        <ActionForm action={addStaff} className="stack-sm">
          <div className="form-grid">
            <label className="f">Name<input type="text" name="name" required /></label>
            <label className="f">Email<input type="email" name="email" required /></label>
            <label className="f">Role<select name="role" defaultValue="STAFF"><option value="STAFF">Staff</option><option value="DOOR">Door staff</option><option value="ADMIN">Admin</option></select></label>
            <label className="f">Temporary password<input type="text" name="password" minLength={10} required autoComplete="off" /></label>
          </div>
          <Submit className="btn prox" pendingText="Adding…">Add staff member</Submit>
        </ActionForm>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Role</th><th>Can see</th><th>Can approve</th></tr></thead>
          <tbody>
            <tr><td><b>Admin</b></td><td>Everything</td><td>Refunds, payments, events, settings, staff</td></tr>
            <tr><td><b>Staff</b></td><td>Overview, events, refund requests, check-in, customers</td><td>Create and edit events and ticket types</td></tr>
            <tr><td><b>Door staff</b></td><td>Check-in stats, and the door scanner at /door</td><td>Admit or turn away at the door</td></tr>
          </tbody>
        </table></div>
      </section>

      <section className="panel prox">
        <h2 className="h3">Connections</h2>
        <dl className="kv">
          <div><dt>Payments</dt><dd>{env.paymentsMode === "stripe" ? "Stripe (live keys from env)" : "Mock mode — nothing is charged"}</dd></div>
          <div><dt>Email</dt><dd>{env.resendApiKey ? `Resend · from ${env.emailFrom}` : "Logged only (no RESEND_API_KEY)"}</dd></div>
          <div><dt>Team alerts</dt><dd>{env.adminNotifyEmail || "Not set (ADMIN_NOTIFY_EMAIL)"}</dd></div>
        </dl>
      </section>
    </>
  );
}
