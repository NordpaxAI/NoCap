// Explicit limits for vote documents. These are application rules, not a claim
// that storage is unlimited. Chunks stay under the platform request-body cap
// (Netlify rejects a single request around 6 MB); a document can be larger
// because the browser sends it in parts.

export const VOTE_DOCUMENT_MAX_MB = 25;
export const VOTE_DOCUMENT_MAX_TOTAL_MB = 200;
export const VOTE_DOCUMENT_MAX_COUNT = 20;
export const VOTE_DOCUMENT_MAX_BYTES = VOTE_DOCUMENT_MAX_MB * 1024 * 1024;
export const VOTE_DOCUMENT_MAX_TOTAL_BYTES = VOTE_DOCUMENT_MAX_TOTAL_MB * 1024 * 1024;
export const VOTE_DOCUMENT_CHUNK_BYTES = 3 * 1024 * 1024;

export const VOTE_DOCUMENT_HELP =
  "You can attach more than one document. Each file can be up to 25 MB. A vote can hold 20 documents and 200 MB in total. PDF, Word, Excel, PowerPoint, OpenDocument, RTF, text, CSV, Markdown, PNG, JPEG, GIF and WebP are accepted. While a vote is open, an admin can add further documents. Files already attached stay as they are, and the subject, options and quorums are not changed.";

const TYPE_LIST =
  "Use a PDF, Word, Excel, PowerPoint, OpenDocument, RTF, text, CSV, Markdown, PNG, JPEG, GIF or WebP file.";

type PreviewKind = "pdf" | "image" | "text" | "download";
type Family =
  | "pdf"
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "ole"
  | "docx"
  | "xlsx"
  | "pptx"
  | "odt"
  | "ods"
  | "odp"
  | "rtf"
  | "text";

type ExtensionRule = {
  mime: string;
  family: Family;
  preview: PreviewKind;
  mimes: string[];
  label: string;
};

const EXTENSIONS: Record<string, ExtensionRule> = {
  pdf: { mime: "application/pdf", family: "pdf", preview: "pdf", mimes: ["application/pdf"], label: "PDF" },
  png: { mime: "image/png", family: "png", preview: "image", mimes: ["image/png"], label: "PNG image" },
  jpg: { mime: "image/jpeg", family: "jpeg", preview: "image", mimes: ["image/jpeg"], label: "JPEG image" },
  jpeg: { mime: "image/jpeg", family: "jpeg", preview: "image", mimes: ["image/jpeg"], label: "JPEG image" },
  gif: { mime: "image/gif", family: "gif", preview: "image", mimes: ["image/gif"], label: "GIF image" },
  webp: { mime: "image/webp", family: "webp", preview: "image", mimes: ["image/webp"], label: "WebP image" },
  doc: { mime: "application/msword", family: "ole", preview: "download", mimes: ["application/msword"], label: "Word document" },
  xls: {
    mime: "application/vnd.ms-excel",
    family: "ole",
    preview: "download",
    mimes: ["application/vnd.ms-excel"],
    label: "Excel spreadsheet",
  },
  ppt: {
    mime: "application/vnd.ms-powerpoint",
    family: "ole",
    preview: "download",
    mimes: ["application/vnd.ms-powerpoint"],
    label: "PowerPoint presentation",
  },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    family: "docx",
    preview: "download",
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    label: "Word document",
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    family: "xlsx",
    preview: "download",
    mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    label: "Excel spreadsheet",
  },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    family: "pptx",
    preview: "download",
    mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    label: "PowerPoint presentation",
  },
  odt: {
    mime: "application/vnd.oasis.opendocument.text",
    family: "odt",
    preview: "download",
    mimes: ["application/vnd.oasis.opendocument.text"],
    label: "OpenDocument text",
  },
  ods: {
    mime: "application/vnd.oasis.opendocument.spreadsheet",
    family: "ods",
    preview: "download",
    mimes: ["application/vnd.oasis.opendocument.spreadsheet"],
    label: "OpenDocument spreadsheet",
  },
  odp: {
    mime: "application/vnd.oasis.opendocument.presentation",
    family: "odp",
    preview: "download",
    mimes: ["application/vnd.oasis.opendocument.presentation"],
    label: "OpenDocument presentation",
  },
  rtf: {
    mime: "application/rtf",
    family: "rtf",
    preview: "download",
    mimes: ["application/rtf", "text/rtf", "application/x-rtf"],
    label: "RTF document",
  },
  txt: { mime: "text/plain", family: "text", preview: "text", mimes: ["text/plain"], label: "text file" },
  csv: {
    mime: "text/csv",
    family: "text",
    preview: "text",
    mimes: ["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"],
    label: "CSV file",
  },
  md: {
    mime: "text/markdown",
    family: "text",
    preview: "text",
    mimes: ["text/markdown", "text/plain", "text/x-markdown"],
    label: "Markdown file",
  },
};

