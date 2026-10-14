const TZ = "Australia/Brisbane";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const money0 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export const aud = (cents: number) => money.format(cents / 100);
export const aud0 = (cents: number) => money0.format(cents / 100);

export const dateLong = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
export const dateShort = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
export const dayMonth = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", timeZone: TZ }).toUpperCase();
export const time = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: TZ });
export const daysUntil = (d: Date | string) => Math.ceil((new Date(d).getTime() - Date.now()) / 864e5);

export const orderNo = (n: number) => `WO-${n}`;
export const quoteNo = (n: number) => `Q-${n}`;
export const returnNo = (n: number) => `R-${n}`;
export const refundNo = (n: number) => `RF-${n}`;
