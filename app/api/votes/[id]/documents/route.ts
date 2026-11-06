import { getCurrentUser } from "@/lib/auth";
import { acceptVoteDocumentChunk, VoteDocumentError } from "@/lib/vote-document-store";
import { VOTE_DOCUMENT_CHUNK_BYTES, VOTE_DOCUMENT_MAX_BYTES } from "@/lib/vote-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PRIVATE = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...PRIVATE },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in required." }, 401);
  const { id } = await params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "That upload could not be read." }, 400);
  }
  const chunk = form.get("chunk");
  if (!(chunk instanceof File)) return json({ error: "Choose a document to add." }, 400);
  if (chunk.size > VOTE_DOCUMENT_CHUNK_BYTES) {
    return json({ error: "That part of the upload is too large." }, 400);
  }
  const byteSize = Number(form.get("byteSize"));
  if (!Number.isInteger(byteSize) || byteSize > VOTE_DOCUMENT_MAX_BYTES) {
    return json({ error: `Each document can be up to ${VOTE_DOCUMENT_MAX_BYTES / (1024 * 1024)} MB.` }, 400);
  }
  try {
    const result = await acceptVoteDocumentChunk(user, id, {
      uploadId: String(form.get("uploadId") || ""),
      chunkIndex: Number(form.get("chunkIndex")),
      chunkCount: Number(form.get("chunkCount")),
      filename: String(form.get("filename") || ""),
      byteSize,
      bytes: new Uint8Array(await chunk.arrayBuffer()),
    });
    return json(result, 200);
  } catch (error) {
    if (error instanceof VoteDocumentError) return json({ error: error.message }, error.status);
    console.error("[vote-documents] upload failed", error instanceof Error ? error.message.split("\n")[0] : error);
    return json({ error: "The document could not be added." }, 500);
  }
}
