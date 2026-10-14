import type { ZodError } from "zod";

export type FormState = { error?: string; ok?: string } | undefined;

/** First readable message from a zod error. */
export const zodMessage = (e: ZodError) => e.issues[0]?.message ?? "Please check the form.";

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const int = (fd: FormData, k: string) => {
  const n = parseInt(String(fd.get(k) ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
};
/** Dollars typed in a form ("1,234.50") to integer cents. */
export const cents = (fd: FormData, k: string) => {
  const n = parseFloat(String(fd.get(k) ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
