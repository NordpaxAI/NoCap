import { randomUUID } from "crypto";
import type { Member } from "./auth";
import { withTx, pool } from "./db";
import { storageDelete, storageExists, storageGet, storagePut } from "./storage";
import {
  chunkCountFor,
  concatBytes,
  expectedChunkLength,
  inspectVoteDocument,
  quotaProblem,
  VOTE_DOCUMENT_CHUNK_BYTES,
} from "./vote-documents";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Insert only. Existing attachment rows are never updated or deleted here.
export const INSERT_VOTE_ATTACHMENT = `
INSERT INTO attachments (
  parent_type, parent_id, storage_key, filename, mime_type, byte_size, uploaded_by, upload_token
) VALUES ('vote', $1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (upload_token) DO NOTHING
RETURNING id
`;

export class VoteDocumentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

type ChunkInput = {
  uploadId: string;
  chunkIndex: number;
  chunkCount: number;
  filename: string;
  byteSize: number;
  bytes: Uint8Array;
};

export async function acceptVoteDocumentChunk(
  user: Member,
  voteId: string,
  input: ChunkInput,
): Promise<{ done: boolean; id?: string }> {
  if (user.role !== "admin" || user.status !== "active") {
    throw new VoteDocumentError("Only an admin can add documents to a vote.", 403);
  }
  if (!isUuid(voteId) || !isUuid(input.uploadId)) {
    throw new VoteDocumentError("That vote does not exist.", 404);
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0) {
    throw new VoteDocumentError("The file is empty.", 400);
  }
  const expectedCount = chunkCountFor(input.byteSize);
  if (input.chunkCount !== expectedCount || input.chunkCount > 16) {
    throw new VoteDocumentError("That upload was incomplete. Choose the file again.", 400);
  }
  const expectedLength = expectedChunkLength(input.byteSize, input.chunkIndex);
  if (expectedLength === null || input.bytes.byteLength !== expectedLength) {
    throw new VoteDocumentError("That upload was incomplete. Choose the file again.", 400);
  }
  if (input.bytes.byteLength > VOTE_DOCUMENT_CHUNK_BYTES) {
    throw new VoteDocumentError("That part of the upload is too large.", 400);
  }

  const existing = await attachmentForToken(input.uploadId);
  if (existing) {
    if (existing.parent_id !== voteId) {
      throw new VoteDocumentError("That upload does not belong to this vote.", 409);
    }
    return { done: true, id: existing.id };
  }

  await sweepExpiredSessions(user.id);
  await ensureSession(user, voteId, input);
  const partKey = chunkKey(input.uploadId, input.chunkIndex);
  await storagePut(partKey, Buffer.from(input.bytes), "application/octet-stream");

  for (let index = 0; index < input.chunkCount; index += 1) {
    if (!(await storageExists(chunkKey(input.uploadId, index)))) {
      return { done: false };
    }
  }

  const parts: Uint8Array[] = [];
  for (let index = 0; index < input.chunkCount; index += 1) {
    parts.push(new Uint8Array(await storageGet(chunkKey(input.uploadId, index))));
  }
  const bytes = concatBytes(parts);
  if (bytes.byteLength !== input.byteSize) {
    await discardSession(input.uploadId, input.chunkCount);
    throw new VoteDocumentError("That upload was incomplete. Choose the file again.", 400);
  }

  try {
    const saved = await storeVoteDocumentBytes({
      user,
      voteId,
      uploadToken: input.uploadId,
      filename: input.filename,
      declaredMime: "",
      bytes,
    });
    await discardSession(input.uploadId, input.chunkCount).catch((error) => {
      console.error("[vote-documents] cleanup", error instanceof Error ? error.message.split("\n")[0] : error);
    });
    return { done: true, id: saved.id };
  } catch (error) {
    await discardSession(input.uploadId, input.chunkCount).catch(() => undefined);
    throw error;
  }
}

export async function storeVoteDocumentBytes(input: {
  user: Member;
  voteId: string;
  uploadToken: string;
  filename: string;
  declaredMime: string;
  bytes: Uint8Array;
}): Promise<{ id: string; duplicate: boolean }> {
  if (input.user.role !== "admin" || input.user.status !== "active") {
    throw new VoteDocumentError("Only an admin can add documents to a vote.", 403);
  }
  const already = await attachmentForToken(input.uploadToken);
  if (already) {
    if (already.parent_id !== input.voteId) {
      throw new VoteDocumentError("That upload does not belong to this vote.", 409);
    }
    return { id: already.id, duplicate: true };
  }
  const inspected = inspectVoteDocument(input.filename, input.declaredMime, input.bytes);
  if (!inspected.ok) throw new VoteDocumentError(inspected.problem, 400);
  const key = `attachments/vote/${input.voteId}/${input.uploadToken}-${inspected.document.filename}`;
  await storagePut(key, Buffer.from(input.bytes), inspected.document.mime);
  try {
    return await withTx(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`vote-docs:${input.voteId}`]);
      const prior = await client.query<{ id: string; parent_id: string }>(
        `SELECT id, parent_id FROM attachments WHERE upload_token = $1`,
        [input.uploadToken],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].parent_id !== input.voteId) {
          throw new VoteDocumentError("That upload does not belong to this vote.", 409);
        }
        return { id: prior.rows[0].id, duplicate: true };
      }
      const vote = await client.query<{ status: string }>(`SELECT status FROM votes WHERE id = $1`, [input.voteId]);
      if (!vote.rows[0]) throw new VoteDocumentError("That vote does not exist.", 404);
      if (vote.rows[0].status !== "open") {
        throw new VoteDocumentError("This vote is closed. Documents already attached stay as they are.", 409);
      }
      const totals = await client.query<{ count: number; bytes: string | number }>(
        `SELECT count(*)::int AS count, coalesce(sum(byte_size), 0)::bigint AS bytes
         FROM attachments
         WHERE parent_type = 'vote' AND parent_id = $1`,
        [input.voteId],
      );
      const problem = quotaProblem(totals.rows[0]?.count ?? 0, Number(totals.rows[0]?.bytes ?? 0), [input.bytes.byteLength]);
      if (problem) throw new VoteDocumentError(problem, 400);
      const inserted = await client.query<{ id: string }>(INSERT_VOTE_ATTACHMENT, [
        input.voteId,
        key,
        inspected.document.filename,
        inspected.document.mime,
        input.bytes.byteLength,
        input.user.id,
        input.uploadToken,
      ]);
      if (inserted.rows[0]) return { id: inserted.rows[0].id, duplicate: false };
      const again = await client.query<{ id: string; parent_id: string }>(
        `SELECT id, parent_id FROM attachments WHERE upload_token = $1`,
        [input.uploadToken],
      );
      if (!again.rows[0] || again.rows[0].parent_id !== input.voteId) {
        throw new VoteDocumentError("The document could not be added.", 409);
      }
      return { id: again.rows[0].id, duplicate: true };
    });
  } catch (error) {
    const still = await pool.query(`SELECT 1 FROM attachments WHERE storage_key = $1`, [key]);
    if (!still.rows[0]) await storageDelete(key);
    throw error;
  }
}

