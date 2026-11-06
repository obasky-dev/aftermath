import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "incidents-core",
      sql: `CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'sev2' CHECK (severity IN ('sev1', 'sev2', 'sev3')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  started_at TEXT NOT NULL,
  resolved_at TEXT,
  summary TEXT,
  customer_status TEXT,
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL DEFAULT (now()),
  updated_at TEXT NOT NULL DEFAULT (now())
);
CREATE TABLE IF NOT EXISTS incident_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('deploy', 'alert', 'error', 'log', 'chat', 'action', 'note')),
  title TEXT NOT NULL,
  detail TEXT,
  source TEXT,
  confidence INTEGER NOT NULL DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  is_root_cause BOOLEAN NOT NULL DEFAULT false,
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE TABLE IF NOT EXISTS incident_evidence (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES incident_events(id),
  label TEXT NOT NULL,
  url TEXT,
  snippet TEXT,
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE TABLE IF NOT EXISTS incident_action_items (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  title TEXT NOT NULL,
  owner TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS incidents_started_idx ON incidents (started_at DESC);
CREATE INDEX IF NOT EXISTS incident_events_incident_at_idx ON incident_events (incident_id, at);
CREATE INDEX IF NOT EXISTS incident_evidence_event_idx ON incident_evidence (event_id);
CREATE INDEX IF NOT EXISTS incident_action_items_incident_idx ON incident_action_items (incident_id)`,
    },
    {
      version: 2,
      name: "original-times-and-postmortem-approval",
      sql: `ALTER TABLE incident_events ADD COLUMN IF NOT EXISTS original_at TEXT;
UPDATE incident_events SET original_at = at WHERE original_at IS NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS postmortem_approved_at TEXT`,
    },
    {
      version: 3,
      name: "postmortem-sharing-and-comments",
      sql: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS incidents_share_token_idx ON incidents (share_token) WHERE share_token IS NOT NULL;
CREATE TABLE IF NOT EXISTS incident_comments (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  event_id TEXT,
  body TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  owner_email TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS incident_comments_incident_idx ON incident_comments (incident_id, created_at)`,
    },
  ],
  { table: "blameless_migrations" },
);
