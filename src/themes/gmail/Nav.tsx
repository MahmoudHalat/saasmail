import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Archive,
  Clock,
  FileText,
  Inbox,
  ListOrdered,
  ListTodo,
  Send,
  SendHorizontal,
  Star,
  StickyNote,
} from "lucide-react";
import type { Stats } from "@/lib/api";
import {
  buildListSearch,
  FOLDER_LABELS,
  labelName,
  parseListState,
  type GmailFolder,
} from "./lib";
import { LabelDot } from "./ui";

export function isInboxPath(pathname: string) {
  return pathname === "/" || pathname.startsWith("/inbox/");
}

const FOLDER_ICONS: Record<
  Exclude<GmailFolder, "all">,
  (p: { size: number }) => ReactNode
> = {
  inbox: (p) => <Inbox {...p} />,
  starred: (p) => <Star {...p} />,
  snoozed: (p) => <Clock {...p} />,
  sent: (p) => <SendHorizontal {...p} />,
  drafts: (p) => <StickyNote {...p} />,
  sequenced: (p) => <ListTodo {...p} />,
  archive: (p) => <Archive {...p} />,
};

const FOLDER_ORDER: Array<Exclude<GmailFolder, "all">> = [
  "inbox",
  "starred",
  "snoozed",
  "sent",
  "drafts",
  "sequenced",
  "archive",
];

export interface LabelEntry {
  address: string;
  displayName: string | null;
}

export function labelsFrom(stats: Stats | null): LabelEntry[] {
  if (!stats) return [];
  const seen = new Set<string>();
  const out: LabelEntry[] = [];
  for (const s of stats.senderIdentities ?? []) {
    const k = s.email.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ address: s.email, displayName: s.displayName });
  }
  for (const r of stats.recipients ?? []) {
    const k = r.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ address: r, displayName: null });
  }
  return out.sort((a, b) => a.address.localeCompare(b.address));
}

function NavRow({
  icon,
  label,
  active,
  count,
  bold,
  onClick,
  testId,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  count?: number;
  bold?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="gm-nav-item w-[calc(100%-16px)] text-left"
      data-active={active ? "true" : undefined}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      title={label}
      data-testid={testId}
    >
      {icon}
      <span
        className="gm-nav-text min-w-0 flex-1 truncate"
        style={bold && !active ? { fontWeight: 700 } : undefined}
      >
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span
          className="gm-nav-count text-xs"
          style={{ fontWeight: bold || active ? 700 : 400 }}
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

/**
 * Gmail's folder + label list. Used by the desktop sidebar (full or rail)
 * and the mobile drawer. Folder state lives in the URL.
 */
export function GmailNavList({
  stats,
  onNavigate,
  extra,
}: {
  stats: Stats | null;
  /** Called after any navigation (closes the mobile drawer). */
  onNavigate?: () => void;
  extra?: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const onInbox = isInboxPath(location.pathname);
  const state = parseListState(new URLSearchParams(location.search));
  const labels = labelsFrom(stats);

  const go = (to: string) => {
    navigate(to);
    onNavigate?.();
  };

  const unread = stats?.unreadCount ?? 0;

  return (
    <nav aria-label="Mail folders" className="flex flex-col pb-4">
      {FOLDER_ORDER.map((f) => {
        const Icon = FOLDER_ICONS[f];
        const active =
          onInbox && !state.label && !state.q && state.folder === f;
        return (
          <NavRow
            key={f}
            icon={<Icon size={20} />}
            label={FOLDER_LABELS[f]}
            active={active}
            count={f === "inbox" ? unread : undefined}
            bold={f === "inbox" && unread > 0}
            onClick={() => go(`/${buildListSearch({ folder: f })}`)}
            testId={`gmail-nav-${f}`}
          />
        );
      })}
      <NavRow
        icon={<Send size={20} />}
        label="Outbox"
        active={location.pathname === "/outbox"}
        onClick={() => go("/outbox")}
      />

      {labels.length > 0 && (
        <>
          <div className="gm-nav-heading mt-4 flex h-10 items-center pl-[26px] text-base font-medium text-text-primary">
            Labels
          </div>
          {labels.map((l) => (
            <NavRow
              key={l.address}
              icon={<LabelDot address={l.address} />}
              label={labelName(l.address, l.displayName)}
              active={onInbox && state.label === l.address}
              onClick={() =>
                go(`/${buildListSearch({ folder: "all", label: l.address })}`)
              }
              testId={`gmail-label-${l.address}`}
            />
          ))}
        </>
      )}

      <div className="gm-nav-heading mt-4 h-px" />
      <NavRow
        icon={<FileText size={20} />}
        label="Templates"
        active={location.pathname.startsWith("/templates")}
        onClick={() => go("/templates")}
      />
      <NavRow
        icon={<ListOrdered size={20} />}
        label="Sequences"
        active={location.pathname.startsWith("/sequences")}
        onClick={() => go("/sequences")}
      />
      {extra}
    </nav>
  );
}

export { NavRow };
