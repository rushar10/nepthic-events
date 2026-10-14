const TONE: Record<string, "ok" | "warn" | "bad" | "info" | ""> = {
  // business
  PENDING: "warn", APPROVED: "ok", REJECTED: "bad",
  // quote
  REQUESTED: "warn", QUOTED: "info", ANSWERED: "ok", DECLINED: "bad", CONVERTED: "ok",
  // order
  AWAITING_PAYMENT: "warn", DEPOSIT_PAID: "warn", BALANCE_REQUESTED: "warn", PAID: "ok", CANCELLED: "bad",
  UNFULFILLED: "", IN_PRODUCTION: "info", SHIPPED: "info", DELIVERED: "ok",
  // returns / refunds
  COMPLETED: "ok",
  // payments
  SUCCEEDED: "ok", FAILED: "bad",
  // events / tickets
  DRAFT: "", PUBLISHED: "ok", VALID: "ok", USED: "info", REFUND_REQUESTED: "warn", REFUNDED: "bad", VOID: "bad",
};

const LABEL: Record<string, string> = {
  AWAITING_PAYMENT: "Awaiting payment", DEPOSIT_PAID: "Deposit paid", BALANCE_REQUESTED: "Balance requested",
  PAID: "Paid in full", IN_PRODUCTION: "In production", USED: "Checked in", REFUND_REQUESTED: "Refund pending",
  PUBLISHED: "On sale", PENDING: "Pending review",
};

export function Status({ value, label }: { value: string; label?: string }) {
  const text = label ?? LABEL[value] ?? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
  return <span className={`pill ${TONE[value] ?? ""}`}>{text}</span>;
}
