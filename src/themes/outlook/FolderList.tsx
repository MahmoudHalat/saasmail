import { useEffect, useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  FileEdit,
  Inbox as InboxIcon,
  ListOrdered,
  Send,
  Mail,
  SendHorizontal,
} from "lucide-react";
import { fetchStats, type Stats } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { OlFolderId } from "./lib";
import { FlagGlyph } from "./ui";

export interface FolderTarget {
  folder: OlFolderId;
  label?: string;
}

const FOLDER_ICONS: Record<OlFolderId, React.ReactNode> = {
  inbox: <InboxIcon size={18} />,
  drafts: <FileEdit size={18} />,
  sent: <Send size={18} />,
  archive: <Archive size={18} />,
  snoozed: <Clock size={18} />,
  flagged: <FlagGlyph size={18} />,
  sequenced: <ListOrdered size={18} />,
};

/** Unread count per inbox address (Outlook shows it beside each folder). */
export function useInboxCounts(
  recipients: string[] | undefined,
  version: unknown,
) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = (recipients ?? []).join("|");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    Promise.all(
      key.split("|").map((r) =>
        fetchStats(encodeURIComponent(r))
          .then((s) => [r, s.unreadCount] as const)
          .catch(() => [r, 0] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setCounts(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [key, version]);
  return counts;
}

function Row({
  icon,
  label,
  count,
  active,
  onClick,
  title,
  accentCount,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  title?: string;
  accentCount?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-current={active ? "page" : undefined}
      className={cn("ol-folder", active && "ol-folder-on")}
    >
      <span className="ol-folder-icon" aria-hidden>
        {icon}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left",
          count ? "font-semibold" : undefined,
        )}
      >
        {label}
      </span>
      {!!count && (
        <span
          className={cn(
            "ol-folder-count",
            accentCount && "text-accent font-semibold",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ol-folder-section">
      <button
        type="button"
        className="ol-folder-heading"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown size={14} aria-hidden />
        ) : (
          <ChevronRight size={14} aria-hidden />
        )}
        <span className="truncate">{title}</span>
      </button>
      {open && <div className="flex flex-col">{children}</div>}
    </div>
  );
}

/**
 * Outlook's folder pane: Favorites, the account's folders, then one folder
 * per inbox address (filters the list with `recipient`).
 */
export default function FolderList({
  stats,
  accountEmail,
  current,
  onSelect,
  onOutbox,
  showFavorites = true,
}: {
  stats: Stats | null;
  accountEmail: string;
  current: FolderTarget;
  onSelect: (t: FolderTarget) => void;
  onOutbox: () => void;
  showFavorites?: boolean;
}) {
  const inboxCounts = useInboxCounts(stats?.recipients, stats);
  const unread = stats?.unreadCount ?? 0;
  const is = (f: OlFolderId) => !current.label && current.folder === f;
  const identities = new Map(
    (stats?.senderIdentities ?? []).map((s) => [s.email, s.displayName]),
  );

  const folderRow = (f: OlFolderId, label: string, count?: number) => (
    <Row
      key={f}
      icon={FOLDER_ICONS[f]}
      label={label}
      count={count}
      accentCount={f === "inbox"}
      active={is(f)}
      onClick={() => onSelect({ folder: f })}
    />
  );

  return (
    <nav aria-label="Folders" className="flex flex-col gap-1 pb-4">
      {showFavorites && (
        <Section title="Favorites">
          {folderRow("inbox", "Inbox", unread)}
          {folderRow("sent", "Sent Items")}
          {folderRow("drafts", "Drafts")}
        </Section>
      )}
      <Section title={accountEmail || "Mailbox"}>
        {folderRow("inbox", "Inbox", unread)}
        {folderRow("drafts", "Drafts")}
        {folderRow("sent", "Sent Items")}
        {folderRow("archive", "Archive")}
        {folderRow("snoozed", "Snoozed")}
        {folderRow("flagged", "Flagged")}
        {folderRow("sequenced", "Sequenced")}
        <Row
          icon={<SendHorizontal size={18} />}
          label="Outbox"
          active={false}
          onClick={onOutbox}
        />
      </Section>
      {(stats?.recipients.length ?? 0) > 0 && (
        <Section title="Inboxes">
          {stats!.recipients.map((r) => (
            <Row
              key={r}
              icon={<Mail size={18} />}
              label={identities.get(r) || r}
              title={r}
              count={inboxCounts[r]}
              accentCount
              active={current.label === r}
              onClick={() => onSelect({ folder: "inbox", label: r })}
            />
          ))}
        </Section>
      )}
    </nav>
  );
}

/** URL for a folder (folder and inbox live in the query string). */
export function folderHref(t: FolderTarget): string {
  const p = new URLSearchParams();
  if (t.folder !== "inbox") p.set("folder", t.folder);
  if (t.label) p.set("label", t.label);
  const s = p.toString();
  return s ? `/?${s}` : "/";
}
