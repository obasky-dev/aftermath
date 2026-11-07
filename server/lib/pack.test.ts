import { describe, expect, it } from "vitest";

import { parseIncidentPack, SAMPLE_PACK } from "./pack.js";

describe("parseIncidentPack", () => {
  it("parses the sample pack in order with sources", () => {
    const parsed = parseIncidentPack(SAMPLE_PACK, "2026-11-02");
    expect(parsed.events).toHaveLength(10);
    expect(parsed.skipped).toBe(0);
    expect(parsed.events[0]!).toMatchObject({
      at: "2026-11-02T14:00:00.000Z",
      kind: "alert",
      source: "Alertmanager",
    });
    expect(parsed.events[3]!.title).toBe("p99 latency reaches 4.2s");
    expect(parsed.events[parsed.events.length - 1]?.kind).toBe("action");
    expect(parsed.title).toBe("p95 latency above 2s for five minutes");
  });

  it("uses the first explicit date when no fallback is given", () => {
    const parsed = parseIncidentPack(SAMPLE_PACK);
    expect(parsed.events[2]!.at).toBe("2026-11-02T14:03:00.000Z");
    expect(parsed.events[9]!.at).toBe("2026-11-02T14:31:00.000Z");
  });

  it("infers the kind when no bracket is present", () => {
    const parsed = parseIncidentPack(
      "14:02 deployed checkout v2.14.3\n14:04 connection pool saturated\n14:06 customers report errors",
      "2026-11-02",
    );
    expect(parsed.events.map((event) => event.kind)).toEqual(["deploy", "log", "error"]);
  });

  it("turns WebVTT cues into timed chat events", () => {
    const parsed = parseIncidentPack(
      `WEBVTT

00:14:02.000 --> 00:14:06.000
Dave: the deploy is promoting now

00:14:09.000 --> 00:14:13.000
Sam: checkout errors are climbing`,
      "2026-11-04",
    );
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0]).toMatchObject({
      at: "2026-11-04T00:14:00.000Z",
      kind: "chat",
      source: "Transcript",
    });
    expect(parsed.events[1]?.title).toContain("checkout errors");
  });

  it("turns SRT cues with comma milliseconds into events", () => {
    const parsed = parseIncidentPack(
      `1
00:09:15,000 --> 00:09:19,000
On-call: rolling back the deploy

2
00:09:24,000 --> 00:09:28,000
Error rate is falling`,
      "2026-11-04",
    );
    expect(parsed.events.map((event) => event.at)).toEqual([
      "2026-11-04T00:09:00.000Z",
      "2026-11-04T00:09:00.000Z",
    ]);
  });

  it("skips lines without a time and honours explicit dates", () => {
    const parsed = parseIncidentPack(
      "no time here\n2026-11-03 09:15 [alert] disk full | node-exporter",
      "2026-11-02",
    );
    expect(parsed.events).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
    expect(parsed.events[0]!.at).toBe("2026-11-03T09:15:00.000Z");
  });
});
