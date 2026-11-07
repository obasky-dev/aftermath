import { useEffect } from "react";

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: "⌘ K / Ctrl K", action: "Open the command palette" },
  { keys: "?", action: "Open this shortcut sheet" },
  { keys: "Esc", action: "Close the sheet or palette" },
  { keys: "← →", action: "Move the focused timeline event 1 minute" },
  { keys: "Shift ← →", action: "Move the focused timeline event 5 minutes" },
  { keys: "⌘ Z / Ctrl Z", action: "Undo the last timeline correction" },
  { keys: "⇧ ⌘ Z / Ctrl ⇧ Z", action: "Redo the correction" },
  { keys: "Drag event", action: "Correct its time on the timeline" },
  { keys: "⌘ + scroll", action: "Zoom the timeline around the pointer" },
  { keys: "Shift + scroll", action: "Pan the timeline" },
];

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/20 p-6 backdrop-blur-[2px]"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-lg overflow-hidden rounded-md border border-border bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2
            id="shortcuts-title"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          >
            Esc
          </button>
        </div>
        <ul className="divide-y divide-border">
          {SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.keys}
              className="flex items-center justify-between gap-4 px-5 py-2.5"
            >
              <span className="text-sm text-muted-foreground">{shortcut.action}</span>
              <kbd className="shrink-0 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {shortcut.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function useShortcutSheetShortcut(open: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "?") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      open();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
}
