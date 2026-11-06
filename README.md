# nocap

Public website and members' reserved area for nocap, a private European circle of deal lawyers.

The functional specification is the source of truth. The public site and the reserved area follow that specification. Visual design follows the client's mockups: Outfit, Manrope and Instrument Serif on the public site; Inter and Newsreader in the reserved area.

## Stack

- **Next.js** (App Router) for the public pages and the reserved area. One process, server-rendered, easy to run in the EU.
- **PostgreSQL** for every record. The web process connects as `nocap_app`. Migrations and the seed connect as `nocap_owner`. Row Level Security allows only `nocap_app`. A future Supabase Data API, if pointed at this database, does not grant `anon` or `authenticated` any access.
- **Application sessions**, not a hosted auth product. An admin invites a member. The member sets a password from the email link. Password reset uses the same kind of link. This keeps the club off a single vendor's auth service.
- **Files** on local disk, or on any S3-compatible store (including Supabase Storage in an EU project).
- **Email** through a small adapter. `log` stores each message in the database (and in `var/emails` when the disk is writable). An admin reads them in the reserved area. `smtp` sends through any provider.

Postgres, the files and the mail adapter can all live in the EU. A full export is a zip of the documents and the resolutions register. Nothing required to read that archive lives only inside a vendor console.

## Local setup

Requirements: Node.js 22, PostgreSQL 16.

