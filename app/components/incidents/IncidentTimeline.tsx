import { cn } from "@/lib/utils";
import {
  IconAlertTriangle,
  IconBolt,
  IconCircleCheck,
  IconExternalLink,
  IconGitCommit,
  IconMessageCircle,
  IconMinus,
  IconNote,
  IconPaperclip,
  IconPlus,
  IconServer,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface TimelineEvidence {
  id: string;
  label: string;
  url: string | null;
  snippet: string | null;
}

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
  originalAt?: string | null;
  evidence?: TimelineEvidence[];
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
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60];

function fmtTime(iso: string) {
  return `${iso.slice(11, 16)}`;
}

function fmtMs(ms: number) {
  return new Date(ms).toISOString().slice(11, 16);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  const [pan, setPan] = useState<{ startX: number; startFocus: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [focus, setFocus] = useState<number | null>(null);
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  const range = useMemo(() => {
    const times = events.map((event) => Date.parse(event.at)).filter((n) => !Number.isNaN(n));
    if (times.length === 0) return null;
    const min = Math.min(...times) - PAD_MINUTES * MINUTE;
    const max = Math.max(...times) + PAD_MINUTES * MINUTE;
    return { min, max: Math.max(max, min + 10 * MINUTE) };
  }, [events]);

  const view = useMemo(() => {
    if (!range) return null;
    const full = range.max - range.min;
    const span = Math.max(full / Math.max(1, zoom), 4 * MINUTE);
    const center = focus ?? (range.min + range.max) / 2;
    const start = clamp(center - span / 2, range.min, range.max - span);
    return { start, end: start + span };
  }, [range, zoom, focus]);

  const percentFor = useCallback(
    (iso: string) => {
      if (!view) return 0;
      const ms = Date.parse(iso);
      return clamp(((ms - view.start) / (view.end - view.start)) * 100, 0, 100);
    },
    [view],
  );

  const timeAtClientX = useCallback(
    (clientX: number) => {
      if (!view || !trackRef.current) return null;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const snapped = Math.round((view.start + ratio * (view.end - view.start)) / MINUTE) * MINUTE;
      return new Date(snapped).toISOString();
    },
    [view],
  );

  const ticks = useMemo(() => {
    if (!view) return [];
    const spanMinutes = (view.end - view.start) / MINUTE;
    const step =
      TICK_STEPS.find((candidate) => spanMinutes / candidate <= 9) ?? TICK_STEPS[0]!;
    const stepMs = step * MINUTE;
    const first = Math.ceil(view.start / stepMs) * stepMs;
    const out: Array<{ at: string; percent: number }> = [];
    for (let t = first; t <= view.end; t += stepMs) {
      out.push({
        at: new Date(t).toISOString(),
        percent: ((t - view.start) / (view.end - view.start)) * 100,
      });
    }
    return out;
  }, [view]);

  const setZoomAround = useCallback(
    (nextZoom: number, anchorMs?: number) => {
      if (!range) return;
      const clamped = clamp(nextZoom, 1, 8);
      if (clamped === 1) {
        setFocus(null);
      } else if (anchorMs && view) {
        const span = (range.max - range.min) / clamped;
        setFocus(clamp(anchorMs, range.min + span / 2, range.max - span / 2));
      }
      setZoom(clamped);
    },
    [range, view],
  );

  const wheelRef = useRef({ view, range, zoom, setZoomAround, timeAtClientX, setFocus });
  wheelRef.current = { view, range, zoom, setZoomAround, timeAtClientX, setFocus };

  useEffect(() => {
    const element = trackRef.current;
    if (!element) return;
    function onWheel(wheelEvent: WheelEvent) {
      const state = wheelRef.current;
      if (!state.view || !state.range) return;
      if (wheelEvent.ctrlKey || wheelEvent.metaKey) {
        wheelEvent.preventDefault();
        const anchor = state.timeAtClientX(wheelEvent.clientX);
        state.setZoomAround(
          state.zoom * (wheelEvent.deltaY < 0 ? 1.15 : 0.87),
          anchor ? Date.parse(anchor) : undefined,
        );
        return;
      }
      if (Math.abs(wheelEvent.deltaX) > 0 || wheelEvent.shiftKey) {
        const span = state.view.end - state.view.start;
        const delta = (wheelEvent.deltaY || wheelEvent.deltaX) / 600;
        state.setFocus(
          clamp(
            (state.view.start + state.view.end) / 2 + delta * span,
            state.range.min,
            state.range.max,
          ),
        );
      }
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  if (!range || !view) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No events on the timeline yet.
      </div>
    );
  }

  function beginDrag(event: TimelineEvent, pointerEvent: React.PointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    setDrag({ id: event.id, at: event.at, moved: false });
    onSelect(event.id);
    setOpenEvidence(null);
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

  function beginPan(pointerEvent: React.PointerEvent<HTMLDivElement>) {
    if (pointerEvent.button !== 0) return;
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    setPan({ startX: pointerEvent.clientX, startFocus: (view!.start + view!.end) / 2 });
    setOpenEvidence(null);
  }

  function updatePan(pointerEvent: React.PointerEvent<HTMLDivElement>) {
    if (!pan || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const span = view!.end - view!.start;
    const deltaMinutes = ((pointerEvent.clientX - pan.startX) / rect.width) * span;
    setFocus(clamp(pan.startFocus - deltaMinutes, range!.min, range!.max));
  }

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoomAround(zoom / 1.6)}
            disabled={zoom <= 1}
            className="grid size-7 place-items-center rounded-sm border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <IconMinus className="size-3.5" strokeWidth={2} />
          </button>
          <span className="w-12 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
            {zoom <= 1 ? "fit" : `${Math.round(zoom * 100)}%`}
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoomAround(zoom * 1.6, (view.start + view.end) / 2)}
            disabled={zoom >= 8}
            className="grid size-7 place-items-center rounded-sm border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <IconPlus className="size-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => setZoomAround(1)}
            className="ml-1 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Fit
          </button>
        </div>
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/80">
          {fmtMs(view.start)} → {fmtMs(view.end)} UTC · scroll to pan · ⌘/Ctrl + scroll to
          zoom
        </p>
      </div>

      <div className="overflow-hidden px-4 pb-2 pt-3">
        <div
          ref={trackRef}
          className={cn(
            "relative h-[300px] select-none",
            pan ? "cursor-grabbing" : "cursor-grab",
          )}
          onPointerDown={beginPan}
          onPointerMove={updatePan}
          onPointerUp={() => setPan(null)}
          onPointerCancel={() => setPan(null)}
        >
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/15" />

          {ticks.map((tick) => (
            <div
              key={tick.at}
              className="pointer-events-none absolute top-0 bottom-6 border-l border-border/60"
              style={{ left: `${tick.percent}%` }}
            >
              <span className="absolute -bottom-6 -translate-x-1/2 font-mono text-[10px] text-muted-foreground">
                {fmtTime(tick.at)}
              </span>
            </div>
          ))}

          {drag ? (
            <>
              {(() => {
                const dragged = events.find((event) => event.id === drag.id);
                const ghostAt = dragged?.originalAt ?? dragged?.at;
                if (!ghostAt || fmtTime(ghostAt) === fmtTime(drag.at)) return null;
                return (
                  <div
                    className="pointer-events-none absolute top-2 bottom-6 z-10 border-l border-dashed border-muted-foreground/40"
                    style={{ left: `${percentFor(ghostAt)}%` }}
                  >
                    <span className="absolute -top-1 left-1 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      was {fmtTime(ghostAt)}
                    </span>
                  </div>
                );
              })()}
              <div
                className="pointer-events-none absolute top-2 bottom-6 z-30 border-l-2 border-dashed border-primary/70"
                style={{ left: `${percentFor(drag.at)}%` }}
              >
                <span className="absolute -top-1 left-1 rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground">
                  {fmtTime(drag.at)}
                </span>
              </div>
            </>
          ) : null}

          {events.map((event, index) => {
            const meta = KIND_META[event.kind] ?? KIND_META.note!;
            const Icon = meta.icon;
            const active = selectedId === event.id;
            const dragging = drag?.id === event.id;
            const at = dragging && drag ? drag.at : event.at;
            const above = index % 2 === 0;
            const evidence = event.evidence ?? [];
            const popoverOpen = openEvidence === event.id;
            const lowConfidence = event.confidence < 50;

            return (
              <div
                key={event.id}
                className="absolute z-20 -translate-x-1/2"
                style={{ left: `${percentFor(at)}%`, top: "50%" }}
              >
                <button
                  type="button"
                  aria-label={`${event.title} at ${fmtTime(at)} UTC, ${event.confidence}% confidence${
                    lowConfidence ? ", unverified" : ""
                  }`}
                  className="group relative block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSelect(event.id)}
                  onPointerDown={(pointerEvent) => beginDrag(event, pointerEvent)}
                  onPointerMove={updateDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(keyboardEvent) => {
                    if (
                      keyboardEvent.key === "ArrowLeft" ||
                      keyboardEvent.key === "ArrowRight"
                    ) {
                      keyboardEvent.preventDefault();
                      const minutes = keyboardEvent.shiftKey ? 5 : 1;
                      const delta =
                        (keyboardEvent.key === "ArrowRight" ? 1 : -1) * minutes * MINUTE;
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
                      "absolute left-1/2 w-[164px] -translate-x-1/2 rounded-md border bg-card px-2.5 py-1.5 text-left transition-colors",
                      active ? "border-primary/70" : "border-border",
                      lowConfidence && "border-dashed",
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
                    <span className="mt-1 flex items-center gap-1 font-mono text-[9px] tabular-nums text-muted-foreground/80">
                      <span>{event.confidence}% conf</span>
                      {lowConfidence ? <span>· unverified</span> : null}
                    </span>
                  </span>
                </button>

                {evidence.length > 0 ? (
                  <button
                    type="button"
                    aria-label={`${evidence.length} evidence item${
                      evidence.length === 1 ? "" : "s"
                    } for ${event.title}`}
                    aria-expanded={popoverOpen}
                    onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      setOpenEvidence(popoverOpen ? null : event.id);
                    }}
                    className={cn(
                      "absolute z-40 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground",
                      above ? "bottom-[calc(100%+6px)] left-[calc(50%+64px)]" : "top-[calc(100%+6px)] left-[calc(50%+64px)]",
                      popoverOpen && "border-primary/70 text-foreground",
                    )}
                  >
                    <IconPaperclip className="size-3" strokeWidth={2} />
                  </button>
                ) : null}

                {popoverOpen && evidence.length > 0 ? (
                  <div
                    role="dialog"
                    aria-label={`Evidence for ${event.title}`}
                    onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                    className="absolute left-1/2 top-[calc(50%+26px)] z-50 w-[280px] -translate-x-1/2 rounded-md border border-border bg-popover p-3 shadow-lg"
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                      Evidence · {evidence.length}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {evidence.map((item) => (
                        <li key={item.id}>
                          <div className="flex items-start gap-1.5">
                            <span className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                              ·
                            </span>
                            <div className="min-w-0">
                              {item.url ? (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium underline decoration-border underline-offset-2 hover:decoration-foreground"
                                >
                                  {item.label}
                                  <IconExternalLink className="size-3" strokeWidth={2} />
                                </a>
                              ) : (
                                <p className="text-xs font-medium">{item.label}</p>
                              )}
                              {item.snippet ? (
                                <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
                                  {item.snippet}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setOpenEvidence(null)}
                      className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
                    >
                      Close
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/80">
          Solid label = verified · dashed = low confidence ({events.filter((e) => e.confidence < 50).length})
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/80">
          ← → 1 min · Shift + ← → 5 min
        </p>
      </div>
    </div>
  );
}
