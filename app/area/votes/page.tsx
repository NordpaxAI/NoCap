import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { MY_VOTE_SQL, TO_VOTE_LATERAL, VOTE_ORDER_SQL, type MyVoteStatus } from "@/lib/area-data";
import { VoteBadge } from "@/components/vote-badge";
import { closedVoteLine } from "@/lib/poll";
import { formatShort } from "@/lib/time";

export const metadata = { title: "Votes" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "to_vote", label: "Open – to vote" },
  { key: "voted", label: "Voted" },
  { key: "closed", label: "Closed" },
] as const;

export default async function VotesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const asked = (await searchParams).filter;
  const filter = FILTERS.some((f) => f.key === asked) ? asked : "all";
  const { rows } = await pool.query<{
    id: string;
    subject: string;
    status: string;
    deadline: Date;
    opened_at: Date;
    outcome: string | null;
    for_count: number | null;
    against_count: number | null;
    abstain_count: number | null;
    author: string;
    voted: number;
    eligible: number;
    kind: string;
    poll_summary: string | null;
    my_status: MyVoteStatus;
    my_choice: string | null;
  }>(
    `SELECT v.id, v.subject, v.status, v.deadline, v.opened_at, v.outcome,
            v.for_count, v.against_count, v.abstain_count, COALESCE(p.display_name, 'Former member') AS author, v.kind,
            (SELECT count(*)::int FROM ballots b WHERE b.vote_id = v.id)
              + (SELECT count(*)::int FROM poll_ballots pb WHERE pb.vote_id = v.id) AS voted,
            (SELECT count(*)::int FROM vote_electorate e WHERE e.vote_id = v.id) AS eligible,
            (
              SELECT string_agg(
                o.label || ' ' || (SELECT count(*)::int FROM poll_answers a WHERE a.option_id = o.id)::text,
                ', ' ORDER BY o.position
              )
              FROM vote_options o
              WHERE o.vote_id = v.id
            ) AS poll_summary,
            ${MY_VOTE_SQL}
     FROM votes v LEFT JOIN profiles p ON p.id = v.opened_by
     ${TO_VOTE_LATERAL}
     ORDER BY ${VOTE_ORDER_SQL}`,
    [user.id],
  );
  const shown = rows.filter((vote) =>
    filter === "to_vote" ? vote.my_status === "to_vote"
    : filter === "voted" ? vote.my_status === "voted"
    : filter === "closed" ? vote.status === "closed"
    : true,
  );
  return (
    <>
      <div className="head">
        <h1 className="page-title">Votes</h1>
        {user.role === "admin" ? <Link className="act" href="/area/votes/new">Open a vote</Link> : null}
      </div>
      <p className="help">Only an admin opens a vote. A standard vote is For, Against or Abstain. A poll uses options the admin writes. Either way, members can see who voted what, and a choice cannot be changed once cast.</p>
      <p className="by" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {FILTERS.map((f) =>
          f.key === filter ? (
            <strong key={f.key}>{f.label}</strong>
          ) : (
            <Link key={f.key} href={f.key === "all" ? "/area/votes" : `/area/votes?filter=${f.key}`}>{f.label}</Link>
          ),
        )}
      </p>
      {shown.length === 0 ? <p className="muted">No votes here.</p> : null}
      {shown.map((vote) => (
        <article className={vote.status === "open" ? "thread open" : "thread"} key={vote.id}>
          <div className="tags">
            <span className={vote.status === "open" ? "tag now" : "tag"}>{vote.status === "open" ? "Vote open" : "Closed"}</span>
            {vote.kind === "poll" ? (
              <>
                <span className="dot" />
                <span className="tag">Poll</span>
              </>
            ) : null}
            <VoteBadge status={vote.my_status} choice={vote.my_choice} />
            <span className="dot" />
            <span className="tag">{vote.status === "open" ? `Closes ${formatShort(vote.deadline)}` : `Closed ${formatShort(vote.deadline)}`}</span>
          </div>
          <Link className="title" href={`/area/votes/${vote.id}`}>{vote.subject}</Link>
          <div className="by">{vote.author} · {vote.voted} of {vote.eligible} voted</div>
          {vote.status === "closed" && vote.outcome ? (
            <div className="result">{closedVoteLine(vote)}</div>
          ) : null}
        </article>
      ))}
    </>
  );
}
