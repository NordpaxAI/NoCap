import { randomBytes, createHash } from "crypto";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import { Pool, type PoolClient } from "pg";
import { pgPoolConfig } from "../lib/database-url";
import { env } from "../lib/env";
import { publicationPdf, publicationPdfKey, seedDocuments } from "../lib/seed-files";
import { storagePutSeed } from "../lib/storage";
import { loadEnv } from "./load-env";

loadEnv();

const PASSWORD = "example-password";

type Person = {
  email: string;
  name: string;
  role: "admin" | "member";
  status?: "active" | "deactivated";
  firm: string;
  city: string;
  jurisdiction: string;
  publicRole: string;
  practice: string;
  bio: string;
  contacts: string;
};

const people: Person[] = [
  {
    email: "paolo.piccirilli@example.invalid",
    name: "Paolo Piccirilli",
    role: "admin",
    firm: "Example firm",
    city: "Rome",
    jurisdiction: "Italy",
    publicRole: "Chair (example)",
    practice: "Example practice area",
    bio: "Example profile from the members-area mockup. Not a real biography.",
    contacts: "example-contact",
  },
  {
    email: "elena.rossi@example.invalid",
    name: "Elena Rossi",
    role: "member",
    firm: "Example firm",
    city: "Milan",
    jurisdiction: "Italy",
    publicRole: "Senior Associate · M&A",
    practice: "Private equity and carve-outs",
    bio: "Private equity and carve-outs in the industrial mid-market. Two years in New York before returning to Milan.",
    contacts: "example-contact",
  },
  {
    email: "lukas.brandt@example.invalid",
    name: "Lukas Brandt",
    role: "member",
    firm: "Example firm",
    city: "Frankfurt",
    jurisdiction: "Germany",
    publicRole: "Counsel · Corporate",
    practice: "Foreign investment screening and public M&A",
    bio: "Cross-border acquisitions with a focus on foreign investment screening and public M&A.",
    contacts: "example-contact",
  },
  {
    email: "sofie.jansen@example.invalid",
    name: "Sofie Jansen",
    role: "member",
    firm: "Example firm",
    city: "Amsterdam",
    jurisdiction: "Netherlands",
    publicRole: "Senior Associate · Transactions",
    practice: "Buy-side private equity",
    bio: "Buy-side private equity and W&I-backed deals across the Benelux.",
    contacts: "example-contact",
  },
  {
    email: "camille.baptiste@example.invalid",
    name: "Camille Baptiste",
    role: "member",
    firm: "Example firm",
    city: "Paris",
    jurisdiction: "France",
    publicRole: "Managing Associate · Private Equity",
    practice: "Sponsor-side private equity",
    bio: "Sponsor-side work in the French mid-market, with a standing interest in how technology reaches the deal table.",
    contacts: "example-contact",
  },
  {
    email: "andres.vidal@example.invalid",
    name: "Andrés Vidal",
    role: "member",
    firm: "Example firm",
    city: "Madrid",
    jurisdiction: "Spain",
    publicRole: "Junior Partner · Corporate",
    practice: "Growth equity and venture",
    bio: "Growth equity and venture transactions, with a practice split between Madrid and Lisbon.",
    contacts: "example-contact",
  },
  {
    email: "erik.lindqvist@example.invalid",
    name: "Erik Lindqvist",
    role: "member",
    firm: "Example firm",
    city: "Stockholm",
    jurisdiction: "Sweden",
    publicRole: "Associate · M&A",
    practice: "Nordic sell-side processes",
    bio: "Nordic sell-side processes and cross-border auctions, mostly in technology and healthcare.",
    contacts: "example-contact",
  },
  {
    email: "clara.example@example.invalid",
    name: "Clara Example",
    role: "member",
    firm: "Example firm",
    city: "Lisbon",
    jurisdiction: "Portugal",
    publicRole: "Associate · Corporate (example)",
    practice: "Example practice",
    bio: "Example of a member who has left. This profile must not appear on the public members page.",
    contacts: "example-contact",
  },
];