```bash
npm install
cp .env.example .env.local
npm run db:setup
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000.

Example data is written only when `DEMO_MODE` is `true` or `1`. `.env.example` ships `DEMO_MODE=0`. Set `DEMO_MODE=true` in `.env.local` before `npm run db:seed` or `npm run db:deploy` when you want the example members, votes and publications. Any other value, including unset, makes both commands skip the seed. Migrations still run.

`db:setup` creates the `nocap` database and the two local roles (`nocap_owner` / `nocap_app`, passwords `nocap_owner` / `nocap_app`). Change those passwords before any shared environment.

### Demo sign-in

Seeded people are examples. They are not real biographies.

| Who | Email | Password |
| --- | --- | --- |
| Admin (example chair) | `paolo.piccirilli@example.invalid` | `example-password` |
| Member | `elena.rossi@example.invalid` | `example-password` |

Clara Example is deactivated. She stays in the historical vote and in a question thread, and she does not appear on the public members page. A pending invite is written to `var/emails/000-seed-invite.json`.

Logged messages are listed at http://localhost:3000/dev/mail while `EMAIL_PROVIDER=log` and the app is not in production. The same log is in the reserved area at `/area/admin/outbox` (also `/admin/outbox`).

### What the seed contains

- Public pages with the mockup's example copy, marked as example where it is not a real fact.
- An official register (charter with three versions, code of conduct, minutes, one resolution) and a shared note.
- Example publications. One of them has an example PDF. The detail page is a placeholder.
- An open question, a closed vote that carried, a closed vote that is invalid because the constitutive quorum was not met, and an open admission vote.
- Dates are stored in UTC and shown in `APP_TIMEZONE` (default `Europe/Rome`).

`npm run verify` repeats the main flows against a running dev server: invite, set password, a profile edit that stays off the public members page, application, question email, frozen electorate, automatic close, both quorums (including the invalid case and abstentions in the deliberative count), database immutability, the PDF record, bulk download and the full export. It changes the database. Run `npm run db:seed` again afterwards to restore the demo.

## Reserved area

Sign-in is at `/login`. There is no open signup.

- **Profile.** Photo, role, biography, firm, city, practice area and contacts. Saving a profile does not change the public members page. That page reads `public_members`, which the migration fills with the original example people and their placeholder portraits (initials on a gradient, no photo file).
- **Documents.** Official register (admin uploads) and shared folder (any member uploads). Versions, title search, download, and a zip of the ticked files.
- **Questions.** Any member opens one. Replies are comments, with attachments and an optional deadline. The list shows Open or Closed beside the question, and the deadline when one is set. Opening notifies the other members (bell and email). A reply notifies the member who opened the question, unless they wrote the reply. The author can still send a manual reminder by email. The author can delete the question. That removes the replies, the attachments and the notifications.
- **Votes.** An admin opens a vote with a subject, a description, documents, a deadline, and a type. Several documents can be attached, including after the vote is open. Adding one does not change the subject, the options, the quorums or files already attached. Each file can be up to 25 MB (PDF, Word, Excel, PowerPoint, OpenDocument, RTF, text, CSV, Markdown, PNG, JPEG, GIF or WebP). A vote holds at most 20 documents and 200 MB. Members can preview a PDF, image or text file on the vote page, and can download every file. A closed vote cannot gain documents. The deadline has to be more than 48 hours away, so both automatic reminders can go out. Eligible voters are the active members at that moment, and the list does not change. A standard vote is For, Against and Abstain, with both quorums. A poll has 2 to 10 options written by the admin. Each voter picks one, unless multiple answers are allowed. A poll has no abstain choice: not answering means not voted. Only the constitutive quorum applies to a poll. The result is the count and share of ballots for each option, and a tie when the top count is shared. The vote is open: everyone can see who voted what. A ballot cannot be edited. The admin who opened it can delete it while it is open. A closed vote cannot be deleted. While the vote is open the page shows who has voted, who has not, and the deadline. The dashboard shows the count and the closing date. The admin can remind people who have not voted. A poll is not copied into the resolutions register.
- **Close.** At the deadline the vote closes when someone next opens the reserved area, downloads a record, or runs a full export, and on Netlify a scheduled function does the same every 10 minutes. That job also sends the 48-hour and 24-hour reminders while the vote is still open. Constitutive quorum is the share of eligible voters who cast a ballot. On a standard vote, abstentions count as participation. Deliberative quorum is the share of For among votes cast, and abstentions are part of that count. If the constitutive quorum is not met, the outcome is invalid and the page and PDF say the constitutive quorum was not reached. If it was met but the majority was not, they say the majority was not reached. A poll uses only the constitutive quorum. When that is met, the outcome is recorded as the count per option.
- **Record.** Each closed vote has a PDF: subject, eligible voters, each named vote with the time it was cast, the quorums, the outcome, and, when the vote did not pass, why.
- **Notifications.** The same events go to the bell and to email, immediately, except the two reminders, which are scheduled. A member is not notified about their own question, reply or vote. The unread count clears when the bell is opened. Each item links to that question or vote. With `EMAIL_PROVIDER=log`, the messages are in `/area/admin/outbox`.
- **Applications.** Stored applications stay in the reserved area, linked from the admin page. There is no public membership page.
- **Export.** The foot of Documents downloads every document version and the resolutions register.
- **How it works.** `/area/how-it-works`, linked from the members' footer.

Closed votes and resolutions cannot be updated or deleted, including by the database owner. That is enforced with triggers and grants, not only by hiding buttons.

## Netlify demo

This is the client demo that replaces the static site `nocap-preview.netlify.app`. The app runs on Netlify. The database is Supabase Postgres in Frankfurt (`eu-central-1`). Nothing in this repository deploys itself, and `@netlify/database` is not a dependency, so Netlify does not create a database.

The build uses the current Netlify Next.js runtime (`@netlify/plugin-nextjs` 5.16.0, the OpenNext adapter) and Node `22.14.0`, both set in `netlify.toml`. Each build runs `npm run db:deploy`, which migrates and, only when `DEMO_MODE` is `true` or `1` and `paolo.piccirilli@example.invalid` is absent, loads the demo. A second build does not wipe votes or members. Without `DEMO_MODE`, the build migrates and writes no example data.

### Supabase

In the Supabase project (region Frankfurt), open **Project Settings → Database → Connection string** and copy the **Session pooler** URI. It looks like:

```text
postgresql://postgres.<project-ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

Use port **5432** (session mode) for `DATABASE_URL`. Migrations take a session-level advisory lock, which transaction mode cannot hold, so `db:deploy` must stay on 5432. The user is `postgres.<project-ref>`.

That URI is `DATABASE_URL`. The app and `db:deploy` read `DATABASE_URL` only when it starts with `postgres://` or `postgresql://`. The site's existing `DATABASE_URL=file:./preview.db` is ignored, so replace it with the pooler URI. Set the variable for **Builds** and **Functions** (all scopes). The build runs `db:deploy` before the site starts, so a runtime-only value is not enough.

For the running site, also set `DATABASE_URL_POOL` to the same URI with port **6543** (transaction mode), scoped to **Functions**. The app uses it when it is a Postgres URL and ignores it otherwise. `db:deploy` never reads it. Transaction mode shares backends, so a warm function does not pin a session-pooler client between queries. Parameterized queries from `pg` use unnamed prepared statements, which that mode accepts. Named prepared statements are not used.

