export type PackKind =
  | "deploy"
  | "alert"
  | "error"
  | "log"
  | "chat"
  | "action"
  | "note";

export interface ParsedEvent {
  at: string;
  kind: PackKind;
  title: string;
  source: string | null;
  confidence: number;
}

export interface ParsedPack {
  title: string;
  events: ParsedEvent[];
  skipped: number;
}

const KINDS: PackKind[] = ["deploy", "alert", "error", "log", "chat", "action", "note"];

const CONFIDENCE: Record<PackKind, number> = {
  deploy: 90,
  alert: 90,
  error: 85,
  log: 80,
  chat: 70,
  action: 90,
  note: 50,
};

function inferKind(text: string): PackKind {
  if (/\b(deploy(?:ed|s|ment)?|release(?:d)?|rollout|shipped|merged)\b/i.test(text)) {
    return "deploy";
  }
  if (/\b(alert(?:s)?|paging|pager|threshold|breach)\b/i.test(text)) return "alert";
  if (
    /\b(error(?:s)?|5xx|4xx|timeout(?:s)?|timed out|exception(?:s)?|fail(?:ed|ure|ures)?)\b/i.test(
      text,
    )
  ) {
    return "error";
  }
  if (/\b(slack|chat|report(?:ed|s)?|customer(?:s)?|support)\b/i.test(text)) return "chat";
  if (/\b(ack(?:nowledged)?|rollback|rolled back|resolved|restarted|scaled)\b/i.test(text)) {
    return "action";
  }
  if (
    /\b(log(?:s)?|metric(?:s)?|pool|connection(?:s)?|latency|p95|p99|cpu|memory)\b/i.test(text)
  ) {
    return "log";
  }
  return "note";
}

/**
 * Normalizes WebVTT/SRT cues into the one-line pack format. The cue start time
 * is the event time; the spoken text becomes a chat event. No date is invented:
 * cues borrow the pack's date when it has one, otherwise today (UTC).
 */
function transcriptToPackLines(text: string): string {
  if (!/-->\s*\d{2}:\d{2}:\d{2}/.test(text)) return text;
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const cue = lines[index]?.trim().match(
      /^(\d{2}):(\d{2}):(\d{2})[.,]\d{3}\s+-->\s+/,
    );
    if (!cue) continue;
    const [, hours, minutes] = cue;
    const spoken: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next]?.trim() ?? "";
      if (!line) break;
      if (/^\d{1,2}$/.test(line) || /-->\s*\d{2}:\d{2}:\d{2}/.test(line)) break;
      spoken.push(line);
      index = next;
    }
    const body = spoken.join(" ").trim();
    if (!body) continue;
    out.push(`${hours}:${minutes} [chat] ${body} | Transcript`);
  }
  return out.join("\n");
}

function dateFor(line: string, fallbackDate: string): string | null {
  const full = line.match(/(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if (full) {
    const date = full[1]!;
    const hours = full[2]!;
    const minutes = full[3]!;
    return `${date}T${hours.padStart(2, "0")}:${minutes}:00.000Z`;
  }
  const time = line.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/);
  if (time) {
    const hours = time[1]!;
    const minutes = time[2]!;
    return `${fallbackDate}T${hours.padStart(2, "0")}:${minutes}:00.000Z`;
  }
  return null;
}

/**
 * Parses a pasted operational pack into timeline events.
 *
 * Accepted line shape (date and bracket optional):
 *   2026-11-02 14:03 [error] Error rate climbs to 8.4% | Grafana
 *   14:06 customers report failed payments | Slack #support
 *
 * Lines without a time are skipped. The kind comes from the bracket, or is
 * inferred from the words in the line. Everything is UTC.
 */
export function parseIncidentPack(text: string, fallbackDate?: string): ParsedPack {
  const normalized = transcriptToPackLines(text);
  const explicitDate = normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  const defaultDate =
    fallbackDate ?? explicitDate ?? new Date().toISOString().slice(0, 10);
  const events: ParsedEvent[] = [];
  let skipped = 0;
  const titleCandidates: string[] = [];

  for (const raw of normalized.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    const at = dateFor(line, defaultDate);
    if (!at) {
      skipped += 1;
      continue;
    }

    const cleaned = line
      .replace(/^\d{4}-\d{2}-\d{2}[ T]/, "")
      .replace(/^\d{1,2}:\d{2}\s*/, "")
      .trim();

    const bracket = cleaned.match(/^\[([a-z]+)\]\s*/i);
    const bracketKind = bracket
      ? (KINDS.find((kind) => kind === (bracket[1] ?? "").toLowerCase()) ?? null)
      : null;
    const body = bracket ? cleaned.slice(bracket[0].length) : cleaned;

    const parts = body.split("|");
    const head = parts[0] ?? "";
    const rest = parts.slice(1);
    const source = rest.length > 0 ? rest.join("|").trim() || null : null;
    const title = head.trim();
    if (!title) {
      skipped += 1;
      continue;
    }

    const kind = bracketKind ?? inferKind(`${title} ${source ?? ""}`);
    events.push({
      at,
      kind,
      title,
      source,
      confidence: CONFIDENCE[kind],
    });
    if (kind === "alert" || kind === "deploy") titleCandidates.push(title);
  }

  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return {
    title: titleCandidates[0] ?? events[0]?.title ?? "Imported incident",
    events,
    skipped,
  };
}

export const SAMPLE_PACK = `2026-11-02 14:00 [alert] p95 latency above 2s for five minutes | Alertmanager
2026-11-02 14:02 [deploy] checkout v2.14.3 to production | GitHub Actions #4821
14:03 [error] 5xx rate climbs from 0.2% to 8.4% | Grafana
14:05 [error] p99 latency reaches 4.2s | Datadog
14:09 [chat] six customers report failed payments | Slack #support
14:12 [log] database connection pool saturated (100/100) | RDS metrics
14:18 [note] someone on the bridge blames the database failover | Incident call
14:24 [action] rolled back checkout to v2.14.2 | GitHub Actions #4824
14:27 [log] error rate returns to 0.3% | Grafana
14:31 [action] incident resolved | PagerDuty`;
