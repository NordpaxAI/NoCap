import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { reviewPublicProfile } from "@/lib/profile-actions";
import Link from "next/link";
import { formatShort } from "@/lib/time";

export const metadata = { title: "Member profiles" };
export const dynamic = "force-dynamic";

type Row = {
  profile_id: string;
  status: string;
  sub_name: string;
  sub_bio: string;
  sub_city: string;
  sub_country: string;
  sub_photo_key: string | null;
  submitted_at: Date;
  review_note: string | null;
  pub_name: string | null;
  published: boolean;
  sort: number;
};

function Card({ row }: { row: Row }) {
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
      {row.sub_photo_key ? (
        <img
          src={`/api/member-photos/${row.profile_id}?submitted=1&v=${encodeURIComponent(row.sub_photo_key)}`}
          alt=""
          style={{ width: 160, aspectRatio: "4/3", objectFit: "cover", filter: "grayscale(1)" }}
        />
      ) : null}
      <div style={{ flex: "1 1 280px" }}>
        <h3 style={{ margin: "0 0 6px" }}>{row.sub_name}</h3>
        <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{row.sub_bio}</p>
        <p className="help" style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.12em" }}>
          {row.sub_city} – {row.sub_country}
        </p>
      </div>
    </div>
  );
}

type Tracker = { id: string; display_name: string; status: TrackerStatus };
type TrackerStatus = "not_started" | "awaiting" | "changes" | "approved" | "published";
const TRACKER_LABEL: Record<TrackerStatus, string> = {
  not_started: "Not started",
  awaiting: "Awaiting review",
  changes: "Changes requested",
  approved: "Approved",
  published: "Published",
};

function reminderText(name: string, status: TrackerStatus): string {
  const first = name.split(/\s+/)[0];
  return status === "changes"
    ? `Hi ${first}! Quick reminder: your nocap public profile has a small change requested. You can update it in the private area → Profile and press "Submit for review". Thanks!`
    : `Hi ${first}! Quick reminder to fill in your nocap public profile: private area → Profile, add photo, name, bio (third person, 60–100 words), city and country, save and press "Submit for review". Thanks!`;
}