`db:deploy` uses `DATABASE_URL_OWNER` when that value is also a Postgres URL, and otherwise the same `DATABASE_URL`. Leave `DATABASE_URL_OWNER` unset on Netlify, and do not point `DATABASE_URL` at port 6543.

`NETLIFY_DATABASE_URL` and `NETLIFY_DB_URL` are not read. A leftover value there could still point at a US database, and it would have been selected while `DATABASE_URL` was the SQLite preview string.

Connections to `*.supabase.com` and `*.supabase.co` use TLS. Supabase's pooler certificate does not pass Node's default verification, and `pg` 8 treats `sslmode=require` as verification. The pool config rewrites that to `sslmode=no-verify`, which still requires TLS and sets `rejectUnauthorized: false`. `sslmode=verify-full` and `sslmode=verify-ca` are left as written. Local Postgres URLs are left without SSL.

On Netlify the session-mode pool size is 1. With `DATABASE_URL_POOL` on port 6543 the runtime pool size is 3. Idle sockets are kept (20 seconds in session mode, 60 seconds in transaction mode) and reused by the next invocation on that function instance, with TCP keepalive. An idle client that the pooler drops is logged and discarded instead of crashing the process. A transient connection error is retried once. Locally the pool size is 10. `db:deploy` always uses one connection.

Migrations in `db/migrations` do not enable extensions. `gen_random_uuid()` is built into Postgres 13 and later, which Supabase provides. Grants and RLS policies for `nocap_app` run only when that role exists. Supabase's `postgres` login owns the tables and bypasses RLS. Closed votes, ballots and resolutions stay immutable because the triggers reject the change for every role, including the table owner.

### Environment variables

Set these in the Netlify UI (**Site configuration → Environment variables**) for Builds and Functions. `netlify.toml` sets `EMAIL_PROVIDER` and `STORAGE_DRIVER` for the build. It does not set `DEMO_MODE`. The client demo sets `DEMO_MODE` to `true` or `1` in that same UI, for Builds. Repeat `EMAIL_PROVIDER` and `STORAGE_DRIVER` in the UI so the running functions see them.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase session pooler URI (`postgres://` or `postgresql://`, host `aws-0-eu-central-1.pooler.supabase.com`, port `5432`, user `postgres.<project-ref>`). Replace `file:./preview.db`. Required for Builds and as the fallback. |
| `DATABASE_URL_POOL` | Same user, host and database, port `6543`. Set it for Functions. Optional: if it is unset, the site keeps using `DATABASE_URL`. |
| `STORAGE_DRIVER` | `netlify-blobs` |
| `EMAIL_PROVIDER` | `log` |
| `DEMO_MODE` | `true` or `1` only for the client demo, set in the Netlify UI for Builds. Leave it unset in production. `db:deploy` and `npm run db:seed` write example data only then. |
| `APP_TIMEZONE` | `Europe/Rome` |
| `CRON_SECRET` | A long random string. Optional. The scheduled closer calls Postgres directly and does not need it. `POST /api/jobs/close-votes` still expects `Authorization: Bearer` this value, or `change-me` if it is unset. |
| `FOUNDING_COMMITTEE_EMAIL` | `founding-committee@nocap-law.com` (placeholder) |
| `EMAIL_FROM` | `nocap <noreply@nocap-law.com>` |

Leave `APP_URL` unset. Invite links and other mail use Netlify's `URL`, then `DEPLOY_PRIME_URL`. Leave `DATABASE_URL_OWNER` unset. Do not put `DEMO_MODE` in `netlify.toml`. For this demo site, set `DEMO_MODE` to `true` or `1` in the Netlify UI. For production, leave `DEMO_MODE` unset so a deploy cannot load the example members, votes or publications.

### What a deploy does

1. The site is connected to this repository. The build command and publish directory come from `netlify.toml` (`npm run db:deploy && npm run build`, publish `.next`).
2. Replace `DATABASE_URL` with the Supabase session pooler URI, scoped to Builds and Functions. Set the other variables in the table. `STORAGE_DRIVER=netlify-blobs` selects the Blobs adapter. The store name is `nocap-files`.
3. Deploy. Netlify does not create a database. `db:deploy` connects to Supabase and applies `db/migrations`. It seeds the demo only when `DEMO_MODE` is `true` or `1` and the demo admin is absent. The build cannot write Netlify Blobs, so seed files are stored as keys and created in Blobs on the first download. `npm run build` follows.
4. Later deploys migrate and skip the seed. Deploy previews use the same `DATABASE_URL` unless you give them a different one.
5. Open the site, sign in, and use **Outbox** for invite links. They point at the deployed URL.

