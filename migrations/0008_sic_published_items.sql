CREATE TABLE IF NOT EXISTS vault2077_sic_published_items (
  identity_key text PRIMARY KEY,
  source_id text NOT NULL,
  content_group text NOT NULL CHECK (content_group IN ('papers', 'documents', 'courses', 'podcasts')),
  item jsonb NOT NULL CHECK (jsonb_typeof(item) = 'object'),
  source_snapshot_id text NOT NULL,
  source_collected_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  first_published_at timestamptz NOT NULL DEFAULT now(),
  last_published_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);

CREATE INDEX IF NOT EXISTS vault2077_sic_published_items_active_group_idx
  ON vault2077_sic_published_items (content_group, source_collected_at DESC)
  WHERE active;

CREATE INDEX IF NOT EXISTS vault2077_sic_published_items_source_idx
  ON vault2077_sic_published_items (source_id, active, source_collected_at DESC);

CREATE TABLE IF NOT EXISTS vault2077_sic_publication_meta (
  singleton smallint PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  legacy_projection_digest text NOT NULL CHECK (legacy_projection_digest ~ '^[0-9a-f]{64}$'),
  initialized_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