const ZIP_FAMILIES = new Set<Family>(["docx", "xlsx", "pptx", "odt", "ods", "odp"]);

export const VOTE_DOCUMENT_ACCEPT = Object.keys(EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(",");

export type InspectedVoteDocument = {
  filename: string;
  mime: string;
  extension: string;
  preview: PreviewKind;
};

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "0 B";
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function baseMime(mime: string): string {
  return mime.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function fileExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function extensionForMime(mime: string): string | null {
  const base = baseMime(mime);
  for (const [ext, rule] of Object.entries(EXTENSIONS)) {
    if (rule.mime === base) return ext;
  }
  return null;
}

export function previewKind(mime: string): PreviewKind {
  const base = baseMime(mime);
  if (base === "application/pdf") return "pdf";
  if (base === "image/png" || base === "image/jpeg" || base === "image/gif" || base === "image/webp") return "image";
  if (base === "text/plain" || base === "text/csv" || base === "text/markdown") return "text";
  return "download";
}

export function sizeProblem(size: number): string | null {
  if (!Number.isFinite(size) || size <= 0) return "The file is empty.";
  if (size > VOTE_DOCUMENT_MAX_BYTES) {
    return `That file is ${(size / (1024 * 1024)).toFixed(1)} MB. The limit is ${VOTE_DOCUMENT_MAX_MB} MB per document.`;
  }
  return null;
}

export function quotaProblem(existingCount: number, existingBytes: number, incomingSizes: number[]): string | null {
  for (const size of incomingSizes) {
    const problem = sizeProblem(size);
    if (problem) return problem;
  }
  const count = existingCount + incomingSizes.length;
  if (count > VOTE_DOCUMENT_MAX_COUNT) {
    if (existingCount <= 0) return `A vote can have at most ${VOTE_DOCUMENT_MAX_COUNT} documents.`;
    return `A vote can have at most ${VOTE_DOCUMENT_MAX_COUNT} documents. This vote already has ${existingCount}.`;
  }
  const incoming = incomingSizes.reduce((sum, size) => sum + size, 0);
  if (existingBytes + incoming > VOTE_DOCUMENT_MAX_TOTAL_BYTES) {
    return `These documents would take the vote over ${VOTE_DOCUMENT_MAX_TOTAL_MB} MB. It already holds ${formatBytes(existingBytes)}, and a vote can hold ${VOTE_DOCUMENT_MAX_TOTAL_MB} MB in total.`;
  }
  return null;
}

export function clientFileProblem(file: { name: string; size: number; type: string }): string | null {
  const problem = sizeProblem(file.size);
  if (problem) return problem;
  const extension = fileExtension(file.name);
  const rule = EXTENSIONS[extension];
  if (!rule) return TYPE_LIST;
  const declared = baseMime(file.type || "");
  if (declared && declared !== "application/octet-stream" && !rule.mimes.includes(declared)) {
    if (!(declared === "application/zip" && ZIP_FAMILIES.has(rule.family))) {
      return "That file type does not match its name.";
    }
  }
  return null;
}

export function chunkCountFor(byteSize: number): number {
  return Math.max(1, Math.ceil(byteSize / VOTE_DOCUMENT_CHUNK_BYTES));
}

export function expectedChunkLength(byteSize: number, index: number): number | null {
  if (sizeProblem(byteSize)) return null;
  const count = chunkCountFor(byteSize);
  if (!Number.isInteger(index) || index < 0 || index >= count) return null;
  if (index < count - 1) return VOTE_DOCUMENT_CHUNK_BYTES;
  return byteSize - (count - 1) * VOTE_DOCUMENT_CHUNK_BYTES;
}

export function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return `${kind}; filename="${ascii || "document"}"`;
}

export function inspectVoteDocument(
  filename: string,
  declaredMime: string,
  bytes: Uint8Array,
  options?: { partial?: boolean },
): { ok: true; document: InspectedVoteDocument } | { ok: false; problem: string } {
  const partial = options?.partial === true;
  const extension = fileExtension(filename);
  const rule = EXTENSIONS[extension];
  if (!rule) return { ok: false, problem: TYPE_LIST };
  if (!partial) {
    const problem = sizeProblem(bytes.byteLength);
    if (problem) return { ok: false, problem };
  }
  const declared = baseMime(declaredMime || "");
  if (declared && declared !== "application/octet-stream" && !rule.mimes.includes(declared)) {
    if (!(declared === "application/zip" && ZIP_FAMILIES.has(rule.family))) {
      return { ok: false, problem: "That file type does not match its name." };
    }
  }
  if (!familyMatches(rule.family, bytes, partial)) {
    return { ok: false, problem: `That file does not look like a ${rule.label}. Upload the original document.` };
  }
  const safe = storedFilename(filename, extension);
  return {
    ok: true,
    document: { filename: safe, mime: rule.mime, extension, preview: rule.preview },
  };
}

function storedFilename(filename: string, extension: string): string {
  const base = filename.split(/[/\\]/).pop() || "document";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "");
  const suffix = `.${extension}`;
  const stem = (cleaned || "document").replace(new RegExp(`${suffix.replace(".", "\\.")}$`, "i"), "");
  const room = Math.max(1, 80 - suffix.length);
  return `${stem.slice(0, room) || "document"}${suffix}`;
}