export default async function AdminProfilesPage({ searchParams }: { searchParams: Promise<{ status?: string; draft?: string }> }) {
  await requireAdmin();
  const { status: filter = "all", draft } = await searchParams;
  const { rows: tracker } = await pool.query<Tracker>(
    `SELECT p.id, p.display_name,
            CASE WHEN m.profile_id IS NULL THEN 'not_started'
                 WHEN m.status = 'submitted' THEN 'awaiting'
                 WHEN m.status = 'changes_requested' THEN 'changes'
                 WHEN m.published THEN 'published'
                 ELSE 'approved' END AS status
     FROM profiles p LEFT JOIN member_public_profiles m ON m.profile_id = p.id
     WHERE p.status = 'active' AND NOT p.is_example AND p.email NOT LIKE '%@example.invalid'
     ORDER BY p.display_name`,
  );
  const count = (s: TrackerStatus) => tracker.filter((t) => t.status === s).length;
  const shown = filter in TRACKER_LABEL ? tracker.filter((t) => t.status === filter) : tracker;
  const drafted = tracker.find((t) => t.id === draft);
  const { rows } = await pool.query<Row>(
    `SELECT profile_id, status, sub_name, sub_bio, sub_city, sub_country, sub_photo_key, submitted_at,
            review_note, pub_name, published, sort
     FROM member_public_profiles ORDER BY (status = 'submitted') DESC, submitted_at DESC`,
  );
  const pending = rows.filter((row) => row.status === "submitted");
  const others = rows.filter((row) => row.status !== "submitted");
  return (
    <>
      <h1 className="page-title">Member profiles</h1>
      <p className="help">Admin only · track completion and review public profiles.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, margin: "16px 0 24px" }}>
        {[
          [tracker.length, "Members"],
          [count("published"), "Published"],
          [count("awaiting"), "Awaiting review"],
          [count("not_started"), "Not started"],
        ].map(([n, label]) => (
          <div key={label} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "12px 16px", background: "#fff" }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{n}</div>
            <div className="help" style={{ margin: 0 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 className="page-title" style={{ fontSize: "1.3em", margin: 0 }}>All members</h2>
        <form method="get" action="/area/admin/profiles" style={{ display: "flex", gap: 8 }}>
          <label className="help" htmlFor="status-filter" style={{ margin: 0, alignSelf: "center" }}>Filter</label>
          <select id="status-filter" name="status" defaultValue={filter}>
            <option value="all">All statuses</option>
            {Object.entries(TRACKER_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button className="btn" type="submit">Apply</button>
        </form>
      </div>
      {drafted ? (
        <div className="note" style={{ margin: "16px 0" }}>
          <p style={{ marginTop: 0 }}><strong>Reminder draft for {drafted.display_name}</strong> · not sent. Copy it into WhatsApp or email yourself.</p>
          <textarea readOnly rows={4} defaultValue={reminderText(drafted.display_name, drafted.status)} style={{ width: "100%" }} />
          <p className="help"><Link href={`/area/admin/profiles?status=${filter}`}>Close</Link></p>
        </div>
      ) : null}
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr><th>Member</th><th>Status</th><th>Action</th></tr>
        </thead>
        <tbody>
          {shown.map((t) => (
            <tr key={t.id}>
              <td>{t.display_name}</td>
              <td><span style={{ background: "#EEE9E1", borderRadius: 999, padding: "2px 10px", fontSize: 12 }}>{TRACKER_LABEL[t.status]}</span></td>
              <td>
                {t.status === "not_started" || t.status === "changes" ? (
                  <Link href={`/area/admin/profiles?status=${filter}&draft=${t.id}`}>Send reminder</Link>
                ) : t.status === "awaiting" ? (
                  <a href={`#review-${t.id}`}>Review</a>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          ))}
          {shown.length === 0 ? <tr><td colSpan={3} className="muted">No members with this status.</td></tr> : null}
        </tbody>
      </table>
      <p className="help">Statuses update automatically: Not started → Awaiting review → Changes requested / Approved → Published. &quot;Send reminder&quot; only prepares a draft; nothing is sent.</p>

      <div className="head"><div className="eyebrow">Waiting for review ({pending.length})</div></div>
      {pending.length === 0 ? <p className="muted">Nothing to review.</p> : null}
      {pending.map((row) => (
        <section key={row.profile_id} id={`review-${row.profile_id}`} style={{ borderTop: "1px solid #ddd", padding: "16px 0" }}>
          <p className="help">Submitted {formatShort(row.submitted_at)}{row.pub_name ? " · replaces the published card" : ""}</p>
          <Card row={row} />
          <form action={reviewPublicProfile} className="stack" style={{ marginTop: 12 }}>
            <input type="hidden" name="profile_id" value={row.profile_id} />
            <label className="lbl" htmlFor={`note-${row.profile_id}`}>Note to the member (optional; required to request changes)</label>
            <textarea id={`note-${row.profile_id}`} name="note" rows={2} />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn solid" type="submit" name="decision" value="approve">Approve and publish</button>
              <button className="btn" type="submit" name="decision" value="changes">Request changes</button>
            </div>
          </form>
        </section>
      ))}
      <div className="head" style={{ marginTop: 36 }}><div className="eyebrow">Reviewed ({others.length})</div></div>
      {others.map((row) => (
        <section key={row.profile_id} style={{ borderTop: "1px solid #ddd", padding: "16px 0" }}>
          <p className="help">
            {row.status === "changes_requested" ? "Changes requested" : row.published ? "Published" : "Approved, hidden"}
            {row.review_note ? ` · note: ${row.review_note}` : ""}
          </p>
          <Card row={row} />
          {row.pub_name ? (
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <form action={reviewPublicProfile}>
                <input type="hidden" name="profile_id" value={row.profile_id} />
                <button className="btn" type="submit" name="decision" value={row.published ? "unpublish" : "republish"}>
                  {row.published ? "Hide from Members page" : "Show on Members page"}
                </button>
              </form>
              <form action={reviewPublicProfile} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="hidden" name="profile_id" value={row.profile_id} />
                <input type="hidden" name="decision" value="sort" />
                <label className="help" htmlFor={`sort-${row.profile_id}`}>Order</label>
                <input id={`sort-${row.profile_id}`} name="sort" type="number" defaultValue={row.sort} style={{ width: 80 }} />
                <button className="btn" type="submit">Save order</button>
              </form>
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}
