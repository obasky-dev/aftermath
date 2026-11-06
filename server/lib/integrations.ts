import { desc, eq } from "drizzle-orm";

import { newId } from "./incidents.js";
import { getDb, schema } from "../db/index.js";

export type ProviderCategory =
  | "hosting"
  | "database"
  | "dns"
  | "monitoring"
  | "code"
  | "comms"
  | "tickets";

export interface ProviderDefinition {
  id: string;
  name: string;
  category: ProviderCategory;
  value: string;
  coverage: "deploy" | "database" | "dns" | "monitoring" | "comms" | null;
}

export const PROVIDERS: ProviderDefinition[] = [
  { id: "vercel", name: "Vercel", category: "hosting", value: "Deploy created, promoted and rolled back as evidence", coverage: "deploy" },
  { id: "github", name: "GitHub", category: "code", value: "Merges, workflow runs and deploy commits", coverage: "deploy" },
  { id: "netlify", name: "Netlify", category: "hosting", value: "Site deploys and build failures", coverage: "deploy" },
  { id: "supabase", name: "Supabase", category: "database", value: "Failovers, migrations and connection metrics", coverage: "database" },
  { id: "neon", name: "Neon", category: "database", value: "Compute scaling and connection events", coverage: "database" },
  { id: "cloudflare", name: "Cloudflare", category: "dns", value: "DNS changes, certificates and edge errors", coverage: "dns" },
  { id: "sentry", name: "Sentry", category: "monitoring", value: "Error rate and onset evidence", coverage: "monitoring" },
  { id: "pagerduty", name: "PagerDuty", category: "monitoring", value: "Alerts, pages, acknowledgements and recovery", coverage: "monitoring" },
  { id: "datadog", name: "Datadog", category: "monitoring", value: "Metric series and flat-signal evidence", coverage: "monitoring" },
  { id: "slack", name: "Slack", category: "comms", value: "Incident channel as evidence and approvals", coverage: "comms" },
  { id: "linear", name: "Linear", category: "tickets", value: "Create issues from action items", coverage: null },
  { id: "statuspage", name: "Statuspage", category: "tickets", value: "Draft the customer status update", coverage: null },
  { id: "notion", name: "Notion", category: "tickets", value: "Export the finished postmortem", coverage: null },
];

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  hosting: "Hosting & deploy",
  database: "Database",
  dns: "Domain, DNS & CDN",
  monitoring: "Monitoring & alerting",
  code: "Code & CI",
  comms: "Comms",
  tickets: "Tickets, docs & status",
};

const COVERAGE = [
  { key: "deploy", label: "Deploy" },
  { key: "database", label: "Database" },
  { key: "dns", label: "DNS/CDN" },
  { key: "monitoring", label: "Monitoring" },
  { key: "comms", label: "Comms" },
] as const;

const FIXTURES: Record<
  string,
  { kind: string; title: string; source: string; confidence: number }
> = {
  vercel: { kind: "deploy", title: "Vercel: checkout-api promoted r-483", source: "Vercel deployments", confidence: 90 },
  github: { kind: "deploy", title: "GitHub: PR #2841 merged to main", source: "GitHub", confidence: 90 },
  netlify: { kind: "deploy", title: "Netlify: site deploy started", source: "Netlify", confidence: 85 },
  supabase: { kind: "log", title: "Supabase: replica failover, 8s", source: "Supabase", confidence: 80 },
  neon: { kind: "log", title: "Neon: compute scaled to zero", source: "Neon", confidence: 70 },
  cloudflare: { kind: "note", title: "Cloudflare: DNS record changed", source: "Cloudflare", confidence: 75 },
  sentry: { kind: "error", title: "Sentry: checkout 5xx at 18%", source: "Sentry", confidence: 92 },
  pagerduty: { kind: "alert", title: "PagerDuty: checkout-api paged", source: "PagerDuty", confidence: 95 },
  datadog: { kind: "log", title: "Datadog: DB connection errors flat", source: "Datadog", confidence: 88 },
  slack: { kind: "chat", title: "Slack: on-call reports checkout errors", source: "Slack #incidents", confidence: 70 },
};

export interface ConnectionView extends ProviderDefinition {
  mode: string;
  status: string;
  lastChecked: string | null;
  lastError: string | null;
  inbound: boolean;
}

type Owner = {
  userEmail?: string | null | undefined;
  orgId?: string | null | undefined;
};

