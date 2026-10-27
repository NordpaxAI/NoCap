-- 013: deliberative majority on For + Against only, and member exclusions for new votes.
-- Additive. Closed votes and their resolutions rows are not touched. Open votes keep
-- their ballots and electorates; they are counted with the new rule when they close.
-- Constitutive quorum is unchanged: abstentions still count as participation.

CREATE OR REPLACE FUNCTION private.close_vote(p_vote_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v votes%ROWTYPE;
  eligible integer;
  n_for integer;
  n_against integer;
  n_abstain integer;
  voted integer;
  const_met boolean;
  delib_met boolean;
  result text;
BEGIN
  SELECT * INTO v FROM votes WHERE id = p_vote_id FOR UPDATE;
  IF NOT FOUND OR v.status <> 'open' THEN
    RETURN;
  END IF;
  IF v.deadline > now() THEN
    RAISE EXCEPTION 'deadline not reached';
  END IF;

  SELECT count(*)::int INTO eligible FROM vote_electorate WHERE vote_id = p_vote_id;

  IF v.kind = 'poll' THEN
    SELECT count(*)::int INTO voted FROM poll_ballots WHERE vote_id = p_vote_id;
    const_met := eligible > 0 AND (voted::numeric * 100) >= (eligible::numeric * v.quorum_constitutive);
    IF NOT const_met THEN
      result := 'invalid';
    ELSE
      result := 'recorded';
    END IF;
    PERFORM set_config('nocap.closing_vote', 'on', true);
    UPDATE votes SET
      status = 'closed',
      closed_at = now(),
      eligible_count = eligible,
      voted_count = voted,
      for_count = 0,
      against_count = 0,
      abstain_count = 0,
      constitutive_met = const_met,
      deliberative_met = NULL,
      outcome = result
    WHERE id = p_vote_id;
    PERFORM set_config('nocap.closing_vote', 'off', true);
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE choice = 'for')::int,
    count(*) FILTER (WHERE choice = 'against')::int,
    count(*) FILTER (WHERE choice = 'abstain')::int
  INTO n_for, n_against, n_abstain
  FROM ballots WHERE vote_id = p_vote_id;
  voted := n_for + n_against + n_abstain;

  const_met := eligible > 0 AND (voted::numeric * 100) >= (eligible::numeric * v.quorum_constitutive);
  -- Majority on For and Against only. Abstentions count for the constitutive quorum only.
  delib_met := (n_for + n_against) > 0
    AND (n_for::numeric * 100) >= ((n_for + n_against)::numeric * v.quorum_deliberative);

  IF NOT const_met THEN
    result := 'invalid';
  ELSIF delib_met THEN
    result := 'carried';
  ELSE
    result := 'not_carried';
  END IF;

  PERFORM set_config('nocap.closing_vote', 'on', true);
  UPDATE votes SET
    status = 'closed',
    closed_at = now(),
    eligible_count = eligible,
    voted_count = voted,
    for_count = n_for,
    against_count = n_against,
    abstain_count = n_abstain,
    constitutive_met = const_met,
    deliberative_met = delib_met,
    outcome = result
  WHERE id = p_vote_id;

  INSERT INTO resolutions (
    vote_id, subject, outcome,
    quorum_constitutive, quorum_deliberative,
    eligible_count, voted_count, for_count, against_count, abstain_count,
    constitutive_met, deliberative_met, closed_at
  ) VALUES (
    p_vote_id, v.subject, result,
    v.quorum_constitutive, v.quorum_deliberative,
    eligible, voted, n_for, n_against, n_abstain,
    const_met, delib_met, now()
  );
  PERFORM set_config('nocap.closing_vote', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION private.seed_close_vote(p_vote_id uuid, p_opened_at timestamptz, p_closed_at timestamptz) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v votes%ROWTYPE;
  eligible integer;
  n_for integer;
  n_against integer;
  n_abstain integer;
  voted integer;
  const_met boolean;
  delib_met boolean;
  result text;
BEGIN
  SELECT * INTO v FROM votes WHERE id = p_vote_id FOR UPDATE;
  IF NOT FOUND OR v.status <> 'open' THEN
    RAISE EXCEPTION 'seed close expected an open vote';
  END IF;
  SELECT count(*)::int INTO eligible FROM vote_electorate WHERE vote_id = p_vote_id;

  IF v.kind = 'poll' THEN
    SELECT count(*)::int INTO voted FROM poll_ballots WHERE vote_id = p_vote_id;
    const_met := eligible > 0 AND (voted::numeric * 100) >= (eligible::numeric * v.quorum_constitutive);
    IF NOT const_met THEN
      result := 'invalid';
    ELSE
      result := 'recorded';
    END IF;
    PERFORM set_config('nocap.closing_vote', 'on', true);
    UPDATE votes SET
      status = 'closed',
      opened_at = p_opened_at,
      deadline = p_closed_at,
      closed_at = p_closed_at,
      eligible_count = eligible,
      voted_count = voted,
      for_count = 0,
      against_count = 0,
      abstain_count = 0,
      constitutive_met = const_met,
      deliberative_met = NULL,
      outcome = result
    WHERE id = p_vote_id;
    PERFORM set_config('nocap.closing_vote', 'off', true);
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE choice = 'for')::int,
    count(*) FILTER (WHERE choice = 'against')::int,
    count(*) FILTER (WHERE choice = 'abstain')::int
  INTO n_for, n_against, n_abstain
  FROM ballots WHERE vote_id = p_vote_id;
  voted := n_for + n_against + n_abstain;
  const_met := eligible > 0 AND (voted::numeric * 100) >= (eligible::numeric * v.quorum_constitutive);
  -- Majority on For and Against only. Abstentions count for the constitutive quorum only.
  delib_met := (n_for + n_against) > 0
    AND (n_for::numeric * 100) >= ((n_for + n_against)::numeric * v.quorum_deliberative);
  IF NOT const_met THEN
    result := 'invalid';
  ELSIF delib_met THEN
    result := 'carried';
  ELSE
    result := 'not_carried';
  END IF;
  PERFORM set_config('nocap.closing_vote', 'on', true);
  UPDATE votes SET
    status = 'closed',
    opened_at = p_opened_at,
    deadline = p_closed_at,
    closed_at = p_closed_at,
    eligible_count = eligible,
    voted_count = voted,
    for_count = n_for,
    against_count = n_against,
    abstain_count = n_abstain,
    constitutive_met = const_met,
    deliberative_met = delib_met,
    outcome = result
  WHERE id = p_vote_id;
  INSERT INTO resolutions (
    vote_id, subject, outcome,
    quorum_constitutive, quorum_deliberative,
    eligible_count, voted_count, for_count, against_count, abstain_count,
    constitutive_met, deliberative_met, closed_at
  ) VALUES (
    p_vote_id, v.subject, result,
    v.quorum_constitutive, v.quorum_deliberative,
    eligible, voted, n_for, n_against, n_abstain,
    const_met, delib_met, p_closed_at
  );