const publications = [
  ["deal-terms-locked-box", "Deal terms", "Locked box or closing accounts: what the mid-market actually chose this year", "Settled in theory, unsettled in practice. Where each mechanism is holding, and the leakage drafting that keeps causing arguments.", "Elena Rossi", "2026-03-12", true],
  ["regulatory-german-fdi", "Regulatory", "German FDI screening: the questions that actually delay signing", "Filing is rarely the problem. The timetable slips on the three information requests that come after — and they are largely predictable.", "Lukas Brandt", "2026-02-18", false],
  ["risk-wi-retention", "Risk allocation", "W&I retention levels are moving. Slowly.", "What brokers are quoting across five European markets, and why the nil-retention product is still harder to get than everyone assumes.", "Sofie Jansen", "2026-02-04", false],
  ["structuring-earn-outs", "Structuring", "Earn-outs are back. The drafting hasn't caught up.", "Post-closing conduct covenants are still negotiated as boilerplate, and that is where the disputes are coming from.", "Andrés Vidal", "2026-01-20", false],
  ["practice-ai-deal-process", "Practice", "What AI actually changed in our deal process", "Not the drafting. A candid account of where the tools help on a live transaction, and where they quietly cost time.", "Camille Baptiste", "2026-01-09", false],
  ["cross-border-nordic-habits", "Cross-border", "Nordic sellers, continental buyers: five habits that clash", "Disclosure culture, warranty expectations and the meaning of \"agreed form\" travel worse than anyone expects.", "Erik Lindqvist", "2025-12-11", false],
] as const;