export async function listConnections() {
  const rows = await getDb().select().from(schema.integrationState);
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  const providers: ConnectionView[] = PROVIDERS.map((provider) => {
    const state = byProvider.get(provider.id);
    return {
      ...provider,
      mode: state?.mode ?? "fixture",
      status: state?.status ?? "not_connected",
      lastChecked: state?.lastChecked ?? null,
      lastError: state?.lastError ?? null,
      inbound: Boolean(FIXTURES[provider.id]),
    };
  });

  const coverage = COVERAGE.map((segment) => {
    const connected = providers.filter(
      (provider) => provider.coverage === segment.key && provider.status === "connected",
    );
    return {
      key: segment.key,
      label: segment.label,
      connected: connected.length > 0,
      providers: connected.map((provider) => provider.name),
    };
  });

  const connectedCount = providers.filter((provider) => provider.status === "connected").length;
  return { providers, coverage, connectedCount, total: providers.length };
}

async function recordDelivery(input: {
  provider: string;
  event: string;
  status: string;
  incidentId?: string | null;
  owner?: Owner;
}) {
  const at = new Date().toISOString();
  const id = newId("dlv");
  await getDb().insert(schema.integrationDeliveries).values({
    id,
    provider: input.provider,
    event: input.event,
    status: input.status,
    at,
    incidentId: input.incidentId ?? null,
    ownerEmail: input.owner?.userEmail ?? "",
    orgId: input.owner?.orgId ?? null,
  });
  return { id, provider: input.provider, event: input.event, status: input.status, at, incidentId: input.incidentId ?? null };
}

function definition(provider: string) {
  return PROVIDERS.find((candidate) => candidate.id === provider) ?? null;
}

export async function connectProvider(provider: string, owner: Owner) {
  const found = definition(provider);
  if (!found) throw new Error("Unknown provider");
  const lastChecked = new Date().toISOString();
  await getDb()
    .insert(schema.integrationState)
    .values({
      provider,
      mode: "fixture",
      status: "connected",
      lastChecked,
      ownerEmail: owner.userEmail ?? "",
      orgId: owner.orgId ?? null,
    })
    .onConflictDoUpdate({
      target: schema.integrationState.provider,
      set: { status: "connected", lastChecked },
    });
  const delivery = await recordDelivery({
    provider,
    event: "connection.verified",
    status: "fixture",
    owner,
  });
  return { ok: true, provider, mode: "fixture", lastChecked, delivery };
}

export async function disconnectProvider(provider: string) {
  const found = definition(provider);
  if (!found) throw new Error("Unknown provider");
  const lastChecked = new Date().toISOString();
  await getDb()
    .update(schema.integrationState)
    .set({ status: "not_connected", lastChecked })
    .where(eq(schema.integrationState.provider, provider));
  const delivery = await recordDelivery({
    provider,
    event: "connection.disconnected",
    status: "ok",
  });
  return { ok: true, provider, lastChecked, delivery };
}

export async function testProvider(provider: string) {
  const found = definition(provider);
  if (!found) throw new Error("Unknown provider");
  const delivery = await recordDelivery({
    provider,
    event: "connection.test",
    status: "fixture",
  });
  return { ok: true, provider, mode: "fixture", delivery };
}

export async function sendFixture(
  provider: string,
  incidentId: string,
  owner: Owner,
) {
  const found = definition(provider);
  const fixture = FIXTURES[provider];
  if (!found) throw new Error("Unknown provider");
  if (!fixture) throw new Error("This provider is outbound only");

  const [incident] = await getDb()
    .select({ id: schema.incidents.id })
    .from(schema.incidents)
    .where(eq(schema.incidents.id, incidentId))
    .limit(1);
  if (!incident) throw new Error("Incident not found");

  const at = new Date().toISOString();
  const eventId = newId("evt");
  await getDb().insert(schema.incidentEvents).values({
    id: eventId,
    incidentId,
    at,
    kind: fixture.kind,
    title: fixture.title,
    detail: `Fixture delivery from ${found.name}.`,
    source: fixture.source,
    confidence: fixture.confidence,
    isRootCause: false,
    eventStatus: "confirmed",
    editedBy: "agent",
    originalAt: at,
    ownerEmail: owner.userEmail ?? "",
    orgId: owner.orgId ?? null,
  });
  const delivery = await recordDelivery({
    provider,
    event: fixture.title,
    status: "fixture",
    incidentId,
    owner,
  });
  return { ok: true, provider, eventId, title: fixture.title, delivery };
}

export async function listDeliveries(provider?: string) {
  const rows = await getDb()
    .select({
      id: schema.integrationDeliveries.id,
      provider: schema.integrationDeliveries.provider,
      event: schema.integrationDeliveries.event,
      status: schema.integrationDeliveries.status,
      at: schema.integrationDeliveries.at,
      incidentId: schema.integrationDeliveries.incidentId,
    })
    .from(schema.integrationDeliveries)
    .where(provider ? eq(schema.integrationDeliveries.provider, provider) : undefined)
    .orderBy(desc(schema.integrationDeliveries.at))
    .limit(30);
  return rows;
}
