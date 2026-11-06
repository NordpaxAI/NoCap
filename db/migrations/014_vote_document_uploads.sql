-- 014: let a vote hold several documents, including files larger than one request.
-- Additive. No existing row, vote, option or attachment is updated or deleted.
-- Existing attachment rows keep a null upload token.
-- upload_sessions is unfinished upload state only. It is not a vote document.
-- ON DELETE CASCADE removes that staging row when an open vote is deleted;
-- it does not remove attachment rows.

ALTER TABLE attachments ADD COLUMN upload_token uuid;

ALTER TABLE attachments ADD CONSTRAINT attachments_upload_token_key UNIQUE (upload_token);

CREATE TABLE upload_sessions (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles (id),
  vote_id uuid NOT NULL REFERENCES votes (id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  chunk_count integer NOT NULL CHECK (chunk_count > 0 AND chunk_count <= 16),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX upload_sessions_expires_idx ON upload_sessions (expires_at);

ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;

-- nocap_app may insert attachments (already granted) and may delete only
-- unfinished upload sessions. It still cannot update or delete attachments.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nocap_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON upload_sessions TO nocap_app';
    EXECUTE 'CREATE POLICY nocap_app_all ON upload_sessions FOR ALL TO nocap_app USING (true) WITH CHECK (true)';
  END IF;
END
$grants$;