export async function seedDatabase(options: { reset: boolean }): Promise<boolean> {
  if (!env.demoMode()) {
    console.log("DEMO_MODE is not true or 1. Example data was not written.");
    return false;
  }
  const pool = new Pool(pgPoolConfig(env.ownerDatabaseUrl(), 1));
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(48291001)`);
    if (!options.reset) {
      const existing = await client.query(`SELECT 1 FROM profiles WHERE email = $1`, [
        "paolo.piccirilli@example.invalid",
      ]);
      if (existing.rowCount) {
        console.log("Demo data already present. Seed skipped.");
        return true;
      }
    }
    await client.query("BEGIN");
    await client.query(`SELECT set_config('nocap.register_write', 'on', true)`);
    await writeSeed(client, options.reset);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function writeSeed(client: PoolClient, reset: boolean): Promise<void> {
  const storageDir = process.env.STORAGE_LOCAL_DIR || "./var/storage";
  if (reset && env.storageDriver() === "local") {
    await rm(storageDir, { recursive: true, force: true });
    await rm(path.join("var", "emails"), { recursive: true, force: true });
    await mkdir(storageDir, { recursive: true });
    await mkdir(path.join("var", "emails"), { recursive: true });
  }

  await client.query(`
    TRUNCATE
      upload_sessions,
      resolutions, ballots, vote_electorate, votes,
      attachments, question_comments, questions,
      document_versions, documents,
      publications, applications,
      auth_tokens, sessions, profiles, email_log, create_guards
    RESTART IDENTITY CASCADE
  `);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const ids = new Map<string, string>();

  for (const person of people) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO profiles (
         email, password_hash, role, status, display_name, firm, city, jurisdiction,
         public_role, practice_area, bio, contacts, is_example
       ) VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10,$11,true)
       RETURNING id`,
      [
        person.email,
        passwordHash,
        person.role,
        person.name,
        person.firm,
        person.city,
        person.jurisdiction,
        person.publicRole,
        person.practice,
        person.bio,
        person.contacts,
      ],
    );
    ids.set(person.name, rows[0].id);
  }

  const adminId = ids.get("Paolo Piccirilli")!;

  for (const document of seedDocuments) {
    const authorId = ids.get(document.author)!;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO documents (area, category, title, created_by, immutable, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        document.area,
        document.category,
        document.title,
        authorId,
        document.category === "resolution",
        document.createdAt,
      ],
    );
    const documentId = rows[0].id;
    let n = 1;
    for (const version of document.versions) {
      const body = Buffer.from(version.text);
      await storagePutSeed(version.key, body, "text/plain");
      await client.query(
        `INSERT INTO document_versions
           (document_id, version_number, storage_key, filename, mime_type, byte_size, uploaded_by, uploaded_at)
         VALUES ($1,$2,$3,$4,'text/plain',$5,$6,$7)`,
        [documentId, n, version.key, version.filename, body.length, authorId, version.at],
      );
      n += 1;
    }
  }

  for (const [slug, category, title, summary, author, published, withPdf] of publications) {
    let pdfKey: string | null = null;
    if (withPdf) {
      pdfKey = publicationPdfKey(slug);
      await storagePutSeed(pdfKey, await publicationPdf(title), "application/pdf");
    }
    const body =
      "Example text from the design mockup. This is not a real publication.\n\n" +
      summary +
      "\n\nThe detail format — this page, and an optional PDF — is a placeholder. It is still an open decision.";
    await client.query(
      `INSERT INTO publications (slug, title, category, summary, body, author_id, published_on, pdf_key, is_example)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [slug, title, category, summary, body, ids.get(author), published, pdfKey],
    );
  }

  const questionId = (await client.query<{ id: string }>(
    `INSERT INTO questions (author_id, title, body, created_at)
     VALUES ($1, $2, $3, '2026-08-24T09:00:00Z') RETURNING id`,
    [
      ids.get("Elena Rossi"),
      "Annual meeting — venue options",
      "Example question. Where should the annual meeting be held, and does anyone have a room we can use without a fee?",
    ],
  )).rows[0].id;
  await client.query(
    `INSERT INTO question_comments (question_id, author_id, body, created_at) VALUES
       ($1, $2, 'Example reply. Lisbon is easy to reach and I can ask about a room.', '2026-08-24T11:00:00Z'),
       ($1, $3, 'Example reply from a member who later left. This comment stays in the thread.', '2026-08-24T15:00:00Z')`,
    [questionId, ids.get("Lukas Brandt"), ids.get("Clara Example")],
  );

  const openQuestion = (await client.query<{ id: string }>(
    `INSERT INTO questions (author_id, title, body, deadline, created_at)
     VALUES ($1, $2, $3, now() + interval '21 days', now() - interval '2 days') RETURNING id`,
    [
      ids.get("Sofie Jansen"),
      "Example: which market note should we write next?",
      "Example question with a deadline. Reply if you would read a short note on warranty insurance.",
    ],
  )).rows[0].id;
  await client.query(
    `INSERT INTO question_comments (question_id, author_id, body) VALUES ($1, $2, 'Example reply. I would read it.')`,
    [openQuestion, ids.get("Erik Lindqvist")],
  );

  async function openAndMaybeClose(options: {
    subject: string;
    description: string;
    qc: number;
    qd: number;
    deadline: string;
    votes: { name: string; choice: "for" | "against" | "abstain"; at?: string }[];
    close?: { opened: string; closed: string };
  }) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT private.open_vote($1, $2, $3, $4::timestamptz, $5, $6) AS id`,
      [adminId, options.subject, options.description, options.deadline, options.qc, options.qd],
    );
    const voteId = rows[0].id;
    for (const vote of options.votes) {
      await client.query(
        `INSERT INTO ballots (vote_id, voter_id, choice, cast_at) VALUES ($1, $2, $3, coalesce($4::timestamptz, now()))`,
        [voteId, ids.get(vote.name), vote.choice, vote.at ?? null],
      );
    }
    if (options.close) {
      await client.query(`SELECT private.seed_close_vote($1, $2::timestamptz, $3::timestamptz)`, [
        voteId,
        options.close.opened,
        options.close.closed,
      ]);
    }
    return voteId;
  }

  await openAndMaybeClose({
    subject: "Adoption of the code of conduct",
    description: "Example closed vote. The code of conduct circulated on 18 August is put to the members.",
    qc: 50,
    qd: 50,
    deadline: new Date(Date.now() + 73 * 60 * 60 * 1000).toISOString(),
    votes: [
      ...["Paolo Piccirilli", "Elena Rossi", "Lukas Brandt", "Sofie Jansen", "Camille Baptiste", "Andrés Vidal", "Erik Lindqvist"].map(
        (name) => ({ name, choice: "for" as const, at: "2026-08-18T16:00:00Z" }),
      ),
      { name: "Clara Example", choice: "abstain" as const, at: "2026-08-18T16:30:00Z" },
    ],
    close: { opened: "2026-08-18T09:00:00Z", closed: "2026-08-18T18:00:00Z" },
  });

  await client.query(`SELECT private.set_member_status($1, $2, 'deactivated')`, [
    adminId,
    ids.get("Clara Example"),
  ]);

  await openAndMaybeClose({
    subject: "Example: quorum not met",
    description:
      "Example closed vote. One member voted. The constitutive quorum was 90 percent, so the result is invalid whatever the votes say.",
    qc: 90,
    qd: 50,
    deadline: new Date(Date.now() + 73 * 60 * 60 * 1000).toISOString(),
    votes: [{ name: "Paolo Piccirilli", choice: "for", at: "2026-09-01T10:00:00Z" }],
    close: { opened: "2026-09-01T09:00:00Z", closed: "2026-09-01T18:00:00Z" },
  });

  await openAndMaybeClose({
    subject: "Example: majority not reached",
    description:
      "Example closed vote. Everyone voted. The constitutive quorum was met, and the share in favour was below the deliberative quorum, so the majority was not reached.",
    qc: 50,
    qd: 80,
    deadline: new Date(Date.now() + 73 * 60 * 60 * 1000).toISOString(),
    votes: [
      { name: "Paolo Piccirilli", choice: "for", at: "2026-09-02T10:00:00Z" },
      { name: "Elena Rossi", choice: "for", at: "2026-09-02T10:05:00Z" },
      { name: "Lukas Brandt", choice: "for", at: "2026-09-02T10:10:00Z" },
      { name: "Sofie Jansen", choice: "for", at: "2026-09-02T10:15:00Z" },
      { name: "Camille Baptiste", choice: "against", at: "2026-09-02T10:20:00Z" },
      { name: "Andrés Vidal", choice: "against", at: "2026-09-02T10:25:00Z" },
      { name: "Erik Lindqvist", choice: "against", at: "2026-09-02T10:30:00Z" },
    ],
    close: { opened: "2026-09-02T09:00:00Z", closed: "2026-09-02T18:00:00Z" },
  });

  await openAndMaybeClose({
    subject: "Admission of a nominated candidate",
    description:
      "Example vote, still open. Nomination of a corporate M&A senior associate in Stockholm, proposed by Elena and seconded by Lukas. The CV in this example is not a real document. Admission in this example uses the quorums set below, not a rule copied from a charter.",
    qc: 50,
    qd: 67,
    deadline: new Date(
      Math.max(Date.parse("2026-10-15T18:00:00+02:00"), Date.now() + 73 * 60 * 60 * 1000),
    ).toISOString(),
    votes: [
      { name: "Elena Rossi", choice: "for" },
      { name: "Lukas Brandt", choice: "for" },
      { name: "Sofie Jansen", choice: "for" },
      { name: "Camille Baptiste", choice: "against" },
    ],
  });

  const pollId = (
    await client.query<{ id: string }>(
      `SELECT private.open_poll($1, $2, $3, $4::timestamptz, $5, false, $6::text[]) AS id`,
      [
        adminId,
        "Example poll: where should the annual meeting be held?",
        "Example poll. One choice. The result is the count for each place, not a for-or-against resolution.",
        new Date(Date.now() + 73 * 60 * 60 * 1000).toISOString(),
        50,
        ["Rome", "Milan", "A video call"],
      ],
    )
  ).rows[0].id;
  const pollVotes: [string, string, string][] = [
    ["Paolo Piccirilli", "Rome", "2026-09-11T10:00:00Z"],
    ["Elena Rossi", "Rome", "2026-09-11T10:05:00Z"],
    ["Lukas Brandt", "Milan", "2026-09-11T10:10:00Z"],
    ["Sofie Jansen", "Milan", "2026-09-11T10:15:00Z"],
    ["Camille Baptiste", "A video call", "2026-09-11T10:20:00Z"],
    ["Andrés Vidal", "A video call", "2026-09-11T10:25:00Z"],
  ];
  await client.query(`SELECT set_config('nocap.poll_write', 'on', true)`);
  for (const [name, label, at] of pollVotes) {
    await client.query(
      `INSERT INTO poll_ballots (vote_id, voter_id, cast_at) VALUES ($1, $2, $3::timestamptz)`,
      [pollId, ids.get(name), at],
    );
    await client.query(
      `INSERT INTO poll_answers (vote_id, voter_id, option_id)
       SELECT $1, $2, id FROM vote_options WHERE vote_id = $1 AND label = $3`,
      [pollId, ids.get(name), label],
    );
  }
  await client.query(`SELECT set_config('nocap.poll_write', 'off', true)`);
  await client.query(`SELECT private.seed_close_vote($1, $2::timestamptz, $3::timestamptz)`, [
    pollId,
    "2026-09-10T09:00:00Z",
    "2026-09-12T18:00:00Z",
  ]);

  const inviteToken = randomBytes(32).toString("base64url");
  const inviteHash = createHash("sha256").update(inviteToken).digest("hex");
  await client.query(`SELECT private.invite_member($1, $2, $3, $4, now() + interval '14 days')`, [
    adminId,
    "new.member@example.invalid",
    "New Example",
    inviteHash,
  ]);
  const inviteUrl = `${env.appUrl()}/join/${inviteToken}`;
  const inviteText = `Hello New Example,\n\nYou have been invited to the nocap members' area.\n\n${inviteUrl}\n`;
  await client.query(
    `INSERT INTO email_log (id, created_at, recipients, subject, body) VALUES ($1, now(), $2, $3, $4)`,
    ["seed-invite", ["new.member@example.invalid"], "You are invited to nocap", inviteText],
  );
  if (env.storageDriver() === "local") {
    await mkdir(path.join("var", "emails"), { recursive: true });
    await writeFile(
      path.join("var", "emails", "000-seed-invite.json"),
      JSON.stringify(
        {
          id: "seed-invite",
          at: new Date().toISOString(),
          to: ["new.member@example.invalid"],
          subject: "You are invited to nocap",
          text: inviteText,
        },
        null,
        2,
      ),
    );
  }

  console.log("Seeded example data.");
  console.log(`Admin login: paolo.piccirilli@example.invalid / ${PASSWORD}`);
  console.log(`Member login: elena.rossi@example.invalid / ${PASSWORD}`);
  console.log(`Pending invite: ${inviteUrl}`);
}

const entry = process.argv[1] || "";
if (entry.endsWith("seed.ts") || entry.endsWith("seed.js")) {
  seedDatabase({ reset: true }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