async function ensureSession(user: Member, voteId: string, input: ChunkInput): Promise<void> {
  const vote = await pool.query<{ status: string }>(`SELECT status FROM votes WHERE id = $1`, [voteId]);
  if (!vote.rows[0]) throw new VoteDocumentError("That vote does not exist.", 404);
  if (vote.rows[0].status !== "open") {
    throw new VoteDocumentError("This vote is closed. Documents already attached stay as they are.", 409);
  }
  const totals = await pool.query<{ count: number; bytes: string | number }>(
    `SELECT count(*)::int AS count, coalesce(sum(byte_size), 0)::bigint AS bytes
     FROM attachments WHERE parent_type = 'vote' AND parent_id = $1`,
    [voteId],
  );
  const problem = quotaProblem(totals.rows[0]?.count ?? 0, Number(totals.rows[0]?.bytes ?? 0), [input.byteSize]);
  if (problem) throw new VoteDocumentError(problem, 400);
  const head = input.chunkIndex === 0 ? input.bytes : new Uint8Array();
  if (input.chunkIndex === 0) {
    const sniffed = inspectVoteDocument(input.filename, "", head, { partial: true });
    if (!sniffed.ok) throw new VoteDocumentError(sniffed.problem, 400);
  }
  await pool.query(
    `INSERT INTO upload_sessions (id, profile_id, vote_id, filename, mime_type, byte_size, chunk_count, expires_at)
     VALUES ($1, $2, $3, $4, 'application/octet-stream', $5, $6, now() + interval '24 hours')
     ON CONFLICT (id) DO NOTHING`,
    [input.uploadId, user.id, voteId, input.filename.slice(0, 300), input.byteSize, input.chunkCount],
  );
  const { rows } = await pool.query<{
    profile_id: string;
    vote_id: string;
    filename: string;
    byte_size: number;
    chunk_count: number;
    expires_at: Date;
  }>(
    `SELECT profile_id, vote_id, filename, byte_size, chunk_count, expires_at
     FROM upload_sessions WHERE id = $1`,
    [input.uploadId],
  );
  const session = rows[0];
  if (!session) throw new VoteDocumentError("That upload expired. Choose the file again.", 400);
  if (session.expires_at.getTime() <= Date.now()) {
    await discardSession(input.uploadId, session.chunk_count);
    throw new VoteDocumentError("That upload expired. Choose the file again.", 400);
  }
  if (session.profile_id !== user.id || session.vote_id !== voteId) {
    throw new VoteDocumentError("That upload does not belong to this vote.", 403);
  }
  if (session.byte_size !== input.byteSize || session.chunk_count !== input.chunkCount || session.filename !== input.filename.slice(0, 300)) {
    throw new VoteDocumentError("That upload does not match the file you chose.", 400);
  }
}

async function attachmentForToken(token: string): Promise<{ id: string; parent_id: string } | null> {
  const { rows } = await pool.query<{ id: string; parent_id: string }>(
    `SELECT id, parent_id FROM attachments WHERE upload_token = $1`,
    [token],
  );
  return rows[0] ?? null;
}

async function sweepExpiredSessions(profileId: string): Promise<void> {
  const { rows } = await pool.query<{ id: string; chunk_count: number }>(
    `DELETE FROM upload_sessions
     WHERE profile_id = $1 AND expires_at < now()
     RETURNING id, chunk_count`,
    [profileId],
  );
  for (const row of rows) await discardChunks(row.id, row.chunk_count);
}

async function discardSession(uploadId: string, chunkCount: number): Promise<void> {
  await pool.query(`DELETE FROM upload_sessions WHERE id = $1`, [uploadId]);
  await discardChunks(uploadId, chunkCount);
}

async function discardChunks(uploadId: string, chunkCount: number): Promise<void> {
  for (let index = 0; index < chunkCount; index += 1) {
    await storageDelete(chunkKey(uploadId, index));
  }
}

function chunkKey(uploadId: string, index: number): string {
  return `pending-uploads/${uploadId}/part-${index}`;
}

export function newUploadToken(): string {
  return randomUUID();
}
