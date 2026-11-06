import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { storageGet } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public: the photo of a published Members-page card only.
// ?submitted=1 (admins only): the photo of a card waiting for review.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const submitted = new URL(request.url).searchParams.get("submitted") === "1";
  let key: string | null | undefined;
  if (submitted) {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const { rows } = await pool.query<{ k: string | null }>(`SELECT sub_photo_key AS k FROM member_public_profiles WHERE profile_id = $1`, [id]);
    key = rows[0]?.k;
  } else {
    const { rows } = await pool.query<{ k: string | null }>(
      `SELECT m.pub_photo_key AS k FROM member_public_profiles m JOIN profiles p ON p.id = m.profile_id
       WHERE m.profile_id = $1 AND m.published AND p.status = 'active'`,
      [id],
    );
    key = rows[0]?.k;
  }
  if (!key) return new Response("Not found", { status: 404 });
  const body = await storageGet(key);
  const mime = key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": submitted ? "private, no-store" : "public, max-age=300",
    },
  });
}