Demo sign-in after seeding:

| Who | Email | Password |
| --- | --- | --- |
| Admin | `paolo.piccirilli@example.invalid` | `example-password` |
| Member | `elena.rossi@example.invalid` | `example-password` |

Votes close in two ways. A scheduled function, `netlify/functions/close-votes.ts`, runs every 10 minutes. It sends the 48-hour and 24-hour reminders for open votes, then closes anything already due and notifies members of the outcome. Opening the reserved area runs that job only when a vote is already inside its last 48 hours, and a failure there is logged without taking the page down. Downloading a vote record runs the same job. Each reminder is stored once per member, so a repeat run does not send it again.

Logged mail is not sent. The admin reads it at `/area/admin/outbox`. Files are stored in Netlify Blobs.

### Run the same steps locally

```bash
npm run db:deploy
```

This uses `DATABASE_URL_OWNER` when that value is a Postgres URL, then `DATABASE_URL`. It is safe to run twice. Example data is included only when `DEMO_MODE` is `true` or `1`.

## Deploy in the EU

The Netlify demo already uses Supabase Postgres in Frankfurt. See the Netlify demo section for the session pooler URI, SSL, and the env vars the site needs. Files for that demo stay in Netlify Blobs, and mail stays in the log outbox.

A production layout on a host you choose:

1. **Database.** PostgreSQL 16 in an EU region. Supabase's EU (Frankfurt) project is a direct fit: run the SQL in `db/migrations` as the owner, and set `DATABASE_URL` to a role equivalent to `nocap_app`. Do not put the owner URL in the running app. Do not enable the Data API for these tables; the policies admit only the application role.
2. **App.** Any Node host in the EU (a small VM, Fly.io `fra`, or a container platform with an EU region). `npm run build && npm run start`. Set `APP_URL` to `https://nocap-law.com` once that domain is connected. It is not connected yet.
3. **Files.** `STORAGE_PROVIDER=s3` with an EU bucket. For Supabase Storage use the project's S3 endpoint and `S3_REGION=eu-central-1`. Or keep `STORAGE_PROVIDER=local` on a disk that is backed up.
4. **Email.** Set `EMAIL_PROVIDER=smtp` and the `SMTP_*` variables. The provider is an open choice; pick one that processes mail in the EU if that is a requirement.
5. **Clock.** A scheduled `POST /api/jobs/close-votes` every few minutes sends vote reminders and closes votes whose deadline has passed even if nobody visits. The reserved area runs the same job on the next request.
6. **Secrets.** Only through the environment. Start from `.env.example`. Use long random values for `CRON_SECRET` and the database passwords.

The future public domain is `nocap-law.com`. Contact addresses in the example env file are placeholders.

## Backup and export

Two copies, on purpose:

- **Database.** `pg_dump` of the `nocap` database, taken in the EU and stored in the EU. This is the full backup, including applications, questions, votes and sessions.
- **Documents and resolutions, with no provider in the loop.** Any member can download `/api/export` (linked from the reserved area). The zip contains every file version and `resolutions/register.json` plus a PDF for each closed vote. Reading it does not require this app or the database host.

Restoring is: create an empty database, `psql` the dump, put the files back under the storage root (or into the bucket), and start the app.

## Open items

These are not decided by the specification. They are implemented in a way that is easy to change.

- **Publication detail.** A publication has a page and an optional PDF. Whether the real format is a page, a PDF, or both is open.
- **Placeholders to replace.** Example member names, biographies and the absence of real photos. Example publications. The privacy policy, which is marked as a draft and is not legal advice. The logo is the mockup PNG, not a vector master. `FOUNDING_COMMITTEE_EMAIL`.
- **Account and domain ownership.** `nocap-law.com` is not connected. No hosting account has been created by this repository.
- **Email provider.** Local development logs mail. Production SMTP is not chosen.
- **Timezone.** Deadlines typed into the forms are read as `Europe/Rome`. Confirm that with the club if another zone is intended.
- **Deliberative quorum.** "For" is divided by every ballot cast, abstentions included, because the specification describes that quorum as the share of For over votes cast. Abstentions also count toward the constitutive quorum.
- **Reactivation.** An admin can reactivate a member. The specification only requires deactivation. The public page follows the current status.
