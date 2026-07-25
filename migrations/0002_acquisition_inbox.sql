CREATE TABLE IF NOT EXISTS vault2077_acquisition_inbox (
  batch_id text PRIMARY KEY,
  run_id text NOT NULL,
  lane text NOT NULL CHECK (lane IN ('information', 'roadside', 'sic', 'rankings')),
  run_mode text NOT NULL CHECK (run_mode IN ('incremental', 'bootstrap')),
  schedule_id text NOT NULL,
  window_from timestamptz NOT NULL,
  window_until timestamptz NOT NULL,
  registry_revision text NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'processing', 'processed', 'retryable', 'quarantined')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  record_count integer NOT NULL CHECK (record_count >= 0),
  source_count integer NOT NULL CHECK (source_count >= 0),
  kinds jsonb NOT NULL,
  processing_started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  raw_payload text NOT NULL
);

CREATE INDEX IF NOT EXISTS vault2077_acquisition_claim_idx
  ON vault2077_acquisition_inbox (status, received_at);
