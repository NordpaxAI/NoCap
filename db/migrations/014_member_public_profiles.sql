-- Public member profiles (Members page), reviewed by an admin before publishing.
-- Additive only: no existing table, row or file is changed or deleted.
-- The member submits a snapshot (sub_*) of name, bio, city, country and photo.
-- An admin approval copies it into the published snapshot (pub_*), which is the
-- only thing the public /members page reads. Later edits to the private profile
-- do not change the public card until a new submission is approved.
CREATE TABLE IF NOT EXISTS member_public_profiles (
  profile_id uuid PRIMARY KEY REFERENCES profiles (id),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'approved', 'changes_requested')),
  sub_name text NOT NULL CHECK (char_length(sub_name) BETWEEN 1 AND 120),
  sub_bio text NOT NULL CHECK (char_length(sub_bio) BETWEEN 1 AND 1200),
  sub_city text NOT NULL CHECK (char_length(sub_city) BETWEEN 1 AND 80),
  sub_country text NOT NULL CHECK (char_length(sub_country) BETWEEN 1 AND 80),
  sub_photo_key text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  reviewed_by uuid REFERENCES profiles (id),
  reviewed_at timestamptz,
  pub_name text,
  pub_bio text,
  pub_city text,
  pub_country text,
  pub_photo_key text,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  sort integer NOT NULL DEFAULT 100
);

CREATE INDEX IF NOT EXISTS member_public_profiles_published_idx
  ON member_public_profiles (published, sort, pub_name);

REVOKE ALL ON member_public_profiles FROM PUBLIC;
ALTER TABLE member_public_profiles ENABLE ROW LEVEL SECURITY;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nocap_app') THEN
    -- No DELETE: unpublishing only flips "published".
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON member_public_profiles TO nocap_app';
    EXECUTE 'DROP POLICY IF EXISTS nocap_app_all ON member_public_profiles';
    EXECUTE 'CREATE POLICY nocap_app_all ON member_public_profiles FOR ALL TO nocap_app USING (true) WITH CHECK (true)';
  END IF;
END
$grants$;
