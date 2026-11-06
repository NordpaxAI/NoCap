import { pool } from "./db";

export type AreaNote = {
  id: string;
  title: string;
  href: string;
  created_at: string;
  read_at: string | null;
};

export type AreaFrameRow = {
  id: string;
  email: string;
  role: "admin" | "member";
  status: "invited" | "active" | "deactivated";
  display_name: string;
  firm: string | null;
  city: string | null;
  practice_area: string | null;
  contacts: string | null;
  public_role: string | null;
  bio: string | null;
  jurisdiction: string | null;
  photo_key: string | null;
  is_example: boolean;
  notes: AreaNote[] | null;
  needs_maintenance: boolean;
  has_article: boolean;
  pending_votes: number;
};

export async function fetchAreaFrame(tokenHash: string): Promise<AreaFrameRow | null> {
  const { rows } = await pool.query<AreaFrameRow>(
    `SELECT p.id, p.email, p.role, p.status, p.display_name, p.firm, p.city,
            p.practice_area, p.contacts, p.public_role, p.bio, p.jurisdiction,
            p.photo_key, p.is_example,
            COALESCE(n.notes, '[]'::json) AS notes,
            EXISTS (
              SELECT 1 FROM votes v
              WHERE v.status = 'open' AND v.deadline <= now() + interval '48 hours'
            ) AS needs_maintenance,
            EXISTS (SELECT 1 FROM article_assignments aa WHERE aa.member_id = p.id) AS has_article,
            (SELECT count(*)::int FROM votes v
             JOIN vote_electorate e ON e.vote_id = v.id AND e.profile_id = p.id
             WHERE v.status = 'open' AND v.deadline > now()
               AND NOT EXISTS (SELECT 1 FROM ballots b WHERE b.vote_id = v.id AND b.voter_id = p.id)
               AND NOT EXISTS (SELECT 1 FROM poll_ballots pb WHERE pb.vote_id = v.id AND pb.voter_id = p.id)
            ) AS pending_votes
     FROM sessions s
     JOIN profiles p ON p.id = s.profile_id
     LEFT JOIN LATERAL (
       SELECT json_agg(
                json_build_object(
                  'id', x.id, 'title', x.title, 'href', x.href,
                  'created_at', x.created_at, 'read_at', x.read_at
                )
                ORDER BY x.created_at DESC
              ) AS notes
       FROM (
         SELECT id, title, href, created_at, read_at
         FROM notifications
         WHERE recipient_id = p.id
         ORDER BY created_at DESC
         LIMIT 30
       ) x
     ) n ON true
     WHERE s.token_hash = $1 AND s.expires_at > now() AND p.status = 'active'`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export type DashboardDoc = { category: string; title: string; versions: number; uploaded_at: string };
export type DashboardQuestion = {
  id: string;
  title: string;
  created_at: string;
  deadline: string | null;
  author: string;
  replies: number;
};
export type DashboardVote = {
  id: string;
  subject: string;
  status: string;
  deadline: string;
  opened_at: string;
  outcome: string | null;
  for_count: number | null;
  against_count: number | null;
  abstain_count: number | null;
  author: string;
  ballots: number;
  eligible: number;
  kind: string;
  poll_summary: string | null;
  my_status: MyVoteStatus;
  my_choice: string | null;
  live_for: number;
  live_against: number;
  live_abstain: number;
  quorum_constitutive: number;
  quorum_deliberative: number;
};

// 'to_vote' / 'voted' only for members on the frozen electorate; null otherwise.
export type MyVoteStatus = "to_vote" | "voted" | "missed" | null;

// SQL columns for the current member ($1) on vote alias v.
export const MY_VOTE_SQL = `
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM vote_electorate me WHERE me.vote_id = v.id AND me.profile_id = $1::uuid) THEN NULL
    WHEN EXISTS (SELECT 1 FROM ballots mb WHERE mb.vote_id = v.id AND mb.voter_id = $1::uuid)
      OR EXISTS (SELECT 1 FROM poll_ballots mpb WHERE mpb.vote_id = v.id AND mpb.voter_id = $1::uuid) THEN 'voted'
    WHEN v.status = 'open' AND v.deadline > now() THEN 'to_vote'
    ELSE 'missed'
  END AS my_status,
  COALESCE(
    (SELECT CASE mb.choice WHEN 'for' THEN 'For' WHEN 'against' THEN 'Against' WHEN 'abstain' THEN 'Abstain' ELSE mb.choice END
     FROM ballots mb WHERE mb.vote_id = v.id AND mb.voter_id = $1::uuid),
    (SELECT string_agg(o.label, ', ' ORDER BY o.position)
     FROM poll_answers ma JOIN vote_options o ON o.id = ma.option_id
     WHERE ma.vote_id = v.id AND ma.voter_id = $1::uuid)
  ) AS my_choice`;

// Lateral x.to_vote for the current member ($1::uuid) on vote alias v.
export const TO_VOTE_LATERAL = `
  CROSS JOIN LATERAL (
    SELECT EXISTS (SELECT 1 FROM vote_electorate xe WHERE xe.vote_id = v.id AND xe.profile_id = $1::uuid)
      AND v.status = 'open' AND v.deadline > now()
      AND NOT EXISTS (SELECT 1 FROM ballots xb WHERE xb.vote_id = v.id AND xb.voter_id = $1::uuid)
      AND NOT EXISTS (SELECT 1 FROM poll_ballots xpb WHERE xpb.vote_id = v.id AND xpb.voter_id = $1::uuid)
      AS to_vote
  ) x`;

// Open votes the member still has to cast first, then other open votes, then closed.
export const VOTE_ORDER_SQL = `(v.status = 'open') DESC, x.to_vote DESC, v.opened_at DESC`;

export async function fetchDashboard(userId: string, voteLimit: number): Promise<{
  register: DashboardDoc[];
  questions: DashboardQuestion[];
  votes: DashboardVote[];
  totalVotes: number;
  minutes: number;
  resolutions: number;
}> {
  const { rows } = await pool.query<{
    register: DashboardDoc[] | null;
    questions: DashboardQuestion[] | null;
    votes: DashboardVote[] | null;
    total_votes: number;
    minutes: number;
    resolutions: number;
  }>(
    `SELECT
       COALESCE((
         SELECT json_agg(json_build_object(
                  'category', d.category, 'title', d.title,
                  'versions', d.versions, 'uploaded_at', d.uploaded_at
                ) ORDER BY d.title)
         FROM (
           SELECT d.category, d.title, count(v.id)::int AS versions, max(v.uploaded_at) AS uploaded_at
           FROM documents d
           JOIN document_versions v ON v.document_id = d.id
           WHERE d.area = 'register' AND d.category IN ('charter', 'code_of_conduct')
           GROUP BY d.id
         ) d
       ), '[]'::json) AS register,
       (SELECT count(*)::int FROM documents WHERE area = 'register' AND category = 'minutes') AS minutes,
       (
         (SELECT count(*)::int FROM documents WHERE category = 'resolution')
         + (SELECT count(*)::int FROM votes WHERE status = 'closed' AND kind = 'standard')
       ) AS resolutions,
       COALESCE((
         SELECT json_agg(json_build_object(
                  'id', q.id, 'title', q.title, 'created_at', q.created_at,
                  'deadline', q.deadline, 'author', q.author, 'replies', q.replies
                ) ORDER BY q.created_at DESC)
         FROM (
           SELECT q.id, q.title, q.created_at, q.deadline, p.display_name AS author,
                  (SELECT count(*)::int FROM question_comments c WHERE c.question_id = q.id) AS replies
           FROM questions q
           JOIN profiles p ON p.id = q.author_id
           WHERE q.deadline IS NULL OR q.deadline > now()
         ) q
       ), '[]'::json) AS questions,
       COALESCE((
         SELECT json_agg(json_build_object(
                  'id', v.id, 'subject', v.subject, 'status', v.status, 'deadline', v.deadline,
                  'opened_at', v.opened_at, 'outcome', v.outcome, 'for_count', v.for_count,
                  'against_count', v.against_count, 'abstain_count', v.abstain_count,
                  'author', v.author, 'ballots', v.ballots, 'eligible', v.eligible,
                  'kind', v.kind, 'poll_summary', v.poll_summary,
                  'my_status', v.my_status, 'my_choice', v.my_choice,
                  'live_for', v.live_for, 'live_against', v.live_against, 'live_abstain', v.live_abstain,
                  'quorum_constitutive', v.quorum_constitutive, 'quorum_deliberative', v.quorum_deliberative
                ) ORDER BY v.ord)
         FROM (
           SELECT v.id, v.subject, v.status, v.deadline, v.opened_at, v.outcome,
                  v.for_count, v.against_count, v.abstain_count, COALESCE(p.display_name, 'Former member') AS author, v.kind,
                  (SELECT count(*)::int FROM ballots b WHERE b.vote_id = v.id)
                    + (SELECT count(*)::int FROM poll_ballots pb WHERE pb.vote_id = v.id) AS ballots,
                  (SELECT count(*)::int FROM vote_electorate e WHERE e.vote_id = v.id) AS eligible,
                  (SELECT count(*)::int FROM ballots b WHERE b.vote_id = v.id AND b.choice = 'for') AS live_for,
                  (SELECT count(*)::int FROM ballots b WHERE b.vote_id = v.id AND b.choice = 'against') AS live_against,
                  (SELECT count(*)::int FROM ballots b WHERE b.vote_id = v.id AND b.choice = 'abstain') AS live_abstain,
                  v.quorum_constitutive, v.quorum_deliberative,
                  (
                    SELECT string_agg(
                      o.label || ' ' || (SELECT count(*)::int FROM poll_answers a WHERE a.option_id = o.id)::text,
                      ', ' ORDER BY o.position
                    )
                    FROM vote_options o
                    WHERE o.vote_id = v.id
                  ) AS poll_summary,
                  ${MY_VOTE_SQL},
                  row_number() OVER (ORDER BY ${VOTE_ORDER_SQL}) AS ord
           FROM votes v
           LEFT JOIN profiles p ON p.id = v.opened_by
           ${TO_VOTE_LATERAL}
           ORDER BY ord
           LIMIT $2::int
         ) v
       ), '[]'::json) AS votes,
       (SELECT count(*)::int FROM votes) AS total_votes`,
    [userId, voteLimit],
  );
  const row = rows[0];
  return {
    register: row?.register ?? [],
    questions: row?.questions ?? [],
    votes: row?.votes ?? [],
    totalVotes: row?.total_votes ?? 0,
    minutes: row?.minutes ?? 0,
    resolutions: row?.resolutions ?? 0,
  };
}
