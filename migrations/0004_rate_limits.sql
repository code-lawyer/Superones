CREATE TABLE IF NOT EXISTS vault2077_rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL CHECK (count > 0),
  window_started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault2077_rate_limits_updated_at_idx
  ON vault2077_rate_limits (updated_at);
