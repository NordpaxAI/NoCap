import { loadMemberAttachment, PRIVATE_FILE_HEADERS } from "@/lib/attachment-access";
import { storageGet } from "@/lib/storage";
import { contentDisposition, extensionForMime, inspectVoteDocument, previewKind } from "@/lib/vote-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadMemberAttachment(id);
  if (loaded instanceof Response) return loaded;
  const kind = previewKind(loaded.mime_type);
  if (kind === "download") return refuse();
  let body: Buffer;
  try {
    body = await storageGet(loaded.storage_key);
  } catch {
    return new Response("Not found", { status: 404, headers: PRIVATE_FILE_HEADERS });
  }
  const bytes = new Uint8Array(body);
  let sniffed = inspectVoteDocument(loaded.filename, loaded.mime_type, bytes);
  if (!sniffed.ok) {
    const implied = extensionForMime(loaded.mime_type);
    if (implied) sniffed = inspectVoteDocument(`document.${implied}`, loaded.mime_type, bytes);
  }
  if (!sniffed.ok || sniffed.document.preview === "download" || sniffed.document.preview !== kind) return refuse();
  const mime = kind === "text" ? "text/plain; charset=utf-8" : sniffed.document.mime;
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Content-Disposition": contentDisposition("inline", loaded.filename),
    ...PRIVATE_FILE_HEADERS,
  };
  if (kind === "text") headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
  return new Response(new Uint8Array(body), { headers });
}

function refuse(): Response {
  return new Response("This file cannot be previewed in the browser. Use the download link.", {
    status: 415,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "inline",
      ...PRIVATE_FILE_HEADERS,
    },
  });
}
