import { handleOp } from "@/core/ops/handler";
import { ops } from "@/core/ops/events";

export const dynamic = "force-dynamic";

/** Admin API: called only by the Nepthic Admin Portal, with a short-lived signed token. */
export async function POST(req: Request, { params }: { params: Promise<{ op: string }> }) {
  return handleOp(req, (await params).op, ops);
}
