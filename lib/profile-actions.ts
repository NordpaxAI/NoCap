"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "./auth";
import { pool } from "./db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) || "").replace(/\r\n/g, "\n").trim();
}

// The member sends the public card (name, bio, city, country, current photo)
// from their private profile for review. Nothing is published here.
export async function submitPublicProfile() {
  const user = await requireUser();
  const fail = (error: string): never => redirect(`/area/profile?error=${encodeURIComponent(error)}#public`);
  const name = (user.display_name || "").trim();
  const bio = (user.bio || "").trim();
  const city = (user.city || "").trim();
  const country = (user.jurisdiction || "").trim();
  if (!name || !bio || !city || !country) {
    fail("Add your name, short biography, city and country to your profile, save it, then submit it for review.");
  }
  if (bio.length > 1200) fail("The biography is too long for the Members page. Keep it to about 60–100 words.");
  if (!user.photo_key) fail("Add a profile photo first. The Members page shows every member with a photo.");
  await pool.query(
    `INSERT INTO member_public_profiles
       (profile_id, status, sub_name, sub_bio, sub_city, sub_country, sub_photo_key, submitted_at, review_note)
     VALUES ($1, 'submitted', $2, $3, $4, $5, $6, now(), NULL)
     ON CONFLICT (profile_id) DO UPDATE SET
       status = 'submitted', sub_name = EXCLUDED.sub_name, sub_bio = EXCLUDED.sub_bio,
       sub_city = EXCLUDED.sub_city, sub_country = EXCLUDED.sub_country,
       sub_photo_key = EXCLUDED.sub_photo_key, submitted_at = now(), review_note = NULL`,
    [user.id, name, bio, city, country, user.photo_key],
  );
  // Bell notification to active admins (no email).
  await pool.query(
    `INSERT INTO notifications (recipient_id, kind, title, body, href, event_key)
     SELECT p.id, 'public_profile', $1, 'Review it before it appears on the public Members page.',
            '/area/admin/profiles', 'public-profile:' || $2 || ':' || extract(epoch from now())::bigint || ':' || p.id
     FROM profiles p WHERE p.role = 'admin' AND p.status = 'active'
     ON CONFLICT (recipient_id, event_key) DO NOTHING`,
    [`Public profile submitted: ${name}`.slice(0, 200), user.id],
  );
  revalidatePath("/area/profile");
  revalidatePath("/area/admin/profiles");
  redirect("/area/profile?submitted=1#public");
}

export async function reviewPublicProfile(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "profile_id");
  const decision = text(formData, "decision");
  const note = text(formData, "note").slice(0, 1000) || null;
  if (!UUID.test(id)) redirect("/area/admin/profiles");
  if (decision === "approve") {
    await pool.query(
      `UPDATE member_public_profiles SET
         status = 'approved', reviewed_by = $2, reviewed_at = now(), review_note = $3,
         pub_name = sub_name, pub_bio = sub_bio, pub_city = sub_city, pub_country = sub_country,
         pub_photo_key = sub_photo_key, published = true, published_at = now()
       WHERE profile_id = $1 AND status = 'submitted'`,
      [id, admin.id, note],
    );
  } else if (decision === "changes") {
    await pool.query(
      `UPDATE member_public_profiles SET status = 'changes_requested', reviewed_by = $2, reviewed_at = now(), review_note = $3
       WHERE profile_id = $1 AND status = 'submitted'`,
      [id, admin.id, note],
    );
  } else if (decision === "unpublish" || decision === "republish") {
    // Hides or shows the last approved card again. Nothing is deleted.
    await pool.query(
      `UPDATE member_public_profiles SET published = $2, reviewed_by = $3, reviewed_at = now()
       WHERE profile_id = $1 AND pub_name IS NOT NULL`,
      [id, decision === "republish", admin.id],
    );
  } else if (decision === "sort") {
    const sort = Math.max(0, Math.min(10000, Number.parseInt(text(formData, "sort"), 10) || 100));
    await pool.query(`UPDATE member_public_profiles SET sort = $2 WHERE profile_id = $1`, [id, sort]);
  }
  if (decision === "approve" || decision === "changes") {
    const title = decision === "approve" ? "Your profile is on the Members page" : "Your public profile needs a change";
    const body = decision === "approve" ? "An admin approved your public profile." : note || "An admin asked for a change before publishing.";
    await pool.query(
      `INSERT INTO notifications (recipient_id, kind, title, body, href, event_key)
       VALUES ($1, 'public_profile', $2, $3, '/area/profile#public', 'public-profile-review:' || $1 || ':' || extract(epoch from now())::bigint)
       ON CONFLICT (recipient_id, event_key) DO NOTHING`,
      [id, title, body.slice(0, 300)],
    );
  }
  revalidatePath("/members");
  revalidatePath("/area/admin/profiles");
  redirect("/area/admin/profiles");
}
