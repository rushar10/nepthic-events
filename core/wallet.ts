import crypto from "node:crypto";
import sharp from "sharp";
import { PKPass } from "passkit-generator";
import { env } from "./env";
import { ticketPayload } from "./ticket-codes";

/* "Add to Apple Wallet" and "Save to Google Wallet". Each turns on when its
   credentials are set (see .env.example); until then the buttons are hidden.
   Both carry the same signed QR payload the door scanner validates. */

export type WalletTicket = { qrId: string;
  code: string; holderName: string; typeName: string;
  event: { id: string; name: string; venue: string; city: string; startsAt: Date };
};

const pem = (v?: string) => (v ?? "").replace(/\\n/g, "\n");

export const walletConfig = {
  get google() {
    return !!(process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_WALLET_PRIVATE_KEY);
  },
  get apple() {
    return !!(process.env.APPLE_PASS_TYPE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_WWDR_CERT && process.env.APPLE_SIGNER_CERT && process.env.APPLE_SIGNER_KEY);
  },
};

const when = (d: Date) => d.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" });

/** Google Wallet "save" link: a JWT signed with the service account key, no API call needed. */
export function googleWalletUrl(t: WalletTicket) {
  const issuer = process.env.GOOGLE_WALLET_ISSUER_ID!;
  const classId = `${issuer}.nepthic_${t.event.id.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const objectId = `${issuer}.${t.code.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const local = (value: string) => ({ defaultValue: { language: "en-AU", value } });
  const claims = {
    iss: process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL,
    aud: "google",
    typ: "savetowallet",
    origins: [env.siteUrl],
    payload: {
      eventTicketClasses: [{
        id: classId, issuerName: "Nepthic", reviewStatus: "UNDER_REVIEW",
        eventName: local(t.event.name),
        venue: { name: local(t.event.venue), address: local(t.event.city) },
        dateTime: { start: t.event.startsAt.toISOString() },
        hexBackgroundColor: "#0F172A",
      }],
      eventTicketObjects: [{
        id: objectId, classId, state: "ACTIVE",
        ticketHolderName: t.holderName,
        ticketType: local(t.typeName),
        ticketNumber: t.code,
        barcode: { type: "QR_CODE", value: ticketPayload(t.qrId, env.ticketSecret), alternateText: t.code },
      }],
    },
  };
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64(claims)}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(pem(process.env.GOOGLE_WALLET_PRIVATE_KEY), "base64url");
  return `https://pay.google.com/gp/v/save/${unsigned}.${sig}`;
}

async function icon(size: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" rx="${size * 0.22}" fill="#2563EB"/><text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="${size * 0.6}" fill="#FFFFFF">N</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Signed .pkpass for Apple Wallet. Needs a Pass Type ID certificate from Apple. */
export async function applePass(t: WalletTicket) {
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID,
    teamIdentifier: process.env.APPLE_TEAM_ID,
    organizationName: "Nepthic",
    description: `Ticket for ${t.event.name}`,
    serialNumber: t.code,
    backgroundColor: "rgb(15,23,42)",
    foregroundColor: "rgb(241,245,249)",
    labelColor: "rgb(129,140,248)",
    relevantDate: t.event.startsAt.toISOString(),
    eventTicket: {
      primaryFields: [{ key: "event", label: "EVENT", value: t.event.name }],
      secondaryFields: [
        { key: "date", label: "DOORS", value: when(t.event.startsAt) },
        { key: "venue", label: "VENUE", value: t.event.venue },
      ],
      auxiliaryFields: [
        { key: "type", label: "TICKET", value: t.typeName },
        { key: "holder", label: "NAME", value: t.holderName },
      ],
      backFields: [
        { key: "code", label: "Ticket code", value: t.code },
        { key: "rules", label: "Entry", value: "One person, one scan. Refunds only after Nepthic approves a request in your account." },
      ],
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: ticketPayload(t.qrId, env.ticketSecret), messageEncoding: "iso-8859-1", altText: t.code }],
  };
  const pass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(passJson)),
      "icon.png": await icon(29), "icon@2x.png": await icon(58), "icon@3x.png": await icon(87),
      "logo.png": await icon(50), "logo@2x.png": await icon(100),
    },
    {
      wwdr: pem(process.env.APPLE_WWDR_CERT),
      signerCert: pem(process.env.APPLE_SIGNER_CERT),
      signerKey: pem(process.env.APPLE_SIGNER_KEY),
      signerKeyPassphrase: process.env.APPLE_SIGNER_KEY_PASSPHRASE || undefined,
    },
  );
  return pass.getAsBuffer();
}
