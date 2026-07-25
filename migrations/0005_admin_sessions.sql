CREATE TABLE IF NOT EXISTS vault2077_admin_sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  actor_hash text NOT NULL CHECK (actor_hash ~ '^[a-f0-9]{24}$'),
  role text NOT NULL CHECK (role IN ('owner')),
  issued_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  reauthenticated_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (issued_at <= last_seen_at),
  CHECK (idle_expires_at <= absolute_expires_at)
);

CREATE INDEX IF NOT EXISTS vault2077_admin_sessions_active_idx
  ON vault2077_admin_sessions (idle_expires_at, absolute_expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS vault2077_admin_sessions_actor_idx
  ON vault2077_admin_sessions (actor_hash, issued_at DESC);
