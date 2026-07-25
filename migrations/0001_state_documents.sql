CREATE TABLE IF NOT EXISTS vault2077_state_documents (
  namespace text PRIMARY KEY,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault2077_state_documents_updated_at_idx
  ON vault2077_state_documents (updated_at DESC);
