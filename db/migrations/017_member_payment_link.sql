-- 017: optional per-member Stripe Payment Link for membership fee (invoice).
-- Additive only. No existing row is updated or deleted.
-- The app stores a paste-in https URL only; there is no Stripe API key or webhook.
-- Access control is server-side (member sees own link; admins set/clear). Do not
-- apply this migration to production until deploy is approved.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payment_link_url text
    CHECK (
      payment_link_url IS NULL
      OR (
        char_length(payment_link_url) BETWEEN 12 AND 2048
        AND payment_link_url ~ '^https://'
      )
    );

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payment_amount_eur numeric(10, 2)
    CHECK (payment_amount_eur IS NULL OR payment_amount_eur > 0);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payment_label text
    CHECK (payment_label IS NULL OR char_length(payment_label) BETWEEN 1 AND 120);

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nocap_app') THEN
    -- Admin server actions update these columns; members never write them.
    EXECUTE 'GRANT UPDATE (payment_link_url, payment_amount_eur, payment_label, updated_at) ON profiles TO nocap_app';
  END IF;
END
$grants$;
