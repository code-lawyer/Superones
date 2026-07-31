ALTER TABLE vault2077_acquisition_inbox
  ADD COLUMN IF NOT EXISTS claim_token text,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS vault2077_acquisition_retry_idx
  ON vault2077_acquisition_inbox (status, next_attempt_at, received_at);