END;
$$;


-- Members an admin excluded from a vote when opening it. They are not in the frozen
-- electorate, cannot vote and do not count for the quorum. Written only by
-- private.exclude_from_new_vote, in the same transaction that opened the vote.
CREATE TABLE IF NOT EXISTS vote_exclusions (
  vote_id uuid NOT NULL REFERENCES votes (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles (id),
  excluded_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vote_id, profile_id)
);

REVOKE ALL ON vote_exclusions FROM PUBLIC;
ALTER TABLE vote_exclusions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.exclude_from_new_vote(
  p_actor uuid,
  p_vote_id uuid,
  p_excluded uuid[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v votes%ROWTYPE;
  removed integer := 0;
  remaining integer;
BEGIN
  IF p_excluded IS NULL OR cardinality(p_excluded) = 0 THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_actor AND role = 'admin' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'only an active admin can exclude members from a vote';
  END IF;
  SELECT * INTO v FROM votes WHERE id = p_vote_id FOR UPDATE;
  IF NOT FOUND OR v.status <> 'open' THEN
    RAISE EXCEPTION 'this vote is not open';
  END IF;
  -- Only for a vote created in this same transaction: now() is the transaction start.
  IF v.opened_at <> now() THEN
    RAISE EXCEPTION 'members can only be excluded when the vote is created';
  END IF;
  IF EXISTS (SELECT 1 FROM ballots WHERE vote_id = p_vote_id)
     OR EXISTS (SELECT 1 FROM poll_ballots WHERE vote_id = p_vote_id) THEN
    RAISE EXCEPTION 'this vote already has ballots';
  END IF;

  PERFORM set_config('nocap.electorate_write', 'on', true);
  WITH gone AS (
    DELETE FROM vote_electorate
    WHERE vote_id = p_vote_id AND profile_id = ANY (p_excluded)
    RETURNING profile_id
  ), rec AS (
    INSERT INTO vote_exclusions (vote_id, profile_id, excluded_by)
    SELECT p_vote_id, profile_id, p_actor FROM gone
    RETURNING 1
  )
  SELECT count(*)::int INTO removed FROM rec;
  PERFORM set_config('nocap.electorate_write', 'off', true);

  SELECT count(*)::int INTO remaining FROM vote_electorate WHERE vote_id = p_vote_id;
  IF remaining = 0 THEN
    RAISE EXCEPTION 'at least one member has to stay eligible to vote';
  END IF;
  RETURN removed;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.exclude_from_new_vote(uuid, uuid, uuid[]) FROM PUBLIC;

DO $grants013$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nocap_app') THEN
    EXECUTE 'GRANT SELECT ON vote_exclusions TO nocap_app';
    EXECUTE 'DROP POLICY IF EXISTS nocap_app_select ON vote_exclusions';
    EXECUTE 'CREATE POLICY nocap_app_select ON vote_exclusions FOR SELECT TO nocap_app USING (true)';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.exclude_from_new_vote(uuid, uuid, uuid[]) TO nocap_app';
  END IF;
END
$grants013$;
