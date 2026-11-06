import { VoteBars } from "@/components/vote-bars";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AddVoteDocuments } from "@/components/add-vote-documents";
import { DeleteControl } from "@/components/delete-control";
import { SubmitButton } from "@/components/submit-button";
import { VoteDocumentList, type VoteDocumentFile } from "@/components/vote-documents";
import { castVote, deleteVote, remindVoters } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { labelChoice, outcomeLabel } from "@/lib/pdf";
import { formatPollCounts, joinLabels, leadingTie } from "@/lib/poll";
import { formatWhen } from "@/lib/time";
import { loadExclusions } from "@/lib/votes";

type OptionRow = { id: string; label: string; count: number };
type ChoiceRow = { option_id: string; label: string };
type RollRow = {
  profile_id: string;
  display_name: string;
  choice: string | null;
  choices: ChoiceRow[] | null;
  cast_at: string | null;
};

export default async function VotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; reminded?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error, reminded } = await searchParams;
  const { rows } = await pool.query<{
    id: string;
    subject: string;
    description: string;
    status: string;
    kind: "standard" | "poll";
    opened_by: string | null;
    opener_missing: boolean;
    allow_multiple: boolean;
    deadline: Date;
    opened_at: Date;
    closed_at: Date | null;
    quorum_constitutive: number;
    quorum_deliberative: number;
    outcome: string | null;
    for_count: number | null;
    against_count: number | null;
    abstain_count: number | null;
    eligible_count: number | null;
    voted_count: number | null;
    constitutive_met: boolean | null;
    deliberative_met: boolean | null;
    author: string;
    roll: RollRow[] | null;
    options: OptionRow[] | null;
    files: VoteDocumentFile[] | null;
  }>(
    `SELECT v.id, v.subject, v.description, v.status, v.kind, v.allow_multiple,
            v.opened_by,
            NOT EXISTS (SELECT 1 FROM profiles op WHERE op.id = v.opened_by) AS opener_missing,
            v.deadline, v.opened_at, v.closed_at,
            v.quorum_constitutive, v.quorum_deliberative, v.outcome,
            v.for_count, v.against_count, v.abstain_count, v.eligible_count, v.voted_count,
            v.constitutive_met, v.deliberative_met, COALESCE(p.display_name, 'Former member') AS author,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'profile_id', e.profile_id,
                       'display_name', ep.display_name,
                       'choice', b.choice,
                       'choices', COALESCE((
                         SELECT json_agg(json_build_object('option_id', o.id, 'label', o.label) ORDER BY o.position)
                         FROM poll_answers a
                         JOIN vote_options o ON o.id = a.option_id
                         WHERE a.vote_id = e.vote_id AND a.voter_id = e.profile_id
                       ), '[]'::json),
                       'cast_at', COALESCE(b.cast_at, pb.cast_at)
                     ) ORDER BY (
                       b.choice IS NULL AND NOT EXISTS (
                         SELECT 1 FROM poll_ballots pb2
                         WHERE pb2.vote_id = e.vote_id AND pb2.voter_id = e.profile_id
                       )
                     ), ep.display_name)
              FROM vote_electorate e
              JOIN profiles ep ON ep.id = e.profile_id
              LEFT JOIN ballots b ON b.vote_id = e.vote_id AND b.voter_id = e.profile_id
              LEFT JOIN poll_ballots pb ON pb.vote_id = e.vote_id AND pb.voter_id = e.profile_id
              WHERE e.vote_id = v.id
            ), '[]'::json) AS roll,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id', o.id, 'label', o.label,
                       'count', (SELECT count(*)::int FROM poll_answers a WHERE a.option_id = o.id)
                     ) ORDER BY o.position)
              FROM vote_options o
              WHERE o.vote_id = v.id
            ), '[]'::json) AS options,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id', a.id, 'filename', a.filename, 'mime_type', a.mime_type, 'byte_size', a.byte_size
                     ) ORDER BY a.uploaded_at, a.filename)
              FROM attachments a
              WHERE a.parent_type = 'vote' AND a.parent_id = v.id
            ), '[]'::json) AS files
     FROM votes v
     LEFT JOIN profiles p ON p.id = v.opened_by
     WHERE v.id = $1`,
    [id],
  );
  const vote = rows[0];
  if (!vote) notFound();
  const excluded = await loadExclusions(vote.id);
  const poll = vote.kind === "poll";
  const roll = vote.roll ?? [];
  const options = vote.options ?? [];
  const files = vote.files ?? [];
  const mine = roll.find((person) => person.profile_id === user.id);
  const answered = (person: RollRow) => (poll ? (person.choices?.length ?? 0) > 0 : Boolean(person.choice));
  const choiceText = (person: RollRow) =>
    poll ? (person.choices ?? []).map((choice) => choice.label).join(", ") : person.choice ? labelChoice(person.choice) : "";
  const voted = roll.filter(answered);
  const waiting = roll.filter((person) => !answered(person));
  const open = vote.status === "open";
  const canDelete = user.role === "admin" && open && (vote.opened_by === user.id || vote.opener_missing);
  const tie = !open && vote.constitutive_met ? leadingTie(options) : [];

  return (
    <>
      <article className={open ? "thread open" : "thread"}>
        <div className="tags">
          <span className={open ? "tag now" : "tag"}>{open ? "Vote open" : "Closed"}</span>
          {poll ? (
            <>
              <span className="dot" />
              <span className="tag">Poll</span>
            </>
          ) : null}
          <span className="dot" />
          <span className="tag">{open ? `Closes ${formatWhen(vote.deadline)}` : `Closed ${formatWhen(vote.closed_at || vote.deadline)}`}</span>
        </div>
        <h1 className="title">{vote.subject}</h1>
        <div className="by">{vote.author} · {formatWhen(vote.opened_at)}</div>
        <p className="body">{vote.description}</p>
        <p className="by">
          Constitutive quorum {vote.quorum_constitutive}%
          {poll
            ? " · the deliberative quorum does not apply"
            : ` · majority ${vote.quorum_deliberative}% For, calculated on For and Against only (abstentions count for the constitutive quorum only)`}
        </p>
        <VoteBars
          eligible={open ? roll.length : (vote.eligible_count ?? roll.length)}
          forCount={open ? roll.filter((p) => p.choice === "for").length : (vote.for_count ?? 0)}
          againstCount={open ? roll.filter((p) => p.choice === "against").length : (vote.against_count ?? 0)}
          abstainCount={open ? roll.filter((p) => p.choice === "abstain").length : (vote.abstain_count ?? 0)}
          participants={open ? voted.length : (vote.voted_count ?? voted.length)}
          quorum={Number(vote.quorum_constitutive)}
          majority={Number(vote.quorum_deliberative)}
          poll={poll}
        />
        {excluded.length ? (
          <p className="by">
            Excluded from this vote by the admin (not eligible, not counted for the quorum): {excluded.map((person) => person.name).join(", ")}.
          </p>
        ) : null}
        {poll ? (
          <p className="by">
            {vote.allow_multiple ? "A voter may pick more than one option." : "Each voter picks one option."}
            {" "}There is no abstain choice. A member who does not answer has not voted.
          </p>
        ) : null}
        <VoteDocumentList files={files} />
        {open && user.role === "admin" ? (
          <AddVoteDocuments
            voteId={vote.id}
            usedCount={files.length}
            usedBytes={files.reduce((sum, file) => sum + Number(file.byte_size), 0)}
          />
        ) : null}

        {open && mine && !answered(mine) && !poll ? (
          <div className="ballot">
            {(["for", "against", "abstain"] as const).map((choice) => (
              <ActionForm action={castVote} key={choice}>
                <input type="hidden" name="vote_id" value={vote.id} />
                <input type="hidden" name="choice" value={choice} />
                <SubmitButton>{labelChoice(choice)}</SubmitButton>
              </ActionForm>
            ))}
          </div>
        ) : null}
        {open && mine && !answered(mine) && poll ? (
          <ActionForm action={castVote} className="poll-options">
            <input type="hidden" name="vote_id" value={vote.id} />
            {options.map((option) => (
              <label className="poll-option" key={option.id}>
                <input
                  type={vote.allow_multiple ? "checkbox" : "radio"}
                  name="option_id"
                  value={option.id}
                  required={!vote.allow_multiple}
                />
                <span>{option.label}</span>
              </label>
            ))}
            <SubmitButton className="btn solid">Cast vote</SubmitButton>
          </ActionForm>
        ) : null}
        {mine && answered(mine) ? (
          <p className="cast">You voted: {choiceText(mine)} · {mine.cast_at ? formatWhen(mine.cast_at) : ""}</p>
        ) : null}
        {open && !mine ? <p className="by">You are not on the frozen list of eligible voters.</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {open ? (
          <div className="roll">
            <div className="roll-head">
              <span className="eyebrow">Roll call</span>
              <span className="count">{voted.length} of {roll.length} voted</span>
            </div>
            <div className="names">
              {roll.map((person) => (
                <span className={answered(person) ? "chip yes" : "chip wait"} key={person.profile_id}>
                  {person.display_name}{answered(person) ? ` · ${choiceText(person)}` : ""}
                </span>
              ))}
            </div>
            {user.role === "admin" ? (
              <ActionForm action={remindVoters}>
                <input type="hidden" name="vote_id" value={vote.id} />
                <SubmitButton className="nudge" disabled={waiting.length === 0}>
                  {waiting.length ? `Remind the ${waiting.length} outstanding` : "Everyone has voted"}
                </SubmitButton>
              </ActionForm>
            ) : null}
            {reminded ? <p className="by">Reminder sent.</p> : null}
          </div>
        ) : (
          <div>
            <div className="result">
              {outcomeLabel(vote.outcome || "")}{" "}
              {poll
                ? formatPollCounts(options, vote.voted_count ?? voted.length)
                : `${vote.for_count} for, ${vote.against_count} against, ${vote.abstain_count} abstention${vote.abstain_count === 1 ? "" : "s"}`}
            </div>
            {tie.length ? <p className="by">Tie: {joinLabels(tie)}.</p> : null}
            <p className="by">
              Constitutive quorum {vote.constitutive_met ? "met" : "not met"} ({vote.voted_count} of {vote.eligible_count} voted).
              {poll
                ? " The deliberative quorum does not apply to a poll."
                : ` Majority (For and Against only) ${vote.deliberative_met ? "met" : "not met"}.`}
            </p>
            {poll && vote.allow_multiple ? (
              <p className="by">Shares are of the people who voted. Someone who picks more than one option is counted in each option.</p>
            ) : null}
            <div className="names" style={{ margin: "12px 0" }}>
              {roll.map((person) => (
                <span className={answered(person) ? "chip yes" : "chip wait"} key={person.profile_id}>
                  {person.display_name}{answered(person) ? ` · ${choiceText(person)}` : " · did not vote"}
                </span>
              ))}
            </div>
            <a className="dl" href={`/api/votes/${vote.id}/record`}>Download the record</a>
          </div>
        )}
        {canDelete ? (
          <DeleteControl
            action={deleteVote}
            label="Delete this vote"
            confirm="Delete this vote? This cannot be undone."
            hidden={{ vote_id: vote.id }}
            buttonId="delete-vote"
          />
        ) : null}
      </article>
      <p style={{ marginTop: 16 }}><Link href="/area/votes">All votes</Link></p>
    </>
  );
}
