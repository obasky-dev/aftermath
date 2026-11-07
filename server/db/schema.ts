import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import { ownableColumns } from "@agent-native/core/db/schema";

/**
 * Incidents are workspace-visible: an incident room is shared by everyone
 * responding to it, so reads are not filtered by owner.
 */
export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  severity: text("severity").notNull().default("sev2"),
  status: text("status").notNull().default("open"),
  service: text("service"),
  source: text("source"),
  startedAt: text("started_at").notNull(),
  resolvedAt: text("resolved_at"),
  summary: text("summary"),
  customerStatus: text("customer_status"),
  postmortemApprovedAt: text("postmortem_approved_at"),
  shareToken: text("share_token"),
  ...ownableColumns(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
});

export const incidentEvents = pgTable("incident_events", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull(),
  at: text("at").notNull(),
  kind: text("kind").notNull().default("note"),
  title: text("title").notNull(),
  detail: text("detail"),
  source: text("source"),
  confidence: integer("confidence").notNull().default(50),
  isRootCause: boolean("is_root_cause").notNull().default(false),
  eventStatus: text("event_status").notNull().default("confirmed"),
  editedBy: text("edited_by").notNull().default("human"),
  originalAt: text("original_at"),
  ...ownableColumns(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const incidentEvidence = pgTable("incident_evidence", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  label: text("label").notNull(),
  url: text("url"),
  snippet: text("snippet"),
  ...ownableColumns(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const incidentActionItems = pgTable("incident_action_items", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull(),
  title: text("title").notNull(),
  owner: text("owner"),
  dueAt: text("due_at"),
  status: text("status").notNull().default("open"),
  ...ownableColumns(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const incidentComments = pgTable("incident_comments", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull(),
  eventId: text("event_id"),
  body: text("body").notNull(),
  author: text("author").notNull().default(""),
  ...ownableColumns(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const postmortemArtifacts = pgTable("postmortem_artifacts", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull(),
  provider: text("provider").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  status: text("status").notNull().default("draft"),
  mode: text("mode").notNull().default("fixture"),
  payload: text("payload"),
  ...ownableColumns(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const integrationState = pgTable("integration_state", {
  provider: text("provider").primaryKey(),
  mode: text("mode").notNull().default("fixture"),
  status: text("status").notNull().default("not_connected"),
  lastChecked: text("last_checked"),
  lastError: text("last_error"),
  settings: text("settings"),
  ...ownableColumns(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const integrationDeliveries = pgTable("integration_deliveries", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  event: text("event").notNull(),
  status: text("status").notNull(),
  at: text("at").notNull(),
  incidentId: text("incident_id"),
  deliveryKey: text("delivery_key"),
  ...ownableColumns(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const ingestRuns = pgTable("ingest_runs", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull(),
  status: text("status").notNull().default("running"),
  stage: text("stage").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  bundle: text("bundle").notNull(),
  error: text("error"),
  ...ownableColumns(),
  startedAt: text("started_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
});

export const pastIncidents = pgTable("past_incidents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  rootCauseTag: text("root_cause_tag"),
  ...ownableColumns(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});
