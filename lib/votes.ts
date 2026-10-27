import { pool } from "./db";
import { logServerError } from "./log";
import { notifyMany } from "./notify";
import { sendArticleReminders } from "./articles";
import { failureReason, outcomeLabel, buildVoteRecordPdf, type VoteRecord } from "./pdf";
import { formatPollCounts, joinLabels, leadingTie } from "./poll";
import { storageExists, storageGet, storagePut } from "./storage";
import { formatWhen } from "./time";

function closedNotice(record: VoteRecord): string {
  if (record.kind === "poll") {
    const counts = formatPollCounts(record.options, record.votedCount);
    const tie = record.constitutiveMet ? leadingTie(record.options) : [];
    const tieText = tie.length ? ` Tie: ${joinLabels(tie)}.` : "";
    return `${outcomeLabel(record.outcome)} ${counts}.${tieText}`;
  }
  const why = failureReason(record.outcome);
  return why
    ? `${outcomeLabel(record.outcome)} ${record.forCount} for, ${record.againstCount} against, ${record.abstainCount} abstentions.`
    : `${outcomeLabel(record.outcome)}. ${record.forCount} for, ${record.againstCount} against, ${record.abstainCount} abstentions.`;
}

const HOUR = 60 * 60 * 1000;

let maintenanceInflight: Promise<void> | null = null;

export function runVoteMaintenance(): Promise<void> {
  if (maintenanceInflight) return maintenanceInflight;
  maintenanceInflight = runVoteMaintenanceOnce().finally(() => {
    maintenanceInflight = null;
  });
  return maintenanceInflight;
}

