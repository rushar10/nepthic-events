const isProd = process.env.NODE_ENV === "production";

function secret(name: string, devFallback: string) {
  const v = process.env[name];
  if (v) return v;
  if (isProd && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error(`${name} must be set in production`);
  }
  return devFallback;
}

export const env = {
  /** The Nepthic Admin Portal (server-side only: team alert emails and the admin preview bar). */
  portalUrl: (process.env.PORTAL_URL ?? "").replace(/\/$/, ""),
  /** This site's own address (emails, Stripe redirects, wallet passes). */
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002").replace(/\/$/, ""),
  /** Where the Nepthic logo points: "/" (this site's home) unless set to the gateway. */
  logoHref: process.env.NEXT_PUBLIC_LOGO_HREF || "/",
  paymentsMode: ((process.env.PAYMENTS_MODE as "mock" | "stripe" | undefined) ??
    (process.env.STRIPE_SECRET_KEY ? "stripe" : "mock")) as "mock" | "stripe",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  get ticketSecret() {
    return secret("TICKET_SIGNING_SECRET", "dev-only-ticket-secret");
  },
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Nepthic Events <events@nepthic.com>",
  adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL ?? "",
};