function familyMatches(family: Family, bytes: Uint8Array, partial: boolean): boolean {
  if (family === "pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
  if (family === "png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (family === "jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (family === "gif") return startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  if (family === "webp") {
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  if (family === "ole") {
    const magic = startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    if (!magic) return false;
    return partial || bytes.byteLength >= 512;
  }
  if (family === "rtf") return startsWith(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66]);
  if (family === "text") return looksLikeText(bytes, partial);
  if (ZIP_FAMILIES.has(family)) return officeMatches(family, bytes, partial);
  return false;
}

function officeMatches(family: Family, bytes: Uint8Array, partial: boolean): boolean {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
  const text = new TextDecoder("latin1").decode(bytes);
  if (family === "odt" || family === "ods" || family === "odp") {
    const marker =
      family === "odt"
        ? "application/vnd.oasis.opendocument.text"
        : family === "ods"
          ? "application/vnd.oasis.opendocument.spreadsheet"
          : "application/vnd.oasis.opendocument.presentation";
    return text.includes(marker);
  }
  const hasWord = text.includes("word/");
  const hasXl = text.includes("xl/");
  const hasPpt = text.includes("ppt/");
  const hasTypes = text.includes("[Content_Types].xml");
  const contradicted =
    (family === "docx" && ((hasXl && !hasWord) || (hasPpt && !hasWord))) ||
    (family === "xlsx" && ((hasWord && !hasXl) || (hasPpt && !hasXl))) ||
    (family === "pptx" && ((hasWord && !hasPpt) || (hasXl && !hasPpt)));
  if (contradicted) return false;
  const positive =
    (family === "docx" && (hasWord || hasTypes)) ||
    (family === "xlsx" && (hasXl || hasTypes)) ||
    (family === "pptx" && (hasPpt || hasTypes));
  if (positive) return true;
  return partial;
}

function looksLikeText(bytes: Uint8Array, partial: boolean): boolean {
  if (bytes.byteLength === 0) return false;
  const limit = partial ? bytes.byteLength : bytes.byteLength;
  let controls = 0;
  const sampleEnd = Math.min(limit, 8192);
  for (let index = 0; index < limit; index += 1) {
    const byte = bytes[index] ?? 0;
    if (byte === 0) return false;
    if (index < sampleEnd && byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) controls += 1;
  }
  return controls / sampleEnd < 0.02;
}

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.byteLength < magic.length) return false;
  return magic.every((value, index) => bytes[index] === value);
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
