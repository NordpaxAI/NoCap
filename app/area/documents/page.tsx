import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { DocIcon } from "@/components/members-shell";
import { SubmitButton } from "@/components/submit-button";
import { uploadRegister, uploadShared } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; area?: string }>;
}) {
  const user = await requireUser();
  const { q = "", error } = await searchParams;
  const query = q.trim();
  const { rows } = await pool.query<{
    documents: {
      id: string;
      area: string;
      category: string;
      title: string;
      immutable: boolean;
      version_number: number;
      uploaded_at: string;
    }[] | null;
  }>(
    `SELECT
       COALESCE((
         SELECT json_agg(json_build_object(
                  'id', d.id, 'area', d.area, 'category', d.category, 'title', d.title,
                  'immutable', d.immutable, 'version_number', v.version_number, 'uploaded_at', v.uploaded_at
                ) ORDER BY d.area, d.category, d.title)
         FROM documents d
         JOIN document_versions v ON v.document_id = d.id
         WHERE ($1 = '' OR d.title ILIKE '%' || $1 || '%')
           AND v.version_number = (SELECT max(version_number) FROM document_versions WHERE document_id = d.id)
       ), '[]'::json) AS documents`,
    [query],
  );
  const library = rows[0]?.documents ?? [];
  // Three folders. Vote records live in Votes (and in the export), not here.
  const folders = [
    { key: "minutes", label: "Minutes", docs: library.filter((d) => d.area === "register" && d.category === "minutes") },
    { key: "charter", label: "Charter", docs: library.filter((d) => d.area === "register" && (d.category === "charter" || d.category === "code_of_conduct")) },
    {
      key: "other",
      label: "Other documents",
      docs: library.filter((d) => d.area === "shared" || (d.area === "register" && (d.category === "other" || d.category === "resolution"))),
    },
  ];

  return (
    <>
      <h1 className="page-title">Documents</h1>
      <p className="help">Search is by title. Tick items to download them together. Vote records are in Votes.</p>
      {error ? <p className="error">{error}</p> : null}
      <ActionForm className="search" action="/area/documents" method="get">
        <input name="q" defaultValue={query} placeholder="Search by title" aria-label="Search by title" />
        <SubmitButton className="btn">Search</SubmitButton>
      </ActionForm>

      <ActionForm action="/api/documents/bulk" method="post">
        {folders.map((folder) => (
          <div key={folder.key}>
            <div className="head">
              <div className="eyebrow">{folder.label}</div>
              <span className="doc-meta">{folder.docs.length} {folder.docs.length === 1 ? "file" : "files"}</span>
            </div>
            <div className="docs">
              {folder.docs.map((doc) => (
                <div className="doc" key={doc.id}>
                  <label className="row-check">
                    <input type="checkbox" name="ids" value={doc.id} aria-label={`Select ${doc.title}`} />
                  </label>
                  <DocIcon />
                  <Link className="doc-name" href={`/area/documents/${doc.id}`}>{doc.title}</Link>
                  <span className="doc-meta">v{doc.version_number}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <SubmitButton className="btn">Download selected</SubmitButton>
      </ActionForm>

      <div className="head" style={{ marginTop: 36 }}><div className="eyebrow">Add to Other documents</div></div>
      <ActionForm action={uploadShared} className="stack">
        <div>
          <label className="lbl" htmlFor="shared-title">Title</label>
          <input id="shared-title" name="title" required />
        </div>
        <div>
          <label className="lbl" htmlFor="shared-file">File</label>
          <input id="shared-file" name="file" type="file" required />
        </div>
        <SubmitButton className="btn solid">Upload</SubmitButton>
      </ActionForm>

      {user.role === "admin" ? (
        <>
          <div className="head" style={{ marginTop: 36 }}><div className="eyebrow">Add an official document (admins)</div></div>
          <ActionForm action={uploadRegister} className="stack">
            <div>
              <label className="lbl" htmlFor="category">Folder</label>
              <select id="category" name="category" defaultValue="minutes">
                <option value="minutes">Minutes</option>
                <option value="charter">Charter</option>
                <option value="other">Other documents</option>
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="reg-title">Title</label>
              <input id="reg-title" name="title" required />
            </div>
            <div>
              <label className="lbl" htmlFor="reg-file">File</label>
              <input id="reg-file" name="file" type="file" required />
            </div>
            <p className="help">Official documents cannot be deleted. To correct one, open it and upload a new version.</p>
            <SubmitButton className="btn solid">Upload</SubmitButton>
          </ActionForm>
        </>
      ) : null}

      <div className="head" id="export" style={{ marginTop: 36 }}>
        <div className="eyebrow">Export</div>
      </div>
      <p className="help">
        Download every document, in every version, and the vote records and resolutions register. The archive is a zip of files and a JSON copy of the votes. It does not depend on the host once you have it.
      </p>
      <a className="btn solid" href="/api/export">Download everything</a>
    </>
  );
}
