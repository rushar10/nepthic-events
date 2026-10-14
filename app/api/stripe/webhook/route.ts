import { handleStripeWebhook } from "@/core/payments";

export async function POST(req: Request) {
  return handleStripeWebhook(req);
}
