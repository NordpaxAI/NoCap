"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pool, errorMessage, withTx } from "./db";
import { existingCreate, fileMark, fingerprint, formToken, rememberCreate } from "./idempotency";
import {
  checkPassword,
  clearSession,
  getCurrentUser,
  hashPassword,
  newToken,
  passwordProblem,
  requireAdmin,
  requireUser,
  startSession,
  tokenHash,
  type Member,
} from "./auth";
import { appLink, sendEmail } from "./email";
import { notifyMany } from "./notify";
import { env } from "./env";
import { readUpload, safeFilename, storageDelete, storagePut } from "./storage";
import { newUploadToken, storeVoteDocumentBytes } from "./vote-document-store";
import { VOTE_DOCUMENT_MAX_BYTES } from "./vote-documents";
import type { PoolClient } from "pg";
import { parseClubDateTime } from "./time";
import { closeDueVotes } from "./votes";
import { clientHash, recordAttempt, registrationState, tooManyAttempts } from "./registration";

function go(path: string, error?: string): never {
  const url = error ? `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}` : path;
  redirect(url);
}

async function guardedCreate(
  actorId: string,
  action: string,
  token: string | null,
  print: string,
  create: (client: PoolClient) => Promise<string>,
): Promise<{ id: string; duplicate: boolean }> {
  return withTx(async (client) => {
    const existing = await existingCreate(client, actorId, action, token, print);
    if (existing) return { id: existing, duplicate: true };
    const id = await create(client);
    await rememberCreate(client, actorId, action, token, print, id);
    return { id, duplicate: false };
  });
}

async function removeStored(keys: string[] | null): Promise<void> {
  for (const key of keys ?? []) {
    if (key) await storageDelete(key);
  }
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const { rows } = await pool.query<{ id: string; password_hash: string | null; status: string }>(
    `SELECT id, password_hash, status FROM profiles WHERE email = $1`,
    [email],
  );
  const profile = rows[0];
  if (!profile || profile.status !== "active" || !profile.password_hash) {
    go("/login", "Those details are not recognised.");
  }
  const ok = await checkPassword(password, profile.password_hash);
  if (!ok) go("/login", "Those details are not recognised.");
  await startSession(profile.id);
  redirect("/area");
}

export async function logout() {
  await clearSession();
  redirect("/");
}

