-- Additive CRMF ETP v1.2 Store state. Apply once as the database owner on an
-- existing portable installation; fresh installations also run this in init.sql.
CREATE TABLE IF NOT EXISTS etp12_objects (
    rig_id TEXT NOT NULL REFERENCES rigs(rig_id) ON DELETE CASCADE,
    uri TEXT NOT NULL,
    format TEXT NOT NULL,
    data BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (rig_id, uri)
);

CREATE TABLE IF NOT EXISTS etp12_channels (
    rig_id TEXT NOT NULL REFERENCES rigs(rig_id) ON DELETE CASCADE,
    uri TEXT NOT NULL,
    metric TEXT NOT NULL,
    last_index_us BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (rig_id, uri)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON etp12_objects, etp12_channels TO crmf_app;
