/**
 * Pure helpers for the Gmail layout: date formatting the way Gmail writes
 * it, URL <-> folder state, avatar/label colours and the keyboard shortcut
 * map. Kept free of React so they are easy to unit test.
 */
import type { MailFolder } from "@/lib/api";

/* ── Dates ─────────────────────────────────────────────────────────── */

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * List date, Gmail style: the time for today ("2:34 PM"), month and day
 * for this year ("Oct 3"), a short numeric date for older mail ("3/10/24").
 * `ts` is unix seconds.
 */
export function formatListDate(
  ts: number,
  now: Date = new Date(),
  locale?: string,
): string {
  const d = new Date(ts * 1000);
  if (sameDay(d, now)) {
    return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(locale, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

/** "Mon, Oct 3, 2:34 PM" — the full stamp in a message header. */
export function formatFullDate(ts: number, locale?: string): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "(2 hours ago)" style relative time; null past ~a week (Gmail drops it). */
export function relativeTime(
  ts: number,
  now: Date = new Date(),
): string | null {
  const diff = Math.max(0, Math.floor(now.getTime() / 1000) - ts);
  if (diff < 60) return "now";
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return null;
}

/* ── Folder state in the URL ───────────────────────────────────────── */

export type GmailFolder =
  | "inbox"
  | "starred"
  | "snoozed"
  | "sent"
  | "drafts"
  | "sequenced"
  | "archive"
  | "all";

export const GMAIL_FOLDERS: GmailFolder[] = [
  "inbox",
  "starred",
  "snoozed",
  "sent",
  "drafts",
  "sequenced",
  "archive",
  "all",
];

export interface ListState {
  folder: GmailFolder;
  /** Inbox address used as a label filter. */
  label: string | null;
  q: string;
  unread: boolean;
  attachment: boolean;
  /** Sender filter from advanced search. */
  from: string;
}

export function parseListState(params: URLSearchParams): ListState {
  const raw = params.get("folder");
  const label = params.get("label") || null;
  const q = params.get("q") ?? "";
  const from = params.get("from") ?? "";
  let folder: GmailFolder = GMAIL_FOLDERS.includes(raw as GmailFolder)
    ? (raw as GmailFolder)
    : "inbox";
  // A label or a search with no explicit folder looks across all mail, like
  // Gmail's label views and search results.
  if (!raw && (label || q || from)) folder = "all";
  return {
    folder,
    label,
    q,
    unread: params.get("unread") === "1",
    attachment: params.get("has") === "attachment",
    from,
  };
}

/** Query string (with leading "?", or "" for the plain inbox). */
export function buildListSearch(s: Partial<ListState>): string {
  const p = new URLSearchParams();
  const folder = s.folder ?? "inbox";
  const implicitAll =
    folder === "all" && (s.label || s.q || s.from) ? true : false;
  if (folder !== "inbox" && !implicitAll) p.set("folder", folder);
  if (s.label) p.set("label", s.label);
  if (s.q) p.set("q", s.q);
  if (s.from) p.set("from", s.from);
  if (s.unread) p.set("unread", "1");
  if (s.attachment) p.set("has", "attachment");
  const str = p.toString();
  return str ? `?${str}` : "";
}

/** Map a Gmail folder to the useMailList query. */
export function folderQuery(s: ListState): {
  folder: MailFolder;
  drafts?: boolean;
  sequenced?: boolean;
} {
  switch (s.folder) {
    case "drafts":
      return { folder: "all", drafts: true };
    case "sequenced":
      return { folder: "all", sequenced: true };
    default:
      return { folder: s.folder };
  }
}

export const FOLDER_LABELS: Record<GmailFolder, string> = {
  inbox: "Inbox",
  starred: "Starred",
  snoozed: "Snoozed",
  sent: "Sent",
  drafts: "Drafts",
  sequenced: "Sequenced",
  archive: "Archive",
  all: "All mail",
};

/** "open" param: "p:<personId>" or "g:<conversationId>". */
export function parseOpen(
  v: string | null,
): { type: "person" | "group"; id: string } | null {
  if (!v) return null;
  const m = /^([pg]):(.+)$/.exec(v);
  if (!m) return null;
  return { type: m[1] === "p" ? "person" : "group", id: m[2] };
}

export function openParam(item: { type: "person" | "group"; id: string }) {
  return `${item.type === "person" ? "p" : "g"}:${item.id}`;
}

/* ── Colours ───────────────────────────────────────────────────────── */

/** Stable 0..n-1 bucket for a string (avatar and label colours). */
export function colorIndex(key: string, n = 8): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % n;
}

/** First letter for an avatar: the name's, else the address's. */
export function initialOf(name: string | null | undefined, email?: string) {
  const src = (name || email || "?").trim();
  const ch = src.replace(/^["'(<]+/, "").charAt(0);
  return (ch || "?").toUpperCase();
}

/** Strip "Re:", "Fwd:" chains for the conversation heading. */
export function cleanSubject(s: string | null | undefined): string {
  const t = (s ?? "").replace(/^\s*((re|fw|fwd|aw)\s*:\s*)+/i, "").trim();
  return t || "(no subject)";
}

/** Gmail-ish short label name for an inbox address: "support@x.com" → "support". */
export function labelName(address: string, displayName?: string | null) {
  if (displayName && displayName.trim()) return displayName.trim();
  const at = address.indexOf("@");
  return at > 0 ? address.slice(0, at) : address;
}

/* ── Keyboard shortcuts ────────────────────────────────────────────── */

export type ShortcutCommand =
  | "next"
  | "prev"
  | "open"
  | "back"
  | "archive"
  | "star"
  | "delete"
  | "reply"
  | "replyAll"
  | "forward"
  | "compose"
  | "search"
  | "select"
  | "markRead"
  | "markUnread"
  | "snooze"
  | "help";

export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

/** Gmail's single-key shortcuts. Returns null for anything else. */
export function shortcutFor(e: KeyLike): ShortcutCommand | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.shiftKey) {
    switch (e.key) {
      case "I":
        return "markRead";
      case "U":
        return "markUnread";
      case "#":
        return "delete";
      case "?":
        return "help";
      case "Enter":
        return null;
    }
  }
  switch (e.key) {
    case "j":
      return "next";
    case "k":
      return "prev";
    case "o":
    case "Enter":
      return "open";
    case "u":
      return "back";
    case "e":
      return "archive";
    case "s":
      return "star";
    case "#":
      return "delete";
    case "r":
      return "reply";
    case "a":
      return "replyAll";
    case "f":
      return "forward";
    case "c":
      return "compose";
    case "/":
      return "search";
    case "x":
      return "select";
    case "b":
      return "snooze";
    case "?":
      return "help";
  }
  return null;
}

/** True when a key event comes from somewhere the user is typing. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export const SHORTCUT_HELP: Array<{ keys: string; label: string }> = [
  { keys: "c", label: "Compose" },
  { keys: "/", label: "Search mail" },
  { keys: "j / k", label: "Newer / older conversation" },
  { keys: "o or Enter", label: "Open conversation" },
  { keys: "u", label: "Back to list" },
  { keys: "x", label: "Select conversation" },
  { keys: "s", label: "Star / unstar" },
  { keys: "e", label: "Archive" },
  { keys: "#", label: "Delete" },
  { keys: "b", label: "Snooze" },
  { keys: "Shift + I", label: "Mark as read" },
  { keys: "Shift + U", label: "Mark as unread" },
  { keys: "r", label: "Reply" },
  { keys: "a", label: "Reply all" },
  { keys: "f", label: "Forward" },
  { keys: "?", label: "Show keyboard shortcuts" },
];

/** "1–50 of 230" */
export function rangeLabel(page: number, pageSize: number, total: number) {
  if (total === 0) return "0 of 0";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`;
}
