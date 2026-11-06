import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chunkCountFor,
  clientFileProblem,
  contentDisposition,
  expectedChunkLength,
  extensionForMime,
  inspectVoteDocument,
  previewKind,
  quotaProblem,
  sizeProblem,
  VOTE_DOCUMENT_CHUNK_BYTES,
  VOTE_DOCUMENT_MAX_BYTES,
  VOTE_DOCUMENT_MAX_COUNT,
  VOTE_DOCUMENT_MAX_TOTAL_BYTES,
} from "../lib/vote-documents";

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function zipLocal(name: string, payload = "hello"): Uint8Array {
  const nameBytes = Buffer.from(name);
  const data = Buffer.from(payload);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt32LE(data.length, 18);
  return Buffer.concat([header, nameBytes, data]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

const pdf = bytesOf("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd8, 0, 1, 2, 3]);
const gif = bytesOf("GIF89a");
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const ole = new Uint8Array(512);
ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const text = bytesOf("Minutes of the meeting.\nFor, against, abstain.\n");
const rtf = bytesOf("{\\rtf1\\ansi minutes}");
const docx = concat([zipLocal("[Content_Types].xml", "<Types/>"), zipLocal("word/document.xml", "<w:document/>")]);
const xlsx = concat([zipLocal("[Content_Types].xml", "<Types/>"), zipLocal("xl/workbook.xml", "<workbook/>")]);
const odt = zipLocal("mimetype", "application/vnd.oasis.opendocument.text");
const exe = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);

function ok(name: string, mime: string, body: Uint8Array, storedMime: string): void {
  const result = inspectVoteDocument(name, mime, body);
  assert.equal(result.ok, true, `${name} should be accepted`);
  if (result.ok) assert.equal(result.document.mime, storedMime);
}

ok("minutes.pdf", "application/pdf", pdf, "application/pdf");
ok("photo.PNG", "image/png", png, "image/png");
ok("scan.jpg", "", jpeg, "image/jpeg");
ok("mark.gif", "image/gif", gif, "image/gif");
ok("logo.webp", "image/webp", webp, "image/webp");
ok("charter.doc", "application/msword", ole, "application/msword");
ok("figures.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
ok("note.docx", "application/zip", docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
ok("statute.odt", "", odt, "application/vnd.oasis.opendocument.text");
ok("letter.rtf", "application/rtf", rtf, "application/rtf");
ok("roll.csv", "text/csv", text, "text/csv");
ok("readme.md", "text/markdown", text, "text/markdown");
ok("plain.txt", "text/plain", text, "text/plain");

const renamed = inspectVoteDocument("minutes.pdf", "application/pdf", png);
assert.equal(renamed.ok, false);
const html = inspectVoteDocument("page.html", "text/html", bytesOf("<html></html>"));
assert.equal(html.ok, false);
const svg = inspectVoteDocument("mark.svg", "image/svg+xml", bytesOf("<svg></svg>"));
assert.equal(svg.ok, false);
const zip = inspectVoteDocument("bundle.zip", "application/zip", docx);
assert.equal(zip.ok, false);
const script = inspectVoteDocument("run.exe", "application/octet-stream", exe);
assert.equal(script.ok, false);
const mimeLie = inspectVoteDocument("minutes.pdf", "text/html", pdf);
assert.equal(mimeLie.ok, false);
const spreadsheetAsDoc = inspectVoteDocument("note.docx", "", xlsx);
assert.equal(spreadsheetAsDoc.ok, false);
const empty = inspectVoteDocument("empty.txt", "text/plain", new Uint8Array());
assert.equal(empty.ok, false);
const binaryText = inspectVoteDocument("notes.txt", "text/plain", Uint8Array.from([0x68, 0x00, 0x69]));
assert.equal(binaryText.ok, false);

assert.equal(sizeProblem(VOTE_DOCUMENT_MAX_BYTES), null);
assert.match(sizeProblem(VOTE_DOCUMENT_MAX_BYTES + 1) || "", /25 MB/);
assert.match(quotaProblem(0, 0, Array.from({ length: VOTE_DOCUMENT_MAX_COUNT + 1 }, () => 10)) || "", /20 documents/);
assert.match(quotaProblem(18, 0, [10, 10, 10]) || "", /already has 18/);
assert.match(quotaProblem(0, VOTE_DOCUMENT_MAX_TOTAL_BYTES - 10, [20]) || "", /200 MB/);
assert.equal(quotaProblem(1, 100, [200]), null);

assert.equal(chunkCountFor(1), 1);
assert.equal(chunkCountFor(VOTE_DOCUMENT_CHUNK_BYTES), 1);
assert.equal(chunkCountFor(VOTE_DOCUMENT_CHUNK_BYTES + 1), 2);
assert.equal(expectedChunkLength(VOTE_DOCUMENT_CHUNK_BYTES + 5, 0), VOTE_DOCUMENT_CHUNK_BYTES);
assert.equal(expectedChunkLength(VOTE_DOCUMENT_CHUNK_BYTES + 5, 1), 5);
assert.equal(expectedChunkLength(VOTE_DOCUMENT_MAX_BYTES + 1, 0), null);

assert.equal(previewKind("application/pdf"), "pdf");
assert.equal(previewKind("image/jpeg"), "image");
assert.equal(previewKind("text/csv"), "text");
assert.equal(previewKind("text/markdown"), "text");
assert.equal(previewKind("text/html"), "download");
assert.equal(previewKind("image/svg+xml"), "download");
assert.equal(previewKind("application/javascript"), "download");
assert.equal(previewKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "download");
assert.equal(extensionForMime("application/pdf"), "pdf");
assert.equal(clientFileProblem({ name: "a.pdf", size: 12, type: "application/pdf" }), null);
assert.match(clientFileProblem({ name: "a.exe", size: 12, type: "" }) || "", /PDF, Word/);
assert.equal(contentDisposition("inline", "bad\"name\r\n.pdf"), "inline; filename=\"badname__.pdf\"");

const partial = inspectVoteDocument("note.docx", "", docx.subarray(0, 80), { partial: true });
assert.equal(partial.ok, true);

const migration = readFileSync(new URL("../db/migrations/014_vote_document_uploads.sql", import.meta.url), "utf8");
assert.match(migration, /ADD COLUMN upload_token/);
assert.match(migration, /CREATE TABLE upload_sessions/);
assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
assert.doesNotMatch(migration, /\bUPDATE\s+attachments\b/i);

const store = readFileSync(new URL("../lib/vote-document-store.ts", import.meta.url), "utf8");
assert.match(store, /INSERT INTO attachments/);
assert.doesNotMatch(store, /\bUPDATE\s+attachments\b/i);
assert.doesNotMatch(store, /\bDELETE\s+FROM\s+attachments\b/i);
assert.doesNotMatch(store, /\bUPDATE\s+votes\b/i);
assert.doesNotMatch(store, /\bUPDATE\s+vote_options\b/i);
assert.doesNotMatch(store, /https?:\/\/.*blob/i);

const route = readFileSync(new URL("../app/api/attachments/[id]/preview/route.ts", import.meta.url), "utf8");
assert.match(route, /loadMemberAttachment/);
assert.match(route, /text\/plain/);
assert.doesNotMatch(route, /public-read|getSignedUrl|public:\s*true/i);

const download = readFileSync(new URL("../app/api/attachments/[id]/route.ts", import.meta.url), "utf8");
assert.match(download, /loadMemberAttachment/);

console.log("vote-documents ok");
