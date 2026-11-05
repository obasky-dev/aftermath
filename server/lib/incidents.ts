import { fail } from "@agent-native/core/action";

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Accepts an ISO 8601 date-time and returns normalized UTC ISO text. */
export function toIso(value: string, field = "time"): string {
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    fail(`${field} must include a time and UTC offset.`, {
      errorCode: "invalid_time",
    });
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    fail(`${field} must be a valid ISO 8601 date-time.`, {
      errorCode: "invalid_time",
    });
  }
  return new Date(ms).toISOString();
}

/** "14:02" for an ISO timestamp, always UTC so server and client agree. */
export function utcTime(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}
