import { formatBytes, previewKind } from "@/lib/vote-documents";

export type VoteDocumentFile = {
  id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
};

export function VoteDocumentList({ files }: { files: VoteDocumentFile[] }) {
  if (!files.length) return null;
  return (
    <div className="vote-files">
      <div className="eyebrow">Documents</div>
      {files.map((file) => {
        const kind = previewKind(file.mime_type);
        const previewHref = `/api/attachments/${file.id}/preview`;
        const downloadHref = `/api/attachments/${file.id}`;
        return (
          <div className="vote-file" key={file.id}>
            <div className="vote-file-head">
              <span className="doc-name">{file.filename}</span>
              <span className="doc-meta">{formatBytes(Number(file.byte_size))}</span>
              <a className="dl" href={downloadHref}>Download</a>
            </div>
            {kind === "pdf" ? (
              <div className="vote-preview">
                <iframe src={previewHref} title={file.filename} />
              </div>
            ) : null}
            {kind === "image" ? (
              <div className="vote-preview">
                <img src={previewHref} alt={file.filename} />
              </div>
            ) : null}
            {kind === "text" ? (
              <div className="vote-preview">
                <iframe src={previewHref} title={file.filename} sandbox="" />
              </div>
            ) : null}
            {kind === "download" ? (
              <p className="by">This file cannot be previewed in the browser. Use the download link.</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
