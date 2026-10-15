import { Resend } from "resend";
import { db, emailLog } from "@/db";
import { env } from "./env";
import { aud } from "@/ui/format";

/* Every email is logged to EmailLog. With RESEND_API_KEY set it is also sent. */

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

type Attachment = { filename: string; content: Buffer };

export async function sendEmail(to: string, subject: string, html: string, attachments?: Attachment[]) {
  await db.insert(emailLog).values({ to, subject, html });
  if (!resend) {
    console.info(`[email] to=${to} subject="${subject}"`);
    return;
  }
  try {
    await resend.emails.send({ from: env.emailFrom, to, subject, html, attachments });
  } catch (e) {
    console.error("[email] send failed", e);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, body: string, cta?: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#0E0B14;font-family:Helvetica,Arial,sans-serif;color:#F4F1FA">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#17131F;border:1px solid #2B2338;border-radius:24px">
  <tr><td style="padding:28px 28px 8px;font-weight:800;letter-spacing:4px;font-size:14px;color:#F4F1FA">NEPTHIC <span style="color:#EC4899;letter-spacing:2px;font-size:11px">EVENTS</span></td></tr>
  <tr><td style="padding:8px 28px 4px;font-size:22px;font-weight:700">${esc(title)}</td></tr>
  <tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.6;color:#A59DB5">${body}
  ${cta ? `<p style="margin:24px 0 0"><a href="${cta.href}" style="background:#EC4899;color:#0E0B14;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">${esc(cta.label)}</a></p>` : ""}
  </td></tr></table></td></tr></table></body></html>`;
}

const p = (s: string) => `<p style="margin:0 0 12px">${s}</p>`;

export const emails = {

  ticketsIssued: (to: string, eventName: string, when: string, codes: string[], pngs: Buffer[]) =>
    sendEmail(to, `Your tickets for ${eventName}`,
      layout(`You're going to ${eventName}`,
        p(when) + p(`Your e-ticket${codes.length > 1 ? "s are" : " is"} attached as QR code images. Show one per person at the door.`) +
          p(codes.map((c) => `<code style="font-size:14px">${c}</code>`).join("<br>")),
        { label: "Open my tickets", href: `${env.siteUrl}/tickets` }),
      pngs.map((content, i) => ({ filename: `${codes[i].replace(/[^A-Za-z0-9-]/g, "-")}.png`, content }))),

  refundRequested: (to: string, n: number, eventName: string) =>
    sendEmail(to, `Refund request RF-${n} received`, layout("Refund request received",
      p(`We've got your refund request for ${esc(eventName)}. Your ticket stays valid until we decide.`))),

  refundDecision: (to: string, n: number, approved: boolean, amountCents: number, note: string) =>
    sendEmail(to, approved ? `Refund RF-${n} approved` : `Refund RF-${n} not approved`,
      layout(approved ? "Refund approved" : "Refund not approved",
        (approved ? p(`We've refunded <b>${aud(amountCents)}</b> to your original payment method. Allow 5–10 business days. The ticket is now cancelled.`) : p("Your ticket is still valid.")) +
          (note ? p(esc(note)) : ""))),
};
