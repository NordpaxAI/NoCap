import { loadMemberAttachment } from "@/lib/attachment-access";
import { downloadResponse } from "@/lib/export";
import { storageGet } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadMemberAttachment(id);
  if (loaded instanceof Response) return loaded;
  try {
    return downloadResponse(await storageGet(loaded.storage_key), loaded.filename, loaded.mime_type);
  } catch {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
}
