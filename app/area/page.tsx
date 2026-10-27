import Link from "next/link";
import { DocIcon } from "@/components/members-shell";
import { loadAreaFrame, requireUser } from "@/lib/auth";
import { fetchDashboard } from "@/lib/area-data";
import { formatShort, questionStatus } from "@/lib/time";
import { closedVoteLine } from "@/lib/poll";
import { VoteBadge } from "@/components/vote-badge";

const VOTE_PAGE = 6;

type SectionKey = "t" | "v" | "o";

function limitOf(raw: string | undefined): number {
  const asked = Number.parseInt(raw || "", 10);
  return Number.isFinite(asked) && asked > VOTE_PAGE ? Math.min(asked, 500) : VOTE_PAGE;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ t?: string; v?: string; o?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const limits: Record<SectionKey, number> = { t: limitOf(params.t), v: limitOf(params.v), o: limitOf(params.o) };
  const data = await fetchDashboard(user.id, 500);
  const sections = [
    { key: "t" as const, title: "To vote", empty: "Nothing to vote on right now.", items: data.votes.filter((vote) => vote.my_status === "to_vote") },
    { key: "v" as const, title: "Voted", empty: "", items: data.votes.filter((vote) => vote.my_status === "voted") },
    { key: "o" as const, title: "Closed and other votes", empty: "", items: data.votes.filter((vote) => vote.my_status !== "to_vote" && vote.my_status !== "voted") },
  ].map((section) => ({ ...section, limit: limits[section.key] }));
  const moreHref = (key: SectionKey) => {
    const next = { ...limits, [key]: limits[key] + VOTE_PAGE };
    const query = (Object.keys(next) as SectionKey[])
      .filter((k) => next[k] > VOTE_PAGE)
      .map((k) => `${k}=${next[k]}`)
      .join("&");
    return `/area?${query}#votes-${key}`;
  };
  const toVote = (await loadAreaFrame())?.pendingVotes ?? 0;

  return (
    <>
      {toVote > 0 ? (
        <p className="note" style={{ marginBottom: 18 }}>
          <Link href="/area/votes?filter=to_vote">
            You have {toVote} open vote{toVote === 1 ? "" : "s"} to cast.
          </Link>
        </p>
      ) : null}
      <div className="head">
        <div className="eyebrow">Documents</div>
        <Link className="act" href="/area/documents">Open the library</Link>
      </div>
      <div className="docs">
        {data.register.map((doc) => (
          <Link className="doc" href="/area/documents" key={doc.title}>
            <DocIcon />
            <span className="doc-name">{doc.title}</span>
            <span className="doc-meta">v{doc.versions} · {formatShort(doc.uploaded_at)}</span>
          </Link>
        ))}
        <Link className="doc" href="/area/documents">
          <DocIcon folder />
          <span className="doc-name">Minutes</span>
          <span className="doc-meta">{data.minutes} files</span>
        </Link>
        <Link className="doc" href="/area/documents">
          <DocIcon folder />
          <span className="doc-name">Resolutions</span>
          <span className="doc-meta">{data.resolutions} files</span>
        </Link>
      </div>

      <div className="head" id="votes">
        <div className="eyebrow">Votes</div>
        {user.role === "admin" ? <Link className="act" href="/area/votes/new">Open a vote</Link> : <Link className="act" href="/area/votes">All votes</Link>}
      </div>
      {sections.map((section) => {
        const shown = section.items.slice(0, section.limit);
        if (section.items.length === 0 && section.key !== "t") return null;
        return (
          <section key={section.key} id={`votes-${section.key}`} style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ margin: "10px 0 6px" }}>{section.title} ({section.items.length})</div>
            {section.items.length === 0 ? <p className="muted">{section.empty}</p> : null}
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
                </div>
                <Link className="title" href={`/area/votes/${vote.id}`}>{vote.subject}</Link>
                {vote.status === "open" ? (
                  <div className="by">{vote.ballots} of {vote.eligible} voted · closes {formatShort(vote.deadline)}</div>
                ) : (
                  <div className="by">{vote.author} · {formatShort(vote.opened_at)}</div>
                )}
                {vote.status === "closed" && vote.outcome ? (
                  <div className="result">{closedVoteLine(vote)}</div>
                ) : null}
              </article>
            ))}
            {section.items.length > shown.length ? (
              <p style={{ marginTop: 12 }}>
                <Link className="act" href={moreHref(section.key)} scroll={false}>
                  Load more ({section.items.length - shown.length} more)
                </Link>
              </p>
            ) : null}
          </section>
        );
      })}

      <div className="head" style={{ marginTop: 36 }}>
        <div className="eyebrow">Questions</div>
        <Link className="act" href="/area/questions/new">Ask a question</Link>
      </div>
      {data.questions.length === 0 ? <p className="muted">No open questions.</p> : null}
      {data.questions.map((question) => {
        const status = questionStatus(question.deadline);
        return (
          <article className="thread" key={question.id}>
            <div className="tags">
              <span className="tag">Question</span>
              <span className="dot" />
              <span className={status.open ? "tag now" : "tag"}>{status.text}</span>
            </div>
            <Link className="title" href={`/area/questions/${question.id}`}>{question.title}</Link>
            <div className="by">
              {question.author} · {formatShort(question.created_at)} · {question.replies} {question.replies === 1 ? "reply" : "replies"}
            </div>
          </article>
        );
      })}
      <p className="muted" style={{ marginTop: 8 }}>Signed in as {user.display_name}. Open questions are the ones without a passed deadline.</p>
    </>
  );
}
