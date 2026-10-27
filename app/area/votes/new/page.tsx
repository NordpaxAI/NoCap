import { VoteForm } from "@/components/vote-form";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { minimumVoteDeadlineInput } from "@/lib/time";

export const metadata = { title: "Open a vote" };

export default async function NewVotePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { error } = await searchParams;
  const { rows: members } = await pool.query<{ id: string; name: string }>(
    `SELECT id, display_name AS name FROM profiles WHERE status = 'active' ORDER BY display_name`,
  );
  return (
    <>
      <h1 className="page-title">Open a vote</h1>
      {error ? <p className="error">{error}</p> : null}
      <VoteForm earliest={minimumVoteDeadlineInput()} members={members} />
    </>
  );
}
