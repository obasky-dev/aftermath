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
const seed = list.json?.incidents?.find((row) => row.title === "Checkout latency spike");
check("seed incident is present", Boolean(seed), seed?.id ?? "missing");

let root = null;
try {
  if (!seed) throw new Error("cannot continue without the seed incident");

  const incident = await call(
    `/_agent-native/actions/get-incident?id=${encodeURIComponent(seed.id)}`,
  );
  const events = incident.json?.events ?? [];
  root = events.find((event) => event.isRootCause) ?? null;
  check("seed has a 12-event timeline", events.length === 12, `${events.length} events`);
  check("seed has a suspected cause", Boolean(root), root?.title ?? "none");

  const originalAnalysis = await call(
    `/_agent-native/actions/analyze-incident?id=${encodeURIComponent(seed.id)}&mode=original`,
  );
  check(
    "original timeline is consistent (+1 min)",
    originalAnalysis.json?.verdict === "consistent" &&
      originalAnalysis.json?.deltaMinutes === 1,
    `${originalAnalysis.json?.verdict} / ${originalAnalysis.json?.deltaMinutes}`,
  );

  const movedAt = new Date(Date.parse(root.at) + 10 * 60_000).toISOString();
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
  check(
    "corrected timeline is contradicted (-9 min)",
    currentAnalysis.json?.verdict === "contradicted" &&
      currentAnalysis.json?.deltaMinutes === -9,
    `${currentAnalysis.json?.verdict} / ${currentAnalysis.json?.deltaMinutes}`,
  );

  const originalAgain = await call(
    `/_agent-native/actions/analyze-incident?id=${encodeURIComponent(seed.id)}&mode=original`,
  );
  check(
    "the original timeline is preserved",
    originalAgain.json?.verdict === "consistent",
    originalAgain.json?.verdict,
  );

  const postmortem = await call(
    `/_agent-native/actions/generate-postmortem?id=${encodeURIComponent(seed.id)}`,
  );
  const markdown = postmortem.json?.markdown ?? "";
  check(
    "postmortem cites the correction",
    markdown.includes("originally 14:02 UTC") &&
      markdown.includes("corrected to 14:12 UTC"),
    "correction log",
  );
  check(
    "postmortem summary follows the corrected verdict",
    markdown.includes("CONTRADICTED"),
    "verdict line",
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
