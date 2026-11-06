import {
  chunkCountFor,
  expectedChunkLength,
  inspectVoteDocument,
  VOTE_DOCUMENT_CHUNK_BYTES,
} from "./vote-documents";

export async function uploadVoteDocuments(
  voteId: string,
  files: File[],
  onProgress?: (message: string) => void,
): Promise<void> {
  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    if (!file) continue;
    const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
    const checked = inspectVoteDocument(file.name, file.type, head, { partial: true });
    if (!checked.ok) throw new Error(checked.problem);
    const uploadId = crypto.randomUUID();
    const chunkCount = chunkCountFor(file.size);
    for (let index = 0; index < chunkCount; index += 1) {
      onProgress?.(`Uploading ${file.name} (${fileIndex + 1} of ${files.length})…`);
      const length = expectedChunkLength(file.size, index);
      if (length === null) throw new Error("That file could not be uploaded.");
      const start = index * VOTE_DOCUMENT_CHUNK_BYTES;
      const body = new FormData();
      body.set("uploadId", uploadId);
      body.set("chunkIndex", String(index));
      body.set("chunkCount", String(chunkCount));
      body.set("filename", file.name);
      body.set("byteSize", String(file.size));
      body.set("chunk", file.slice(start, start + length), checked.document.filename);
      const response = await fetch(`/api/votes/${voteId}/documents`, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const text = await response.text();
      let payload: { error?: string } = {};
      try {
        payload = JSON.parse(text) as { error?: string };
      } catch {
        payload = {};
      }
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error("That part of the upload was too large. Try again.");
        }
        throw new Error(payload.error || "The document could not be added.");
      }
    }
  }
}
