CREATE TABLE IF NOT EXISTS vault2077_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_hash text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  result text NOT NULL CHECK (result IN ('success', 'rejected', 'failed')),
  reason text,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS vault2077_audit_log_occurred_at_idx
  ON vault2077_audit_log (occurred_at DESC);

CREATE OR REPLACE FUNCTION vault2077_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'vault2077_audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS vault2077_audit_log_immutable ON vault2077_audit_log;
CREATE TRIGGER vault2077_audit_log_immutable
BEFORE UPDATE OR DELETE ON vault2077_audit_log
FOR EACH ROW EXECUTE FUNCTION vault2077_reject_audit_mutation();

CREATE TABLE IF NOT EXISTS vault2077_login_throttle (
  client_hash text PRIMARY KEY,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