export async function requestReset(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const { rows } = await pool.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM profiles WHERE email = $1 AND status = 'active'`,
    [email],
  );
  const profile = rows[0];
  if (profile) {
    const { token, hash } = newToken();
    await pool.query(
      `INSERT INTO auth_tokens (profile_id, purpose, token_hash, expires_at)
       VALUES ($1, 'reset', $2, now() + interval '2 hours')`,
      [profile.id, hash],
    );
    await sendEmail({
      to: [email],
      subject: "Reset your nocap password",
      text:
        `Hello ${profile.display_name},\n\n` +
        `Use this link to choose a new password. It expires in two hours.\n\n` +
        `${appLink(`/reset/${token}`)}\n\n` +
        `If you did not ask for this, you can ignore the message.\n`,
    });
  }
  redirect("/reset?sent=1");
}

export async function setPasswordFromToken(formData: FormData) {
  const token = String(formData.get("token") || "");
  const purpose = String(formData.get("purpose") || "");
  const password = String(formData.get("password") || "");
  const problem = passwordProblem(password);
  const back = purpose === "invite" ? `/join/${token}` : `/reset/${token}`;
  if (problem) go(back, problem);
  try {
    const hash = await hashPassword(password);
    const fn = purpose === "invite" ? "private.accept_invite" : "private.reset_password";
    const { rows } = await pool.query<{ id: string }>(
      `SELECT ${fn}($1, $2) AS id`,
      [tokenHash(token), hash],
    );
    await startSession(rows[0].id);
  } catch (error) {
    go(back, errorMessage(error));
  }
  redirect("/area");
}

export async function setEmailNotifications(formData: FormData) {
  const user = await requireUser();
  const on = formData.get("email_notifications") === "on";
  await pool.query(`UPDATE profiles SET email_notifications = $2, updated_at = now() WHERE id = $1`, [user.id, on]);
  revalidatePath("/area/profile");
  // Author names appear on the public publications pages.
  revalidatePath("/publications", "layout");
  redirect("/area/profile?email=saved");
}

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const displayName = String(formData.get("display_name") || "").trim();
  if (!displayName) go("/area/profile", "Please enter your name.");
  let photoKey = user.photo_key;
  try {
    const photo = await readUpload(formData.get("photo"), { maxBytes: 8 * 1024 * 1024, kinds: "image" });
    if (photo) {
      const ext = photo.mime === "image/png" ? "png" : photo.mime === "image/webp" ? "webp" : "jpg";
      photoKey = `photos/${user.id}-${randomUUID()}.${ext}`;
      await storagePut(photoKey, photo.buffer, photo.mime);
    }
    await pool.query(
      `UPDATE profiles SET
         display_name = $2,
         firm = $3,
         city = $4,
         practice_area = $5,
         contacts = $6,
         public_role = $7,
         bio = $8,
         jurisdiction = $9,
         photo_key = $10,
         updated_at = now()
       WHERE id = $1`,
      [
        user.id,
        displayName,
        blank(formData.get("firm")),
        blank(formData.get("city")),
        blank(formData.get("practice_area")),
        blank(formData.get("contacts")),
        blank(formData.get("public_role")),
        blank(formData.get("bio")),
        blank(formData.get("jurisdiction")),
        photoKey,
      ],
    );
  } catch (error) {
    go("/area/profile", errorMessage(error));
  }
  revalidatePath("/area/profile");
  redirect("/area/profile?saved=1");
}

export async function submitApplication(formData: FormData) {
  if (String(formData.get("company_website") || "").trim()) {
    redirect("/membership?sent=1");
  }
  const name = String(formData.get("name") || "").trim();
  const firmAndCity = String(formData.get("firm_and_city") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const proposing = blank(formData.get("proposing_member"));
  const practice = String(formData.get("practice_description") || "").trim();
  const privacy = formData.get("privacy") === "on";
  if (!name || !firmAndCity || !email || !practice) {
    go("/membership", "Please complete every required field.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) go("/membership", "Enter a valid email address.");
  if (!privacy) go("/membership", "Please accept the privacy policy.");
  try {
    const cv = await readUpload(formData.get("cv"), { required: true, maxBytes: 5 * 1024 * 1024, kinds: "pdf" });
    const id = randomUUID();
    const cvKey = `applications/${id}/${cv!.filename}`;
    await storagePut(cvKey, cv!.buffer, cv!.mime);
    await pool.query(
      `INSERT INTO applications
         (id, name, firm_and_city, email, proposing_member, practice_description, cv_key, cv_filename, privacy_accepted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [id, name, firmAndCity, email, proposing, practice, cvKey, cv!.filename],
    );
    await sendEmail({
      to: [env.foundingCommitteeEmail()],
      subject: `Membership application — ${name}`,
      text:
        `A membership application has arrived.\n\n` +
        `Name: ${name}\n` +
        `Firm and city: ${firmAndCity}\n` +
        `Email: ${email}\n` +
        `Proposing member: ${proposing || "—"}\n\n` +
        `Practice:\n${practice}\n\n` +
        `The CV is stored with the application in the reserved area.\n` +
        `${appLink(`/area/applications/${id}`)}\n`,
    });
  } catch (error) {
    go("/membership", errorMessage(error));
  }
  redirect("/membership?sent=1");
}

