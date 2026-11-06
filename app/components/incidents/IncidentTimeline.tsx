import { cn } from "@/lib/utils";
import {
  IconAlertTriangle,
  IconBolt,
  IconCircleCheck,
  IconGitCommit,
  IconMessageCircle,
  IconNote,
  IconServer,
} from "@tabler/icons-react";
import { useCallback, useMemo, useRef, useState } from "react";

export interface TimelineEvent {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  source: string | null;
  confidence: number;
  isRootCause: boolean;
  eventStatus?: string;
  editedBy?: string;
}

const KIND_META: Record<
  string,
  { label: string; icon: typeof IconNote; dot: string; chip: string; iconColor: string }
> = {
  deploy: {
    label: "Deploy",
    icon: IconGitCommit,
    dot: "bg-violet-500",
    iconColor: "text-violet-500",
    chip: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  alert: {
    label: "Alert",
    icon: IconAlertTriangle,
    dot: "bg-amber-500",
    iconColor: "text-amber-500",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  error: {
    label: "Error",
    icon: IconBolt,
    dot: "bg-red-500",
    iconColor: "text-red-500",
    chip: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  },
  log: {
    label: "Log",
    icon: IconServer,
    dot: "bg-sky-500",
    iconColor: "text-sky-500",
    chip: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  chat: {
    label: "Chat",
    icon: IconMessageCircle,
    dot: "bg-emerald-500",
    iconColor: "text-emerald-500",
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  action: {
    label: "Action",
    icon: IconCircleCheck,
    dot: "bg-teal-500",
    iconColor: "text-teal-500",
    chip: "border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
  note: {
    label: "Note",
    icon: IconNote,
    dot: "bg-zinc-400",
    iconColor: "text-zinc-400",
    chip: "border-border bg-muted text-muted-foreground",
  },
};

const MINUTE = 60_000;
const PAD_MINUTES = 2;

function fmtTime(iso: string) {
  return `${iso.slice(11, 16)}`;
}

function shortTime(iso: string) {
  return iso.slice(11, 16);
}

export function IncidentTimeline({
  events,
  selectedId,
  onSelect,
  onMove,
  disabled = false,
}: {
  events: TimelineEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, at: string) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; at: string; moved: boolean } | null>(
    null,
  );

  const range = useMemo(() => {
    const times = events.map((event) => Date.parse(event.at)).filter((n) => !Number.isNaN(n));
    if (times.length === 0) return null;
    const min = Math.min(...times) - PAD_MINUTES * MINUTE;
    const max = Math.max(...times) + PAD_MINUTES * MINUTE;
    return { min, max: Math.max(max, min + 10 * MINUTE) };
  }, [events]);

  const percentFor = useCallback(
    (iso: string) => {
      if (!range) return 0;
      const ms = Date.parse(iso);
      return Math.min(100, Math.max(0, ((ms - range.min) / (range.max - range.min)) * 100));
    },
    [range],
  );

  const timeAtClientX = useCallback(
    (clientX: number) => {
      if (!range || !trackRef.current) return null;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const snapped = Math.round((range.min + ratio * (range.max - range.min)) / MINUTE) * MINUTE;
      return new Date(snapped).toISOString();
    },
    [range],
  );

  const ticks = useMemo(() => {
    if (!range) return [];
    const step = 5 * MINUTE;
    const first = Math.ceil(range.min / step) * step;
    const out: Array<{ at: string; percent: number }> = [];
    for (let t = first; t <= range.max; t += step) {
      out.push({
        at: new Date(t).toISOString(),
        percent: ((t - range.min) / (range.max - range.min)) * 100,
      });
    }
    return out;
  }, [range]);

  if (!range) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No events on the timeline yet.
      </div>
    );
  }

  function beginDrag(event: TimelineEvent, pointerEvent: React.PointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    pointerEvent.preventDefault();
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    setDrag({ id: event.id, at: event.at, moved: false });
    onSelect(event.id);
  }

  function updateDrag(pointerEvent: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const at = timeAtClientX(pointerEvent.clientX);
    if (!at) return;
    setDrag((current) => (current ? { ...current, at, moved: true } : current));
  }

  function endDrag(pointerEvent: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const at = timeAtClientX(pointerEvent.clientX) ?? drag.at;
    const moved = drag.moved || at !== drag.at;
    setDrag(null);
    if (moved) onMove(drag.id, at);
  }

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="overflow-x-auto pb-2">
        <div ref={trackRef} className="relative h-[270px] min-w-[640px] select-none">
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/15" />

          {ticks.map((tick) => (
            <div
              key={tick.at}
              className="absolute top-0 bottom-6 border-l border-border/60"
              style={{ left: `${tick.percent}%` }}
            >
              <span className="absolute -bottom-6 -translate-x-1/2 font-mono text-[10px] text-muted-foreground">
                {shortTime(tick.at)}
              </span>
            </div>
          ))}

          {drag ? (
            <div
              className="pointer-events-none absolute top-2 bottom-6 z-30 border-l-2 border-dashed border-primary/70"
              style={{ left: `${percentFor(drag.at)}%` }}
            >
              <span className="absolute -top-1 left-1 rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground">
                {fmtTime(drag.at)}
              </span>
            </div>
          ) : null}

          {events.map((event, index) => {
            const meta = KIND_META[event.kind] ?? KIND_META.note!;
            const Icon = meta.icon;
            const active = selectedId === event.id;
            const dragging = drag?.id === event.id;
            const at = dragging && drag ? drag.at : event.at;
            const above = index % 2 === 0;

            return (
              <button
                key={event.id}
                type="button"
                aria-label={`${event.title} at ${fmtTime(at)} UTC`}
                className="absolute z-20 -translate-x-1/2 focus:outline-none"
                style={{ left: `${percentFor(at)}%`, top: "50%" }}
                onClick={() => onSelect(event.id)}
                onPointerDown={(pointerEvent) => beginDrag(event, pointerEvent)}
                onPointerMove={updateDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(keyboardEvent) => {
                  if (keyboardEvent.key === "ArrowLeft" || keyboardEvent.key === "ArrowRight") {
                    keyboardEvent.preventDefault();
                    const delta = (keyboardEvent.key === "ArrowRight" ? 1 : -1) * MINUTE;
                    onMove(event.id, new Date(Date.parse(event.at) + delta).toISOString());
                  }
                }}
              >
                <span
                  className={cn(
                    "block size-3 -translate-y-1/2 rounded-full ring-4 ring-card transition-transform",
                    meta.dot,
                    active && "scale-150 ring-primary/25",
                    dragging && "cursor-ew-resize scale-150",
                    event.isRootCause && "ring-amber-600/30",
                    event.eventStatus === "red_herring" && "opacity-40",
                  )}
                />
                <span
                  className={cn(
                    "absolute left-1/2 w-[150px] -translate-x-1/2 rounded-md border bg-card px-2.5 py-1.5 text-left transition-colors",
                    active ? "border-primary/70" : "border-border",
                    above ? "bottom-3" : "top-3",
                    event.eventStatus === "red_herring" && "opacity-60",
                  )}
                >
                  <span className="flex items-center gap-1">
                    <Icon className={cn("size-3 shrink-0", meta.iconColor)} strokeWidth={2} />
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {fmtTime(at)}
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                      {event.isRootCause ? (
                        <span className="rounded-sm bg-primary/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
                          Cause
                        </span>
                      ) : null}
                      {event.eventStatus === "red_herring" ? (
                        <span className="rounded-sm bg-muted px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Red herring
                        </span>
                      ) : null}
                      {event.editedBy ? (
                        <span className="text-[8px] uppercase tracking-wide text-muted-foreground/70">
                          {event.editedBy === "agent" ? "agent" : "you"}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-xs font-medium leading-tight",
                      event.eventStatus === "red_herring" && "line-through",
                    )}
                  >
                    {event.title}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
