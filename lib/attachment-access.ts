import { getCurrentUser } from "./auth";
import { pool } from "./db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PRIVATE_FILE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export type StoredAttachment = {
  storage_key: string;
  filename: string;
  mime_type: string;
};

// Same gate as the vote attachment download: an active member session.
// Storage keys stay on the server. There is no public object URL.
export async function loadMemberAttachment(id: string): Promise<StoredAttachment | Response> {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Sign in required.", { status: 401, headers: PRIVATE_FILE_HEADERS });
  }
  if (!UUID.test(id)) {
    return new Response("Not found", { status: 404, headers: PRIVATE_FILE_HEADERS });
  }
  const { rows } = await pool.query<StoredAttachment>(
    `SELECT storage_key, filename, mime_type FROM attachments WHERE id = $1`,
    [id],
  );
  const file = rows[0];
  if (!file) return new Response("Not found", { status: 404, headers: PRIVATE_FILE_HEADERS });
  return file;
}
