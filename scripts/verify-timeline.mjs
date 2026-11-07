#!/usr/bin/env node
/**
 * End-to-end proof for Aftermath, using the same HTTP action surface as the UI.
 * Requires the dev server to be running (default http://localhost:8080).
 *
 *   pnpm verify:timeline
 */
const BASE = process.argv[2] ?? "http://localhost:8080";

let cookie = "";
const results = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

async function call(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    cookie = setCookies.map((value) => value.split(";")[0]).join("; ");
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

const auth = await call("/_agent-native/auth/local-dev", {
  method: "POST",
  body: "{}",
});
check("local-dev sign-in", auth.status === 200, `status ${auth.status}`);

const list = await call("/_agent-native/actions/list-incidents");
for (const legacy of (list.json?.incidents ?? []).filter(
  (row) => row.title === "Checkout latency spike",
)) {
  await call("/_agent-native/actions/delete-incident", {
    method: "DELETE",
    body: JSON.stringify({ id: legacy.id }),
  });
}
const seeded = await call("/_agent-native/actions/seed-demo-incident", {
  method: "POST",
  body: "{}",
});
const seed =
  list.json?.incidents?.find((row) => row.title === "Checkout API 5xx spike") ??
  (seeded.json?.incidentId
    ? { id: seeded.json.incidentId, title: "Checkout API 5xx spike" }
    : null);
check("seed incident is present", Boolean(seed), seed?.id ?? "missing");

let root = null;
try {
  if (!seed) throw new Error("cannot continue without the seed incident");

  const incident = await call(
    `/_agent-native/actions/get-incident?id=${encodeURIComponent(seed.id)}`,
  );
  const events = incident.json?.events ?? [];
  root = events.find((event) => event.isRootCause) ?? null;
  check("seed has an 11-event timeline", events.length === 11, `${events.length} events`);
  check("seed has a suspected cause", Boolean(root), root?.title ?? "none");

  const originalAnalysis = await call(
    `/_agent-native/actions/analyze-incident?id=${encodeURIComponent(seed.id)}&mode=original`,
  );
  const originalJson = originalAnalysis.json;
  check(
    "original timeline: the deploy is 25 minutes early",
    originalJson?.verdict === "weak" &&
      originalJson?.deltaMinutes === 25 &&
      originalJson?.exposure?.minutes === 43,
    `${originalJson?.verdict} / ${originalJson?.deltaMinutes} / exposure ${originalJson?.exposure?.minutes}`,
  );
  check(
    "original leading cause is the database failover",
    originalJson?.leading?.label === "Database replica failover" &&
      originalJson?.leading?.lagMinutes === 5,
    `${originalJson?.leading?.label} / ${originalJson?.leading?.lagMinutes}`,
  );

  const movedAt = "2026-11-04T14:02:00.000Z";
  const move = await call("/_agent-native/actions/update-incident-event", {
    method: "PUT",
    body: JSON.stringify({ id: root.id, at: movedAt }),
  });
  check(
    "correction persists",
    move.status === 200 && move.json?.at === movedAt,
    move.json?.at ?? move.text.slice(0, 80),
  );

  const currentAnalysis = await call(
    `/_agent-native/actions/analyze-incident?id=${encodeURIComponent(seed.id)}&mode=current`,
  );
  const currentJson = currentAnalysis.json;
  check(
    "corrected timeline: the deploy leads at 3 minutes",
    currentJson?.verdict === "consistent" &&
      currentJson?.deltaMinutes === 3 &&
      currentJson?.leading?.lagMinutes === 3 &&
      currentJson?.exposure?.minutes === 21,
    `${currentJson?.verdict} / ${currentJson?.deltaMinutes} / exposure ${currentJson?.exposure?.minutes}`,
  );
  check(
    "the database failover is contradicted",
    (currentJson?.hypotheses ?? []).some(
      (hypothesis) =>
        hypothesis.label === "Database replica failover" &&
        hypothesis.status === "contradicted",
    ),
    "hypothesis status",
  );

  const originalAgain = await call(
    `/_agent-native/actions/analyze-incident?id=${encodeURIComponent(seed.id)}&mode=original`,
  );
  check(
    "the original timeline is preserved",
    originalAgain.json?.verdict === "weak",
    originalAgain.json?.verdict,
  );

  const postmortem = await call(
    `/_agent-native/actions/generate-postmortem?id=${encodeURIComponent(seed.id)}`,
  );
  const markdown = postmortem.json?.markdown ?? "";
  check(
    "postmortem cites the correction",
    markdown.includes("originally 13:40 UTC") &&
      markdown.includes("corrected to 14:02 UTC"),
    "correction log",
  );
  check(
    "postmortem includes metrics and candidate causes",
    markdown.includes("## Metrics") && markdown.includes("## Candidate causes"),
    "sections",
  );

  const challenge = await call(
    `/_agent-native/actions/challenge-incident?id=${encodeURIComponent(seed.id)}`,
  );
  check(
    "challenge is evidence-based",
    challenge.json?.corrected === true &&
      (challenge.json?.challenges?.length ?? 0) >= 2,
    `${challenge.json?.challenges?.length ?? 0} challenges`,
  );

  const approval = await call("/_agent-native/actions/approve-postmortem", {
    method: "POST",
    body: JSON.stringify({ id: seed.id }),
  });
  check(
    "owner-only approval is refused outside the UI",
    approval.status === 403,
    `status ${approval.status}`,
  );

  const comment = await call("/_agent-native/actions/add-incident-comment", {
    method: "POST",
    body: JSON.stringify({
      incidentId: seed.id,
      body: "Verify: the pool saturation lines up with the corrected deploy.",
    }),
  });
  const commentId = comment.json?.id;
  check(
    "comments are added",
    comment.status === 200 && Boolean(commentId),
    commentId ?? "no id",
  );
  const comments = await call(
    `/_agent-native/actions/list-incident-comments?incidentId=${encodeURIComponent(seed.id)}`,
  );
  check(
    "comments are listed",
    (comments.json?.comments ?? []).some((row) => row.id === commentId),
    `${comments.json?.comments?.length ?? 0} comments`,
  );
  if (commentId) {
    await call("/_agent-native/actions/delete-incident-comment", {
      method: "DELETE",
      body: JSON.stringify({ id: commentId }),
    });
  }

  const share = await call("/_agent-native/actions/create-postmortem-share", {
    method: "POST",
    body: JSON.stringify({ id: seed.id }),
  });
  const sharePath = share.json?.path;
  check(
    "a public share link is created",
    share.status === 200 && typeof sharePath === "string" && sharePath.startsWith("/share/"),
    sharePath ?? "no path",
  );
  if (typeof sharePath === "string") {
    const publicPage = await fetch(`${BASE}${sharePath}`);
    const html = await publicPage.text();
    check(
      "the shared postmortem loads without a session",
      publicPage.status === 200 &&
        html.includes("Checkout API 5xx spike") &&
        html.includes("Discussion"),
      `${publicPage.status} · ${html.length} bytes`,
    );
  }

  const filtered = await call(
    "/_agent-native/actions/list-incidents?search=Checkout%20API&severity=sev1&status=resolved",
  );
  check(
    "search and filters narrow the list",
    filtered.json?.incidents?.length === 1,
    `${filtered.json?.incidents?.length ?? 0} results`,
  );
  const emptySearch = await call("/_agent-native/actions/list-incidents?search=zzzz");
  check(
    "search can return nothing",
    emptySearch.json?.incidents?.length === 0,
    `${emptySearch.json?.incidents?.length ?? 0} results`,
  );

  const readiness = await call(
    `/_agent-native/actions/get-readiness?id=${encodeURIComponent(seed.id)}`,
  );
  check(
    "readiness passes after the correction",
    readiness.json?.ready === true && (readiness.json?.checks?.length ?? 0) === 7,
    `${readiness.json?.ready} / ${readiness.json?.checks?.length ?? 0} checks`,
  );

  const summaries = await call(
    `/_agent-native/actions/get-summaries?id=${encodeURIComponent(seed.id)}`,
  );
  check(
    "three audience summaries are generated",
    Boolean(summaries.json?.engineer) &&
      Boolean(summaries.json?.executive) &&
      Boolean(summaries.json?.customer) &&
      summaries.json.customer.includes("restored"),
    "engineer/executive/customer",
  );

  const createdArtifacts = await call(
    "/_agent-native/actions/create-postmortem-artifacts",
    { method: "POST", body: JSON.stringify({ id: seed.id }) },
  );
  const artifactRows = createdArtifacts.json?.artifacts ?? [];
  check(
    "approval artifacts are created as labelled fixtures",
    artifactRows.length === 5 && artifactRows.every((row) => row.mode === "fixture"),
    `${artifactRows.length} artifacts`,
  );

  const listedArtifacts = await call(
    `/_agent-native/actions/get-postmortem-artifacts?id=${encodeURIComponent(seed.id)}`,
  );
  check(
    "artifacts are listed for the incident",
    (listedArtifacts.json?.artifacts ?? []).length === 5,
    `${listedArtifacts.json?.artifacts?.length ?? 0} artifacts`,
  );

  const integrations = await call("/_agent-native/actions/list-integrations");
  check(
    "provider catalog and coverage are present",
    (integrations.json?.providers?.length ?? 0) >= 10 &&
      (integrations.json?.coverage?.length ?? 0) === 5,
    `${integrations.json?.providers?.length ?? 0} providers`,
  );

  const connected = await call("/_agent-native/actions/connect-integration", {
    method: "POST",
    body: JSON.stringify({ provider: "sentry" }),
  });
  check(
    "a provider connects in fixture mode",
    connected.status === 200 && connected.json?.mode === "fixture",
    connected.json?.mode ?? "no mode",
  );

  const fixture = await call("/_agent-native/actions/send-integration-fixture", {
    method: "POST",
    body: JSON.stringify({ provider: "sentry", incidentId: seed.id }),
  });
  check(
    "a fixture event appends to the timeline",
    fixture.status === 200 && Boolean(fixture.json?.eventId),
    fixture.json?.eventId ?? "no event",
  );

  const deliveries = await call("/_agent-native/actions/list-integration-deliveries");
  check(
    "deliveries are recorded",
    (deliveries.json?.deliveries ?? []).some((row) => row.provider === "sentry"),
    `${deliveries.json?.deliveries?.length ?? 0} deliveries`,
  );

  if (fixture.json?.eventId) {
    await call("/_agent-native/actions/delete-incident-event", {
      method: "DELETE",
      body: JSON.stringify({ id: fixture.json.eventId }),
    });
  }
  await call("/_agent-native/actions/disconnect-integration", {
    method: "POST",
    body: JSON.stringify({ provider: "sentry" }),
  });

  const simulated = await call(
    `/_agent-native/actions/simulate-rollback?id=${encodeURIComponent(seed.id)}&at=2026-11-04T14:10:00.000Z`,
  );
  check(
    "what-if rollback recomputes exposure",
    simulated.json?.baselineMinutes === 21 &&
      simulated.json?.rollbackMinutes === 8 &&
      simulated.json?.savedMinutes === 13,
    `${simulated.json?.baselineMinutes} -> ${simulated.json?.rollbackMinutes}`,
  );

  const ingest = await call("/_agent-native/actions/start-ingest", {
    method: "POST",
    body: JSON.stringify({
      incidentId: seed.id,
      bundle: [
        "2026-11-04 14:12 [chat] Ingest check one | Slack #incidents",
        "2026-11-04 14:20 [log] Ingest check two | Vercel deployments",
      ].join("\n"),
    }),
  });
  const runId = ingest.json?.runId;
  check("durable ingest starts", Boolean(runId), runId ?? "no run");

  let run = null;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    run = await call(
      `/_agent-native/actions/get-ingest-run?id=${encodeURIComponent(String(runId))}`,
    );
    if (run.json?.status !== "running") break;
  }
  check(
    "durable ingest completes all three stages",
    run?.json?.status === "complete" && run?.json?.progress === 100,
    `${run?.json?.status} / ${run?.json?.progress}%`,
  );

  if (runId) {
    const afterIngest = await call(
      `/_agent-native/actions/get-incident?id=${encodeURIComponent(seed.id)}`,
    );
    for (const event of (afterIngest.json?.events ?? []).filter((row) =>
      /Ingest check/.test(row.title),
    )) {
      await call("/_agent-native/actions/delete-incident-event", {
        method: "DELETE",
        body: JSON.stringify({ id: event.id }),
      });
    }
  }

  const pack = [
    "2026-11-02 09:00 [alert] disk full on node-3 | node-exporter",
    "09:01 [error] writes fail with ENOSPC | app logs",
    "09:04 [action] cleared old images and restarted | runbook",
  ].join("\n");
  const imported = await call("/_agent-native/actions/create-incident-from-pack", {
    method: "POST",
    body: JSON.stringify({ pack, title: "Verify import", date: "2026-11-02" }),
  });
  const importedId = imported.json?.id;
  check(
    "pack import creates a timeline",
    imported.status === 200 && imported.json?.events === 3 && Boolean(importedId),
    `${imported.json?.events ?? "?"} events`,
  );

  if (importedId) {
    const importedDetail = await call(
      `/_agent-native/actions/get-incident?id=${encodeURIComponent(importedId)}`,
    );
    check(
      "imported events keep their source",
      (importedDetail.json?.events ?? []).some(
        (event) => event.source === "node-exporter",
      ),
      "source",
    );
    await call("/_agent-native/actions/delete-incident", {
      method: "DELETE",
      body: JSON.stringify({ id: importedId }),
    });
    const afterDelete = await call("/_agent-native/actions/list-incidents");
    check(
      "cleanup removed the imported incident",
      !(afterDelete.json?.incidents ?? []).some((row) => row.id === importedId),
      importedId,
    );
  }

  const installed = await call("/_agent-native/actions/install-alert-webhook", {
    method: "POST",
    body: JSON.stringify({ rotate: true }),
  });
  const alertToken = installed.json?.token;
  check(
    "alert webhook installs with a token",
    installed.status === 200 && typeof alertToken === "string" && alertToken.length === 32,
    alertToken ? `${alertToken.length} chars` : "no token",
  );

  const wrongToken = await fetch(`${BASE}/api/ingest-alert`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-aftermath-token": "wrong" },
    body: JSON.stringify({ title: "should be rejected" }),
  });
  check("alert webhook rejects a wrong token", wrongToken.status === 401, `status ${wrongToken.status}`);

  const alertResponse = await fetch(`${BASE}/api/ingest-alert`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aftermath-token": String(alertToken),
    },
    body: JSON.stringify({
      title: "Verify alert intake",
      severity: "sev1",
      source: "node-exporter",
    }),
  });
  const alertJson = await alertResponse.json().catch(() => null);
  const alertIncidentId = alertJson?.id;
  check(
    "alert webhook creates an incident",
    alertResponse.status === 202 && Boolean(alertIncidentId) && alertJson?.severity === "sev1",
    `${alertResponse.status} ${alertIncidentId ?? ""}`,
  );

  if (alertIncidentId) {
    const alertDetail = await call(
      `/_agent-native/actions/get-incident?id=${encodeURIComponent(alertIncidentId)}`,
    );
    check(
      "alert incident keeps its source",
      (alertDetail.json?.events ?? []).some(
        (event) => event.source === "node-exporter",
      ),
      "source",
    );
    await call("/_agent-native/actions/delete-incident", {
      method: "DELETE",
      body: JSON.stringify({ id: alertIncidentId }),
    });
  }
} finally {
  if (root) {
    await call("/_agent-native/actions/update-incident-event", {
      method: "PUT",
      body: JSON.stringify({ id: root.id, at: root.at }),
    });
  }
}

const failed = results.filter((row) => !row.ok);
for (const row of results) {
  console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.name}${row.detail ? `  (${row.detail})` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
