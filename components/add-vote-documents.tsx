"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadVoteDocuments } from "@/lib/upload-vote-documents";
import { clientFileProblem, quotaProblem, VOTE_DOCUMENT_ACCEPT, VOTE_DOCUMENT_HELP } from "@/lib/vote-documents";

export function AddVoteDocuments({
  voteId,
  usedCount,
  usedBytes,
}: {
  voteId: string;
  usedCount: number;
  usedBytes: number;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="stack"
      style={{ marginTop: 14 }}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const input = event.currentTarget.querySelector<HTMLInputElement>('input[type="file"]');
        const files = Array.from(input?.files || []);
        setError(null);
        if (!files.length) {
          setError("Choose a document to add.");
          return;
        }
        for (const file of files) {
          const problem = clientFileProblem(file);
          if (problem) {
            setError(problem);
            return;
          }
        }
        const quota = quotaProblem(usedCount, usedBytes, files.map((file) => file.size));
        if (quota) {
          setError(quota);
          return;
        }
        setPending(true);
        void uploadVoteDocuments(voteId, files, setProgress)
          .then(() => {
            if (input) input.value = "";
            setChosen([]);
            setProgress(null);
            router.refresh();
          })
          .catch((reason: unknown) => {
            setProgress(null);
            setError(reason instanceof Error ? reason.message : "The document could not be added.");
            router.refresh();
          })
          .finally(() => setPending(false));
      }}
    >
      <div>
        <label className="lbl" htmlFor="add-documents">Add documents</label>
        <input
          id="add-documents"
          type="file"
          multiple
          accept={VOTE_DOCUMENT_ACCEPT}
          onChange={(event) => setChosen(Array.from(event.target.files || []))}
        />
        <p className="help">
          {VOTE_DOCUMENT_HELP}
        </p>
        {chosen.length ? <p className="by">{chosen.map((file) => file.name).join(", ")}</p> : null}
        {progress ? <p className="by" role="status">{progress}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
      <button className="btn solid" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add documents"}
      </button>
    </form>
  );
}
