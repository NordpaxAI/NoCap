import { ProfileForm } from "@/components/profile-form";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { setEmailNotifications } from "@/lib/actions";
import { submitPublicProfile } from "@/lib/profile-actions";
import { initials, requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export const metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; email?: string; submitted?: string }> }) {
  const user = await requireUser();
  const { error, saved, email, submitted } = await searchParams;
  const { rows: pubRows } = await pool.query<{
    status: string;
    published: boolean;
    review_note: string | null;
    sub_name: string;
    sub_bio: string;
    sub_city: string;
    sub_country: string;
    sub_photo_key: string | null;
  }>(
    `SELECT status, published, review_note, sub_name, sub_bio, sub_city, sub_country, sub_photo_key
     FROM member_public_profiles WHERE profile_id = $1`,
    [user.id],
  );
  const pub = pubRows[0];
  const pubChanged =
    !!pub &&
    (pub.sub_name !== user.display_name ||
      pub.sub_bio !== (user.bio || "") ||
      pub.sub_city !== (user.city || "") ||
      pub.sub_country !== (user.jurisdiction || "") ||
      pub.sub_photo_key !== user.photo_key);
  const { rows } = await pool.query<{ email_notifications: boolean }>(
    `SELECT email_notifications FROM profiles WHERE id = $1`,
    [user.id],
  );
  const emailOn = rows[0]?.email_notifications ?? true;
  return (
    <>
      <h1 className="page-title">Your profile</h1>
      {saved ? <p className="banner">Profile saved.</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="avatar-lg" style={{ marginBottom: 16 }}>
        {user.photo_key ? (
          <img src={`/api/photos/${user.id}?v=${encodeURIComponent(user.photo_key)}`} alt="" />
        ) : (
          initials(user.display_name)
        )}
      </div>
      <ProfileForm
        defaults={{
          display_name: user.display_name,
          public_role: user.public_role || "",
          bio: user.bio || "",
          city: user.city || "",
          jurisdiction: user.jurisdiction || "",
          firm: user.firm || "",
          practice_area: user.practice_area || "",
          contacts: user.contacts || "",
        }}
      />
      <section id="public" style={{ marginTop: 36 }}>
        <h2 className="page-title" style={{ fontSize: "1.4em" }}>Public profile</h2>
        <p className="help">Shown on the Members page after review.</p>
        {submitted ? <p className="banner">Sent for review.</p> : null}
        <p>
          Status:{" "}
          <strong>
            {!pub
              ? "not submitted"
              : pub.status === "submitted"
                ? "waiting for review"
                : pub.status === "changes_requested"
                  ? "changes requested"
                  : pub.published
                    ? "published on the Members page"
                    : "approved, currently hidden"}
          </strong>
          {pub && pubChanged && pub.status !== "submitted" ? " · your profile has changed since the last submission" : null}
        </p>
        {pub?.status === "changes_requested" && pub.review_note ? <p className="error">Note from the admins: {pub.review_note}</p> : null}
        <ActionForm action={submitPublicProfile} className="stack">
          <SubmitButton className="btn solid">{pub ? "Submit the current version for review" : "Submit for review"}</SubmitButton>
        </ActionForm>
      </section>
      <section id="email" style={{ marginTop: 36 }}>
        <h2 className="page-title" style={{ fontSize: "1.4em" }}>Email</h2>
        {email ? <p className="banner">Email preference saved.</p> : null}
        <ActionForm action={setEmailNotifications} className="stack">
          <label className="choice-line">
            <input id="email_notifications" type="checkbox" name="email_notifications" value="on" defaultChecked={emailOn} />
            <span>Email me notifications</span>
          </label>
          <p className="help">The bell in the members&apos; area always shows them. Password reset emails are sent either way.</p>
          <SubmitButton className="btn">Save email preference</SubmitButton>
        </ActionForm>
      </section>
    </>
  );
}
