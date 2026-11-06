import JSZip from "jszip";
import { pool } from "./db";
import { storageGet } from "./storage";
import { ensureVotePdf } from "./votes";

function part(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_|_$/g, "").slice(0, 70) || "file";
}

export async function buildDocumentsZip(ids: string[]): Promise<Buffer> {
  const zip = new JSZip();
  const { rows } = await pool.query<{
    id: string;
    title: string;
    area: string;
    category: string;
    version_number: number;
    storage_key: string;
    filename: string;
  }>(
    `SELECT d.id, d.title, d.area, d.category, v.version_number, v.storage_key, v.filename
     FROM documents d
     JOIN document_versions v ON v.document_id = d.id
     WHERE d.id = ANY($1::uuid[])
       AND v.version_number = (SELECT max(version_number) FROM document_versions WHERE document_id = d.id)
     ORDER BY d.title`,
    [ids],
  );
  for (const row of rows) {
    const bytes = await storageGet(row.storage_key);
    zip.file(`${row.area}/${part(row.title)}/${row.filename}`, bytes);
  }
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

export async function buildFullExport(): Promise<Buffer> {
  const zip = new JSZip();
  const { rows: versions } = await pool.query<{
    title: string;
    area: string;
    category: string;
    version_number: number;
    storage_key: string;
    filename: string;
    uploaded_at: Date;
  }>(
    `SELECT d.title, d.area, d.category, v.version_number, v.storage_key, v.filename, v.uploaded_at
     FROM documents d
     JOIN document_versions v ON v.document_id = d.id
     ORDER BY d.area, d.title, v.version_number`,
  );
  for (const row of versions) {
    const bytes = await storageGet(row.storage_key);
    const folder = row.area === "register" ? `documents/register/${row.category}` : "documents/shared";
    zip.file(`${folder}/${part(row.title)}/v${row.version_number}-${row.filename}`, bytes);
  }

  const { rows: closed } = await pool.query<{ id: string; subject: string; closed_at: Date }>(
    `SELECT id, subject, closed_at FROM votes WHERE status = 'closed' ORDER BY closed_at`,
  );
  for (const vote of closed) {
    const pdf = await ensureVotePdf(vote.id);
    const stamp = vote.closed_at.toISOString().slice(0, 10);
    zip.file(`resolutions/${stamp}-${part(vote.subject)}.pdf`, pdf);
  }

  const [votes, ballots, electorate, resolutions, options, pollBallots, pollAnswers] = await Promise.all([
    pool.query(`SELECT * FROM votes ORDER BY opened_at`),
    pool.query(
      `SELECT b.*, p.display_name, p.email
       FROM ballots b JOIN profiles p ON p.id = b.voter_id ORDER BY b.cast_at`,
    ),
    pool.query(
      `SELECT e.*, p.display_name, p.email
       FROM vote_electorate e JOIN profiles p ON p.id = e.profile_id ORDER BY p.display_name`,
    ),
    pool.query(`SELECT * FROM resolutions ORDER BY closed_at`),
    pool.query(`SELECT * FROM vote_options ORDER BY vote_id, position`),
    pool.query(
      `SELECT b.*, p.display_name, p.email
       FROM poll_ballots b JOIN profiles p ON p.id = b.voter_id ORDER BY b.cast_at`,
    ),
    pool.query(
      `SELECT a.*, o.label
       FROM poll_answers a JOIN vote_options o ON o.id = a.option_id
       ORDER BY a.vote_id, o.position`,
    ),
  ]);

  zip.file(
    "resolutions/register.json",
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        note: "Full copy of the resolutions register and document library. No hosted service is required to read this archive.",
        votes: votes.rows,
        electorate: electorate.rows,
        ballots: ballots.rows,
        resolutions: resolutions.rows,
        voteOptions: options.rows,
        pollBallots: pollBallots.rows,
        pollAnswers: pollAnswers.rows,
      },
      null,
      2,
    ),
  );

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

export function downloadResponse(body: Buffer, filename: string, mime: string): Response {
  const safe = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "") || "file";
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
