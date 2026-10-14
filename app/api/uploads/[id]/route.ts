import { serveUpload } from "@/core/uploads";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return serveUpload((await params).id);
}
