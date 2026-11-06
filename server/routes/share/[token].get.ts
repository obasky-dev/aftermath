import { eq } from "drizzle-orm";
import { defineEventHandler, getRouterParam, setResponseHeader, setResponseStatus } from "h3";

import { getDb, schema } from "../../db/index.js";
import { buildPostmortem } from "../../lib/postmortem.js";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

/** Minimal Markdown for the subset buildPostmortem emits. */
function markdownToHtml(markdown: string) {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (list.length > 0) {
      html.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      continue;
    }
    flush();
    if (!line || line === "---") {
      if (line === "---") html.push("<hr />");
      continue;
    }
    if (line.startsWith("## ")) {
      html.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      html.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else {
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return html.join("\n");
}

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — Aftermath</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f7f4ec; color: #1a1815; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 56px 24px 72px; }
  .eyebrow { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: #6b6357; }
  h1 { font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif; font-size: 42px; line-height: 1.05; letter-spacing: -.02em; margin: 14px 0 20px; }
  h2 { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: #6b6357; margin: 32px 0 8px; }
  p { font-size: 15px; line-height: 1.65; margin: 8px 0; }
  ul { margin: 8px 0; padding-left: 20px; }
  li { font-size: 15px; line-height: 1.6; margin: 4px 0; }
  hr { border: 0; border-top: 1px solid #ddd6c8; margin: 32px 0; }
  .meta { border-top: 1px solid #ddd6c8; margin-top: 36px; padding-top: 14px; font-size: 11px; color: #6b6357; }
  footer { max-width: 760px; margin: 0 auto; padding: 0 24px 48px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: #8a8072; }
</style>
</head>
<body>
<main>
<p class="eyebrow">Aftermath · Shared postmortem</p>
${body}
<p class="meta">Read-only snapshot generated from the incident timeline. The verdict is computed, not narrated.</p>
</main>
<footer>Aftermath · Agent-Native hackathon</footer>
</body>
</html>`;
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  const [incident] = await getDb()
    .select({ id: schema.incidents.id })
    .from(schema.incidents)
    .where(eq(schema.incidents.shareToken, token))
    .limit(1);

  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  setResponseHeader(event, "cache-control", "no-store");

  if (!incident) {
    setResponseStatus(event, 404);
    return page("Not found", "<h1>This postmortem is not available.</h1><p>The link may have been revoked.</p>");
  }

  const postmortem = await buildPostmortem(incident.id);
  const body = markdownToHtml(postmortem.markdown);
  return page(postmortem.title, body);
});