export async function inviteMember(formData: FormData) {
  const admin = await requireAdmin();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    go("/area/admin", "Enter a name and a valid email.");
  }
  const submit = formToken(formData);
  const print = fingerprint(["invite", email, name]);
  let inviteToken = "";
  try {
    const outcome = await guardedCreate(admin.id, "invite", submit, print, async (client) => {
      const created = newToken();
      inviteToken = created.token;
      const { rows } = await client.query<{ invite_member: string }>(
        `SELECT private.invite_member($1, $2, $3, $4, now() + interval '14 days') AS invite_member`,
        [admin.id, email, name, created.hash],
      );
      return rows[0].invite_member;
    });
    if (!outcome.duplicate) {
      await sendEmail({
        to: [email],
        subject: "You are invited to nocap",
        text:
          `Hello ${name},\n\n` +
          `You have been invited to the nocap members' area. Use the link below to choose a password. ` +
          `It expires in 14 days.\n\n` +
          `${appLink(`/join/${inviteToken}`)}\n\n` +
          `There is no open signup. This link is only for you.\n`,
      });
    }
  } catch (error) {
    go("/area/admin", errorMessage(error));
  }
  revalidatePath("/area/admin");
  redirect("/area/admin?invited=1");
}

export async function registerMember(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const state = await registrationState();
  if (!state.open) go("/register");
  if (!name || !email) go("/register", "Please fill in every field.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) go("/register", "Please enter a valid email.");
  const problem = passwordProblem(password);
  if (problem) go("/register", problem);
  const client = await clientHash();
  if (await tooManyAttempts(client)) go("/register", "Too many attempts. Please wait 15 minutes and try again.");
  let id = "";
  try {
    const hash = await hashPassword(password);
    const { rows } = await pool.query<{ id: string }>(
      `SELECT private.register_member_open($1, $2, $3) AS id`,
      [email, name, hash],
    );
    id = rows[0].id;
  } catch (error) {
    await recordAttempt(client, false);
    const message = errorMessage(error);
    if (message.includes("closed")) go("/register");
    if (message.includes("details not accepted"))
      go("/register", "This email is already registered. Sign in instead, or ask an admin if you cannot get in.");
    go("/register", "We could not register you right now. Please try again, or ask an admin.");
  }
  await recordAttempt(client, true);
  await startSession(id);
  redirect("/area");
}

export async function setRegistration(formData: FormData) {
  const admin = await requireAdmin();
  const mode = String(formData.get("mode") || "");
  let open: boolean | null = null;
  if (mode === "open") open = true;
  else if (mode === "close") open = false;
  else go("/area/admin#registration", "Unknown action.");
  try {
    await pool.query(`SELECT private.set_registration($1, $2, $3)`, [admin.id, open, null]);
  } catch (error) {
    go("/area/admin#registration", errorMessage(error));
  }
  revalidatePath("/area/admin");
  revalidatePath("/register");
  redirect(`/area/admin?registration=${mode}#registration`);
}

export async function setMemberStatus(formData: FormData) {
  const admin = await requireAdmin();
  const target = String(formData.get("profile_id") || "");
  const status = String(formData.get("status") || "");
  try {
    await pool.query(`SELECT private.set_member_status($1, $2, $3)`, [admin.id, target, status]);
  } catch (error) {
    go("/area/admin", errorMessage(error));
  }
  revalidatePath("/area/admin");
  redirect("/area/admin");
}

export async function uploadShared(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) go("/area/documents?area=shared", "Give the document a title.");
  try {
    const file = await readUpload(formData.get("file"), { required: true, maxBytes: 4.5 * 1024 * 1024, kinds: "any" });
    await guardedCreate(
      user.id,
      "document",
      formToken(formData),
      fingerprint(["shared", title, fileMark(file)]),
      async (client) => {
        const documentId = randomUUID();
        const key = `documents/${documentId}/v1-${file!.filename}`;
        await storagePut(key, file!.buffer, file!.mime);
        try {
          await client.query(
            `INSERT INTO documents (id, area, category, title, created_by) VALUES ($1, 'shared', 'shared', $2, $3)`,
            [documentId, title, user.id],
          );
          await client.query(
            `INSERT INTO document_versions
               (document_id, version_number, storage_key, filename, mime_type, byte_size, uploaded_by)
             VALUES ($1, 1, $2, $3, $4, $5, $6)`,
            [documentId, key, file!.filename, file!.mime, file!.size, user.id],
          );
        } catch (error) {
          await storageDelete(key);
          throw error;
        }
        return documentId;
      },
    );
  } catch (error) {
    go("/area/documents?area=shared", errorMessage(error));
  }
  revalidatePath("/area/documents");
  redirect("/area/documents?area=shared");
}

