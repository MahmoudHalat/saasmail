import {
  Archive,
  ArchiveRestore,
  CheckCheck,
  Clock,
  Loader2,
  ShieldBan,
  Star,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SnoozeItems } from "@/components/MailActions";
import { cn } from "@/lib/utils";

interface SelectionBarProps {
  count: number;
  busy?: boolean;
  onMarkRead: () => void;
  onBlock?: () => void;
  onClear: () => void;
  /** Bulk star (stars all selected). */
  onStar?: () => void;
  /** Bulk archive (or move back to the inbox in the Archive folder). */
  onArchive?: () => void;
  /** Label for the archive button; "Move to inbox" in the Archive folder. */
  archiveLabel?: string;
  /** Bulk snooze until a unix-seconds time. */
  onSnooze?: (until: number | null) => void;
  className?: string;
}

const btn =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-bg-muted [&_svg]:size-3.5";

/**
 * Bulk-action bar shown while rows are selected: mark read, archive,
 * snooze, star, block, clear.
 */
export default function SelectionBar({
  count,
  busy,
  onMarkRead,
  onBlock,
  onClear,
  onStar,
  onArchive,
  archiveLabel = "Archive",
  onSnooze,
  className,
}: SelectionBarProps) {
  if (count === 0) return null;
  return (
    <div
      data-testid="selection-bar"
      className={cn(
        "flex items-center gap-1 overflow-x-auto rounded-xl border border-border-strong bg-popover py-1 pl-3 pr-1 text-sm text-text-primary shadow-overlay [scrollbar-width:none]",
        className,
      )}
    >
      <span className="tabular mr-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-2 text-xs font-semibold text-accent-foreground">
        {count}
      </span>
      <span className="mr-1 shrink-0 text-[13px] font-medium">selected</span>

      <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />

      <button
        type="button"
        onClick={onMarkRead}
        disabled={busy}
        className={btn}
      >
        {busy ? <Loader2 className="animate-spin" /> : <CheckCheck />}
        <span className="hidden sm:inline">Mark as read</span>
        <span className="sm:hidden">Read</span>
      </button>

      {onArchive && (
        <button
          type="button"
          onClick={onArchive}
          disabled={busy}
          className={btn}
        >
          {archiveLabel === "Archive" ? <Archive /> : <ArchiveRestore />}
          <span className="hidden sm:inline">{archiveLabel}</span>
        </button>
      )}

      {onSnooze && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={busy} className={btn}>
              <Clock />
              <span className="hidden sm:inline">Snooze</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <SnoozeItems onSnooze={onSnooze} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onStar && (
        <button type="button" onClick={onStar} disabled={busy} className={btn}>
          <Star />
          <span className="hidden sm:inline">Star</span>
        </button>
      )}

      {onBlock && (
        <button type="button" onClick={onBlock} disabled={busy} className={btn}>
          <ShieldBan />
          <span className="hidden sm:inline">Block</span>
        </button>
      )}

      <button
        type="button"
        onClick={onClear}
        className={cn(btn, "ml-auto")}
        aria-label="Clear selection"
      >
        <X />
        <span className="hidden sm:inline">Clear</span>
      </button>
    </div>
  );
}