async function runVoteMaintenanceOnce(): Promise<void> {
  await sendDueReminders();
  await sendArticleReminders().catch((error) => console.error("article reminders", error));
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM votes WHERE status = 'open' AND deadline <= now()`,
  );
  if (rows.length === 0) return;
  await pool.query(`SELECT private.close_due_votes()`);
  for (const row of rows) {
    try {
      await ensureVotePdf(row.id);
    } catch (error) {
      console.error(`vote record ${row.id}`, error);
    }
    await notifyVoteClosed(row.id);
  }
}

export async function closeDueVotes(): Promise<void> {
  await runVoteMaintenance();
}

export async function loadVoteRecord(voteId: string): Promise<VoteRecord | null> {
  const { rows } = await pool.query<{
    subject: string;
    description: string;
    opened_at: Date;
    closed_at: Date;
    deadline: Date;
    quorum_constitutive: number;
    quorum_deliberative: number;
    eligible_count: number;
    voted_count: number;
    for_count: number;
    against_count: number;
    abstain_count: number;
    constitutive_met: boolean;
    deliberative_met: boolean | null;
    outcome: string;
    kind: "standard" | "poll";
    allow_multiple: boolean;
  }>(
    `SELECT subject, description, opened_at, closed_at, deadline,
            quorum_constitutive, quorum_deliberative,
            eligible_count, voted_count, for_count, against_count, abstain_count,
            constitutive_met, deliberative_met, outcome, kind, allow_multiple
     FROM votes WHERE id = $1 AND status = 'closed'`,
    [voteId],
  );
  const vote = rows[0];
  if (!vote) return null;
  const { rows: voters } = await pool.query<{
    display_name: string;
    email: string;
    choice: string | null;
    cast_at: Date | null;
  }>(
    `SELECT p.display_name, p.email,
            CASE
              WHEN v.kind = 'poll' THEN (
                SELECT string_agg(o.label, ', ' ORDER BY o.position)
                FROM poll_answers a
                JOIN vote_options o ON o.id = a.option_id
                WHERE a.vote_id = e.vote_id AND a.voter_id = e.profile_id
              )
              ELSE b.choice
            END AS choice,
            COALESCE(b.cast_at, pb.cast_at) AS cast_at
     FROM vote_electorate e
     JOIN votes v ON v.id = e.vote_id
     JOIN profiles p ON p.id = e.profile_id
     LEFT JOIN ballots b ON b.vote_id = e.vote_id AND b.voter_id = e.profile_id
     LEFT JOIN poll_ballots pb ON pb.vote_id = e.vote_id AND pb.voter_id = e.profile_id
     WHERE e.vote_id = $1
     ORDER BY p.display_name`,
    [voteId],
  );
  const { rows: options } = await pool.query<{ label: string; count: number }>(
    `SELECT o.label, (SELECT count(*)::int FROM poll_answers a WHERE a.option_id = o.id) AS count
     FROM vote_options o
     WHERE o.vote_id = $1
     ORDER BY o.position`,
    [voteId],
  );
  const excluded = await loadExclusions(voteId);
  return {
    subject: vote.subject,
    description: vote.description,
    openedAt: vote.opened_at,
    closedAt: vote.closed_at,
    deadline: vote.deadline,
    quorumConstitutive: Number(vote.quorum_constitutive),
    quorumDeliberative: Number(vote.quorum_deliberative),
    eligibleCount: vote.eligible_count,
    votedCount: vote.voted_count,
    forCount: vote.for_count,
    againstCount: vote.against_count,
    abstainCount: vote.abstain_count,
    constitutiveMet: vote.constitutive_met,
    deliberativeMet: vote.deliberative_met,
    outcome: vote.outcome,
    kind: vote.kind,
    allowMultiple: vote.allow_multiple,
    options,
    voters: voters.map((voter) => ({
      name: voter.display_name,
      email: voter.email,
      choice: voter.choice,
      castAt: voter.cast_at,
    })),
    excluded,
  };
}

export async function loadExclusions(voteId: string): Promise<{ name: string; email: string }[]> {
  const { rows } = await pool.query<{ name: string; email: string }>(
    `SELECT COALESCE(p.display_name, 'Former member') AS name, p.email
     FROM vote_exclusions x JOIN profiles p ON p.id = x.profile_id
     WHERE x.vote_id = $1 ORDER BY p.display_name`,
    [voteId],
  );
  return rows;
}

export function recordKey(voteId: string): string {
  return `records/${voteId}.v2.pdf`;
}

export async function ensureVotePdf(voteId: string): Promise<Buffer> {
  const key = recordKey(voteId);
  if (await storageExists(key)) return storageGet(key);
  const record = await loadVoteRecord(voteId);
  if (!record) throw new Error("That vote has no closed record.");
  const pdf = await buildVoteRecordPdf(record);
  await storagePut(key, pdf, "application/pdf");
  return pdf;
}

async function sendDueReminders(): Promise<void> {
  const { rows } = await pool.query<{ id: string; subject: string; deadline: Date }>(
    `SELECT id, subject, deadline FROM votes
     WHERE status = 'open' AND deadline > now() AND deadline <= now() + interval '48 hours'`,
  );
  for (const vote of rows) {
    const left = vote.deadline.getTime() - Date.now();
    if (left <= 48 * HOUR) await sendVoteReminder(vote, "48h");
    if (left <= 24 * HOUR) await sendVoteReminder(vote, "24h");
  }
}

async function sendVoteReminder(
  vote: { id: string; subject: string; deadline: Date },
  window: "48h" | "24h",
): Promise<void> {
  const { rows: outstanding } = await pool.query<{
    id: string;
    email: string;
    display_name: string;
    role: string;
    status: string;
  }>(
    `SELECT p.id, p.email, p.display_name, p.role, p.status
     FROM vote_electorate e
     JOIN profiles p ON p.id = e.profile_id
     WHERE e.vote_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM ballots b WHERE b.vote_id = e.vote_id AND b.voter_id = e.profile_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM poll_ballots pb WHERE pb.vote_id = e.vote_id AND pb.voter_id = e.profile_id
       )
     ORDER BY p.display_name`,
    [vote.id],
  );
  if (outstanding.length === 0) return;

  const { rows: admins } = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM profiles WHERE role = 'admin' AND status = 'active'`,
  );
  const names = outstanding.map((person) => person.display_name).join(", ");
  const when = formatWhen(vote.deadline);
  const hours = window === "48h" ? "48 hours" : "24 hours";
  const recipients = new Map<string, { id: string; email: string; admin: boolean }>();
  for (const person of outstanding) {
    if (person.status !== "active") continue;
    recipients.set(person.id, { id: person.id, email: person.email, admin: person.role === "admin" });
  }
  for (const admin of admins) {
    recipients.set(admin.id, { id: admin.id, email: admin.email, admin: true });
  }

  await notifyMany(
    [...recipients.values()].map((person) => ({
      recipientId: person.id,
      email: person.email,
      kind: person.admin ? `vote_reminder_${window}_admin` : `vote_reminder_${window}`,
      title: `Vote reminder, ${hours}: ${vote.subject}`,
      body: person.admin
        ? `"${vote.subject}" closes ${when}. Still to vote: ${names}.`
        : `"${vote.subject}" closes ${when}. You have not voted yet.`,
      href: `/area/votes/${vote.id}`,
      eventKey: `vote:${vote.id}:reminder:${window}:${person.id}`,
    })),
  );
}

async function notifyVoteClosed(voteId: string): Promise<void> {
  const record = await loadVoteRecord(voteId);
  if (!record) return;
  const summary = closedNotice(record);
  const { rows } = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM profiles WHERE status = 'active'`,
  );
  await notifyMany(
    rows.map((person) => ({
      recipientId: person.id,
      email: person.email,
      kind: "vote_closed",
      title: `Vote closed: ${record.subject}`,
      body: `${record.subject} has closed.\n\n${summary}`,
      href: `/area/votes/${voteId}`,
      eventKey: `vote:${voteId}:closed:${person.id}`,
    })),
  );
}