export async function uploadSharedVersion(formData: FormData) {
  const user = await requireUser();
  const documentId = String(formData.get("document_id") || "");
  const back = `/area/documents/${documentId}`;
  try {
    const file = await readUpload(formData.get("file"), { required: true, maxBytes: 4.5 * 1024 * 1024, kinds: "any" });
    await guardedCreate(
      user.id,
      "document-version",
      formToken(formData),
      fingerprint(["shared-version", documentId, fileMark(file)]),
      async (client) => {
        const { rows } = await client.query<{ area: string; immutable: boolean }>(
          `SELECT area, immutable FROM documents WHERE id = $1`,
          [documentId],
        );
        const doc = rows[0];
        if (!doc || doc.area !== "shared" || doc.immutable) throw new Error("That document cannot take a new version.");
        const { rows: numbers } = await client.query<{ n: number }>(
          `SELECT (coalesce(max(version_number), 0) + 1)::int AS n FROM document_versions WHERE document_id = $1`,
          [documentId],
        );
        const version = numbers[0].n;
        const key = `documents/${documentId}/v${version}-${file!.filename}`;
        await storagePut(key, file!.buffer, file!.mime);
        try {
          await client.query(
            `INSERT INTO document_versions
               (document_id, version_number, storage_key, filename, mime_type, byte_size, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [documentId, version, key, file!.filename, file!.mime, file!.size, user.id],
          );
        } catch (error) {
          await storageDelete(key);
          throw error;
        }
        return documentId;
      },
    );
  } catch (error) {
    go(back, errorMessage(error));
  }
  revalidatePath(back);
  redirect(back);
}

export async function uploadRegister(formData: FormData) {
  const admin = await requireAdmin();
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "");
  const existing = String(formData.get("document_id") || "");
  if (!title && !existing) go("/area/documents", "Give the document a title.");
  try {
    const file = await readUpload(formData.get("file"), { required: true, maxBytes: 4.5 * 1024 * 1024, kinds: "any" });
    await guardedCreate(
      admin.id,
      existing ? "document-version" : "document",
      formToken(formData),
      fingerprint([existing || "register", category, title, fileMark(file)]),
      async (client) => {
        let documentId = existing;
        if (!documentId) {
          const { rows } = await client.query<{ id: string }>(
            `SELECT private.create_register_document($1, $2, $3) AS id`,
            [admin.id, category, title],
          );
          documentId = rows[0].id;
        }
        const key = `documents/${documentId}/${randomUUID()}-${file!.filename}`;
        await storagePut(key, file!.buffer, file!.mime);
        try {
          await client.query(`SELECT private.add_register_version($1, $2, $3, $4, $5, $6)`, [
            admin.id,
            documentId,
            key,
            file!.filename,
            file!.mime,
            file!.size,
          ]);
        } catch (error) {
          await storageDelete(key);
          throw error;
        }
        return documentId;
      },
    );
  } catch (error) {
    go("/area/documents", errorMessage(error));
  }
  revalidatePath("/area/documents");
  redirect("/area/documents");
}

export async function askQuestion(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const deadlineRaw = String(formData.get("deadline") || "").trim();
  if (!title || !body) go("/area/questions/new", "A question needs a title and a note.");
  let deadline: Date | null = null;
  if (deadlineRaw) {
    deadline = parseClubDateTime(deadlineRaw);
    if (deadline.getTime() <= Date.now()) go("/area/questions/new", "The deadline has to be in the future, or leave it blank.");
  }
  let id = "";
  try {
    const outcome = await guardedCreate(
      user.id,
      "question",
      formToken(formData),
      fingerprint(["question", title, body, deadline ? deadline.toISOString() : ""]),
      async (client) => {
        const questionId = randomUUID();
        await client.query(
          `INSERT INTO questions (id, author_id, title, body, deadline) VALUES ($1, $2, $3, $4, $5)`,
          [questionId, user.id, title, body, deadline],
        );
        return questionId;
      },
    );
    id = outcome.id;
    if (!outcome.duplicate) {
      await saveAttachments(formData, "question", id, user.id);
      const { rows } = await pool.query<{ id: string; email: string }>(
        `SELECT id, email FROM profiles WHERE status = 'active' AND id <> $1`,
        [user.id],
      );
      await notifyMany(
        rows.map((person) => ({
          recipientId: person.id,
          email: person.email,
          kind: "question_opened",
          title: `Question: ${title}`,
          body:
            `${user.display_name} opened a question.\n\n${title}\n\n${body}` +
            (deadline ? `\n\nDeadline: ${deadline.toISOString()}` : ""),
          href: `/area/questions/${id}`,
          eventKey: `question:${id}:opened:${person.id}`,
        })),
      );
    }
  } catch (error) {
    go("/area/questions/new", errorMessage(error));
  }
  revalidatePath("/area");
  redirect(`/area/questions/${id}`);
}

export async function replyToQuestion(formData: FormData) {
  const user = await requireUser();
  const questionId = String(formData.get("question_id") || "");
  const body = String(formData.get("body") || "").trim();
  const back = `/area/questions/${questionId}`;
  if (!body) go(back, "Write a reply before sending.");
  try {
    const { rows: questions } = await pool.query<{ id: string; title: string; author_id: string }>(
      `SELECT id, title, author_id FROM questions WHERE id = $1`,
      [questionId],
    );
    const question = questions[0];
    if (!question) go("/area/questions", "That question no longer exists.");
    const outcome = await guardedCreate(
      user.id,
      "reply",
      formToken(formData),
      fingerprint(["reply", questionId, body]),
      async (client) => {
        const commentId = randomUUID();
        await client.query(
          `INSERT INTO question_comments (id, question_id, author_id, body) VALUES ($1, $2, $3, $4)`,
          [commentId, questionId, user.id, body],
        );
        return commentId;
      },
    );
    if (!outcome.duplicate) {
      await saveAttachments(formData, "comment", outcome.id, user.id);
      if (question.author_id !== user.id) {
        const { rows: authors } = await pool.query<{ email: string }>(
          `SELECT email FROM profiles WHERE id = $1 AND status = 'active'`,
          [question.author_id],
        );
        const author = authors[0];
        if (author) {
          await notifyMany([
            {
              recipientId: question.author_id,
              email: author.email,
              kind: "question_reply",
              title: `Reply: ${question.title}`,
              body: `${user.display_name} replied.\n\n${body}`,
              href: back,
              eventKey: `question:${question.id}:reply:${outcome.id}:${question.author_id}`,
            },
          ]);
        }
      }
    }
  } catch (error) {
    go(back, errorMessage(error));
  }
  revalidatePath(back);
  redirect(back);
}

export async function remindQuestion(formData: FormData) {
  const user = await requireUser();
  const questionId = String(formData.get("question_id") || "");
  const { rows } = await pool.query<{ title: string; author_id: string; body: string }>(
    `SELECT title, author_id, body FROM questions WHERE id = $1`,
    [questionId],
  );
  const question = rows[0];
  if (!question || question.author_id !== user.id) {
    go(`/area/questions/${questionId}`, "Only the member who opened the question can send a reminder.");
  }
  const { rows: people } = await pool.query<{ email: string }>(
    `SELECT email FROM profiles WHERE status = 'active'`,
  );
  await sendEmail({
    to: people.map((person) => person.email),
    subject: `Reminder: ${question.title}`,
    text:
      `${user.display_name} asked for a reply.\n\n${question.title}\n\n${question.body}\n\n` +
      `${appLink(`/area/questions/${questionId}`)}\n`,
  });
  redirect(`/area/questions/${questionId}?reminded=1`);
}

export async function openVote(formData: FormData): Promise<{ id: string; duplicate: boolean } | { error: string } | void> {
  const admin = await requireAdmin();
  const defer = formData.get("defer_attachments") === "1";
  const fail = (message: string): { error: string } => {
    if (defer) return { error: message };
    go("/area/votes/new", message);
  };
  const kind = String(formData.get("kind") || "standard");
  const subject = String(formData.get("subject") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const deadlineRaw = String(formData.get("deadline") || "").trim();
  const qc = Number(formData.get("quorum_constitutive"));
  const qd = Number(formData.get("quorum_deliberative"));
  const poll = kind === "poll";
  const options = formData.getAll("option_label").map((value) => String(value).trim());
  const allowMultiple = formData.get("allow_multiple") === "on";
  const excluded = [...new Set(formData.getAll("exclude").map((value) => String(value)))].filter((value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  );
  if (kind !== "standard" && kind !== "poll") return fail("Choose a standard vote or a poll.");
  if (!subject || !description || !deadlineRaw) return fail("Subject, description and deadline are required.");
  if (!Number.isFinite(qc) || qc < 0 || qc > 100) {
    return fail("The constitutive quorum is a percentage from 0 to 100.");
  }
  if (!poll && (!Number.isFinite(qd) || qd < 0 || qd > 100)) {
    return fail("Both quorums are percentages from 0 to 100.");
  }
  if (poll && (options.length < 2 || options.length > 10)) {
    return fail("A poll needs between 2 and 10 options.");
  }
  let deadline: Date;
  try {
    deadline = parseClubDateTime(deadlineRaw);
  } catch (error) {
    return fail(errorMessage(error));
  }
  if (deadline.getTime() <= Date.now() + 48 * 60 * 60 * 1000) {
    return fail("A vote must stay open for longer than 48 hours, so both reminders can go out.");
  }
  let voteId = "";
  let duplicate = false;
  try {
    const outcome = await guardedCreate(
      admin.id,
      "vote",
      formToken(formData),
      fingerprint([
        kind,
        subject,
        description,
        deadline.toISOString(),
        qc,
        poll ? null : qd,
        poll ? options : [],
        allowMultiple,
        [...excluded].sort(),
      ]),
      async (client) => {
        const { rows } = poll
          ? await client.query<{ id: string }>(
              `SELECT private.open_poll($1, $2, $3, $4, $5, $6, $7) AS id`,
              [admin.id, subject, description, deadline, qc, allowMultiple, options],
            )
          : await client.query<{ id: string }>(
              `SELECT private.open_vote($1, $2, $3, $4, $5, $6) AS id`,
              [admin.id, subject, description, deadline, qc, qd],
            );
        const id = rows[0].id;
        if (excluded.length > 0) {
          await client.query(`SELECT private.exclude_from_new_vote($1, $2, $3::uuid[])`, [admin.id, id, excluded]);
        }
        return id;
      },
    );
    voteId = outcome.id;
    duplicate = outcome.duplicate;
    if (!outcome.duplicate && !defer) {
      await saveVoteDocumentsFromForm(formData, voteId, admin);
    }
    if (!outcome.duplicate) {
      const { rows: people } = await pool.query<{ id: string; email: string }>(
        `SELECT p.id, p.email
         FROM vote_electorate e
         JOIN profiles p ON p.id = e.profile_id
         WHERE e.vote_id = $1 AND p.id <> $2 AND p.status = 'active'`,
        [voteId, admin.id],
      );
      const rules = poll
        ? `Constitutive quorum: ${qc}% of eligible voters. A member who does not answer has not voted.\n` +
          `The deliberative quorum does not apply.\n` +
          `Options: ${options.join("; ")}.\n` +
          (allowMultiple ? `More than one option may be chosen.\n` : `Each voter chooses one option.\n`)
        : `Constitutive quorum: ${qc}% of eligible voters (abstentions count as participation).\n` +
          `Majority (deliberative quorum): ${qd}% For, calculated on For and Against only. Abstentions count for the constitutive quorum only.\n`;
      await notifyMany(
        people.map((person) => ({
          recipientId: person.id,
          email: person.email,
          kind: "vote_opened",
          title: `Vote open: ${subject}`,
          body:
            `A vote is open.\n\n${subject}\n\n${description}\n\n` +
            rules +
            `Deadline: ${deadline.toISOString()}\n\n` +
            `The vote is open: every member can see who voted what. A vote cannot be changed once cast.`,
          href: `/area/votes/${voteId}`,
          eventKey: `vote:${voteId}:opened:${person.id}`,
        })),
      );
    }
  } catch (error) {
    return fail(errorMessage(error));
  }
  revalidatePath("/area");
  if (defer) return { id: voteId, duplicate };
  redirect(`/area/votes/${voteId}`);
}

export async function castVote(formData: FormData) {
  const user = await requireUser();
  await closeDueVotes();
  const voteId = String(formData.get("vote_id") || "");
  const choice = String(formData.get("choice") || "");
  const optionIds = formData.getAll("option_id").map((value) => String(value)).filter(Boolean);
  const back = `/area/votes/${voteId}`;
  try {
    const { rows } = await pool.query<{ kind: string }>(
      `SELECT kind FROM votes WHERE id = $1`,
      [voteId],
    );
    const vote = rows[0];
    if (!vote) go(back, "That vote does not exist.");
    if (vote.kind === "poll") {
      if (optionIds.length === 0) go(back, "Choose at least one option.");
      await pool.query(`SELECT private.cast_poll($1, $2, $3)`, [user.id, voteId, optionIds]);
    } else {
      if (!["for", "against", "abstain"].includes(choice)) go(back, "Choose for, against or abstain.");
      const eligible = await pool.query(
        `SELECT 1 FROM vote_electorate WHERE vote_id = $1 AND profile_id = $2`,
        [voteId, user.id],
      );
      if (!eligible.rows[0]) go(back, "You are not on the list of eligible voters for this vote.");
      await pool.query(
        `INSERT INTO ballots (vote_id, voter_id, choice) VALUES ($1, $2, $3)`,
        [voteId, user.id, choice],
      );
    }
  } catch (error) {
    const message = errorMessage(error);
    if (/duplicate key/i.test(message) || /already voted/i.test(message)) {
      go(back, "You have already voted. A vote cannot be changed.");
    }
    go(back, message);
  }
  revalidatePath(back);
  redirect(back);
}

export async function remindVoters(formData: FormData) {
  const admin = await requireAdmin();
  await closeDueVotes();
  const voteId = String(formData.get("vote_id") || "");
  const { rows: votes } = await pool.query<{ subject: string; status: string }>(
    `SELECT subject, status FROM votes WHERE id = $1`,
    [voteId],
  );
  const vote = votes[0];
  if (!vote || vote.status !== "open") go(`/area/votes/${voteId}`, "This vote is not open.");
  const { rows } = await pool.query<{ email: string }>(
    `SELECT p.email
     FROM vote_electorate e
     JOIN profiles p ON p.id = e.profile_id
     WHERE e.vote_id = $1
       AND NOT EXISTS (SELECT 1 FROM ballots b WHERE b.vote_id = e.vote_id AND b.voter_id = e.profile_id)
       AND NOT EXISTS (SELECT 1 FROM poll_ballots pb WHERE pb.vote_id = e.vote_id AND pb.voter_id = e.profile_id)`,
    [voteId],
  );
  if (rows.length === 0) go(`/area/votes/${voteId}`, "Everyone eligible has voted.");
  await sendEmail({
    to: rows.map((row) => row.email),
    subject: `Reminder: ${vote.subject}`,
    text:
      `${admin.display_name} asked members who have not yet voted to do so.\n\n` +
      `${vote.subject}\n\n${appLink(`/area/votes/${voteId}`)}\n`,
  });
  redirect(`/area/votes/${voteId}?reminded=1`);
}

export async function deleteVote(formData: FormData) {
  const admin = await requireAdmin();
  const voteId = String(formData.get("vote_id") || "");
  const back = `/area/votes/${voteId}`;
  try {
    const { rows } = await pool.query<{ delete_open_vote: string[] }>(
      `SELECT private.delete_open_vote($1, $2) AS delete_open_vote`,
      [admin.id, voteId],
    );
    await removeStored(rows[0]?.delete_open_vote ?? []);
  } catch (error) {
    const message = errorMessage(error);
    if (/already been deleted/i.test(message)) redirect("/area/votes");
    go(back, message);
  }
  revalidatePath("/area");
  revalidatePath("/area/votes");
  redirect("/area/votes");
}

export async function deleteQuestion(formData: FormData) {
  const user = await requireUser();
  const questionId = String(formData.get("question_id") || "");
  const back = `/area/questions/${questionId}`;
  try {
    const { rows } = await pool.query<{ delete_question: string[] }>(
      `SELECT private.delete_question($1, $2) AS delete_question`,
      [user.id, questionId],
    );
    await removeStored(rows[0]?.delete_question ?? []);
  } catch (error) {
    const message = errorMessage(error);
    if (/already been deleted/i.test(message)) redirect("/area/questions");
    go(back, message);
  }
  revalidatePath("/area");
  revalidatePath("/area/questions");
  redirect("/area/questions");
}

export async function createPublication(formData: FormData) {
  const admin = await requireAdmin();
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const summary = String(formData.get("summary") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const authorId = String(formData.get("author_id") || "") || null;
  const published = String(formData.get("published_on") || "");
  if (!title || !category || !summary || !body || !published) {
    go("/area/publications/new", "Title, category, summary, text and date are required.");
  }
  const slug = slugify(title);
  let pdfKey: string | null = null;
  try {
    const pdf = await readUpload(formData.get("pdf"), { maxBytes: 4.5 * 1024 * 1024, kinds: "pdf" });
    if (pdf) {
      pdfKey = `publications/${slug}-${pdf.filename}`;
      await storagePut(pdfKey, pdf.buffer, pdf.mime);
    }
    await pool.query(
      `SELECT private.create_publication($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [admin.id, slug, title, category, summary, body, authorId, published, pdfKey],
    );
  } catch (error) {
    go("/area/publications/new", errorMessage(error));
  }
  revalidatePath("/publications", "layout");
  revalidatePath("/");
  redirect(`/publications/${slug}`);
}

async function saveVoteDocumentsFromForm(formData: FormData, voteId: string, user: Member) {
  for (const entry of formData.getAll("attachments")) {
    const file = await readUpload(entry, { maxBytes: VOTE_DOCUMENT_MAX_BYTES, kinds: "any" });
    if (!file) continue;
    await storeVoteDocumentBytes({
      user,
      voteId,
      uploadToken: newUploadToken(),
      filename: file.filename,
      declaredMime: file.mime,
      bytes: new Uint8Array(file.buffer),
    });
  }
}

async function saveAttachments(formData: FormData, parentType: string, parentId: string, userId: string) {
  const entries = formData.getAll("attachments");
  for (const entry of entries) {
    const file = await readUpload(entry, { maxBytes: 4.5 * 1024 * 1024, kinds: "any" });
    if (!file) continue;
    const key = `attachments/${parentType}/${parentId}/${randomUUID()}-${safeFilename(file.filename)}`;
    await storagePut(key, file.buffer, file.mime);
    await pool.query(
      `INSERT INTO attachments (parent_type, parent_id, storage_key, filename, mime_type, byte_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [parentType, parentId, key, file.filename, file.mime, file.size, userId],
    );
  }
}

function blank(value: FormDataEntryValue | null): string | null {
  const text = String(value || "").trim();
  return text ? text : null;
}

function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || `note-${Date.now()}`;
}

export async function refreshClosedVotes() {
  const user = await getCurrentUser();
  if (!user) return;
  await closeDueVotes();
}

export async function markNotificationsRead() {
  const user = await requireUser();
  await pool.query(
    `UPDATE notifications SET read_at = now() WHERE recipient_id = $1 AND read_at IS NULL`,
    [user.id],
  );
}
