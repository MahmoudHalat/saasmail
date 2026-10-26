/**
 * Pure helpers for the Outlook layout: folder mapping, date grouping, the
 * Focused / Other split, list time formatting, avatar colours and the
 * Outlook-on-the-web keyboard map. No React here so it stays unit-testable.
 */
import type { Email, GroupedItem, MailFolder } from "@/lib/api";

// ── Folders ──────────────────────────────────────────────────────────────

export type OlFolderId =
  | "inbox"
  | "drafts"
  | "sent"
  | "archive"
  | "snoozed"
  | "flagged"
  | "sequenced";

export const FOLDER_IDS: OlFolderId[] = [
  "inbox",
  "drafts",
  "sent",
  "archive",
  "snoozed",
  "flagged",
  "sequenced",
];

export const FOLDER_LABELS: Record<OlFolderId, string> = {
  inbox: "Inbox",
  drafts: "Drafts",
  sent: "Sent Items",
  archive: "Archive",
  snoozed: "Snoozed",
  flagged: "Flagged",
  sequenced: "Sequenced",
};

export function parseFolder(raw: string | null | undefined): OlFolderId {
  return raw && (FOLDER_IDS as string[]).includes(raw)
    ? (raw as OlFolderId)
    : "inbox";
}

/** Server query for one Outlook folder. */
export function folderQuery(id: OlFolderId): {
  folder: MailFolder;
  drafts?: boolean;
  sequenced?: boolean;
} {
  switch (id) {
    case "inbox":
      return { folder: "inbox" };
    case "drafts":
      return { folder: "all", drafts: true };
    case "sent":
      return { folder: "sent" };
    case "archive":
      return { folder: "archive" };
    case "snoozed":
      return { folder: "snoozed" };
    case "flagged":
      return { folder: "starred" };
    case "sequenced":
      return { folder: "all", sequenced: true };
  }
}

// ── List filters and sort ────────────────────────────────────────────────

export type ListFilter = "all" | "unread" | "flagged" | "files" | "pinned";
export type ListSort = "date" | "from" | "unread";

export const FILTER_LABELS: Record<ListFilter, string> = {
  all: "All",
  unread: "Unread",
  flagged: "Flagged",
  files: "Has files",
  pinned: "Pinned",
};

/** Client-side filters (unread is also sent to the server). */
export function applyFilter<T extends GroupedItem>(
  items: T[],
  filter: ListFilter,
): T[] {
  switch (filter) {
    case "all":
      return items;
    case "unread":
      return items.filter((i) => i.unreadCount > 0);
    case "flagged":
      return items.filter((i) => i.starred);
    case "files":
      return items.filter((i) => i.hasAttachment > 0);
    case "pinned":
      return items.filter((i) => i.pinned);
  }
}

// ── Date grouping ────────────────────────────────────────────────────────

export type DateBucket =
  | "Today"
  | "Yesterday"
  | "This week"
  | "Last week"
  | "Earlier this month"
  | "Last month"
  | "Older";

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Bucket a unix-seconds timestamp the way Outlook's message list does. */
export function dateBucket(tsSec: number, now: Date = new Date()): DateBucket {
  const t = tsSec * 1000;
  const today = startOfDay(now);
  if (t >= today) return "Today";
  if (t >= today - DAY) return "Yesterday";
  // Weeks start on Sunday (Outlook's en-US default).
  const weekStart = today - now.getDay() * DAY;
  if (t >= weekStart) return "This week";
  if (t >= weekStart - 7 * DAY) return "Last week";
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (t >= monthStart) return "Earlier this month";
  const lastMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
  ).getTime();
  if (t >= lastMonthStart) return "Last month";
  return "Older";
}

export interface RowGroup<T> {
  label: string;
  items: T[];
}

/**
 * Group rows under headers. Date sort: "Pinned" first (when pinned rows lead
 * the list), then date buckets in order. From sort: by first letter.
 * Unread sort: "Unread" then "Read".
 */
export function groupRows<T extends GroupedItem>(
  items: T[],
  sort: ListSort,
  title: (item: T) => string,
  now: Date = new Date(),
  pinnedFirst = true,
): RowGroup<T>[] {
  const out: RowGroup<T>[] = [];
  const push = (label: string, item: T) => {
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(item);
    else {
      const existing = out.find((g) => g.label === label);
      if (existing) existing.items.push(item);
      else out.push({ label, items: [item] });
    }
  };
  if (sort === "from") {
    const sorted = [...items].sort((a, b) =>
      title(a).localeCompare(title(b), undefined, { sensitivity: "base" }),
    );
    for (const it of sorted) {
      const ch = title(it).trim().charAt(0).toUpperCase();
      push(/[A-Z]/.test(ch) ? ch : "#", it);
    }
    return out;
  }
  if (sort === "unread") {
    const unread = items.filter((i) => i.unreadCount > 0);
    const read = items.filter((i) => i.unreadCount === 0);
    if (unread.length) out.push({ label: "Unread", items: unread });
    if (read.length) out.push({ label: "Read", items: read });
    return out;
  }
  const pinned = pinnedFirst ? items.filter((i) => i.pinned) : [];
  if (pinned.length) out.push({ label: "Pinned", items: pinned });
  const rest = pinnedFirst ? items.filter((i) => !i.pinned) : items;
  const sorted = [...rest].sort((a, b) => b.lastEmailAt - a.lastEmailAt);
  for (const it of sorted) push(dateBucket(it.lastEmailAt, now), it);
  return out;
}

// ── Focused / Other ──────────────────────────────────────────────────────

/** Focused = conversations we have replied in, or flagged / pinned ones. */
export function isFocused(item: GroupedItem): boolean {
  return item.hasSent || item.starred || item.pinned;
}

export function splitFocused<T extends GroupedItem>(
  items: T[],
): { focused: T[]; other: T[] } {
  const focused: T[] = [];
  const other: T[] = [];
  for (const it of items) (isFocused(it) ? focused : other).push(it);
  return { focused, other };
}

// ── Formatting ───────────────────────────────────────────────────────────

/** Time shown on the right of a list row. */
export function formatListTime(tsSec: number, now: Date = new Date()): string {
  const d = new Date(tsSec * 1000);
  const bucket = dateBucket(tsSec, now);
  if (bucket === "Today")
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (bucket === "Yesterday" || bucket === "This week") {
    const day = d.toLocaleDateString([], { weekday: "short" });
    const time = d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${day} ${time}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    const wd = d.toLocaleDateString([], { weekday: "short" });
    return `${wd} ${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** Compact time for the mobile list (Outlook iOS: "3:45 PM", "Yesterday", "Mon", "10/3/26"). */
export function formatMobileTime(
  tsSec: number,
  now: Date = new Date(),
): string {
  const d = new Date(tsSec * 1000);
  const bucket = dateBucket(tsSec, now);
  if (bucket === "Today")
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (bucket === "Yesterday") return "Yesterday";
  if (bucket === "This week")
    return d.toLocaleDateString([], { weekday: "short" });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

/** Full date-time in a message header ("Mon 10/26/2026 3:45 PM"). */
export function formatFullDate(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  const wd = d.toLocaleDateString([], { weekday: "short" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${wd} ${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${time}`;
}

/** One or two initials from a name or address. */
export function initials(nameOrEmail: string | null | undefined): string {
  const s = (nameOrEmail ?? "").trim();
  if (!s) return "?";
  const base = s.includes("@") && !s.includes(" ") ? s.split("@")[0] : s;
  const parts = base
    .replace(/[^\p{L}\p{N}\s._-]/gu, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return s.charAt(0).toUpperCase();
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export const AVATAR_COLOURS = 12;

/** Stable colour slot (0..AVATAR_COLOURS-1) for a seed string. */
export function avatarSlot(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % AVATAR_COLOURS;
}

export function normalizeSubject(s: string | null | undefined): string {
  return (s ?? "").replace(/^\s*((re|fw|fwd|aw|sv)\s*:\s*)+/i, "").trim();
}

export function forwardSubject(s: string | null | undefined): string {
  const base = normalizeSubject(s);
  return `Fwd: ${base}`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Quoted original for a forward, Outlook style (From / Sent / To / Subject). */
export function buildForwardHtml(
  email: Pick<
    Email,
    | "type"
    | "fromAddress"
    | "toAddress"
    | "recipient"
    | "subject"
    | "timestamp"
    | "bodyHtml"
    | "bodyText"
  >,
  fromLabel: string,
  safeBodyHtml: string | null,
): string {
  const to = email.type === "sent" ? email.toAddress : email.recipient;
  const header = [
    `<b>From:</b> ${escapeHtml(fromLabel)}`,
    `<b>Sent:</b> ${escapeHtml(formatFullDate(email.timestamp))}`,
    `<b>To:</b> ${escapeHtml(to ?? "")}`,
    `<b>Subject:</b> ${escapeHtml(email.subject ?? "")}`,
  ].join("<br>");
  const body =
    safeBodyHtml ??
    `<p>${escapeHtml(email.bodyText ?? "").replace(/\n/g, "<br>")}</p>`;
  return `<p></p><p></p><hr><p>${header}</p>${body}`;
}

// ── Keyboard ─────────────────────────────────────────────────────────────

export type OlCommand =
  | "newMail"
  | "delete"
  | "archive"
  | "reply"
  | "replyAll"
  | "forward"
  | "markRead"
  | "markUnread"
  | "flag"
  | "next"
  | "prev"
  | "open"
  | "close"
  | "help"
  | "search"
  | "selectAll"
  | "ribbon";

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** Outlook on the web keyboard map (the "Outlook" shortcut set). */
export function commandForKey(e: KeyLike): OlCommand | null {
  const mod = !!(e.ctrlKey || e.metaKey);
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && e.shiftKey && k === "r") return "replyAll";
  if (mod && e.shiftKey && k === "f") return "forward";
  if (mod && !e.shiftKey) {
    if (k === "n") return "newMail";
    if (k === "r") return "reply";
    if (k === "q") return "markRead";
    if (k === "u") return "markUnread";
    if (k === "a") return "selectAll";
    if (k === "e") return "search";
    return null;
  }
  if (e.altKey && k === "h") return "ribbon";
  if (e.altKey || mod) return null;
  switch (k) {
    case "Delete":
      return "delete";
    case "e":
      return "archive";
    case "Insert":
      return "flag";
    case "ArrowDown":
      return "next";
    case "ArrowUp":
      return "prev";
    case "Enter":
      return "open";
    case "Escape":
      return "close";
    case "?":
      return "help";
    case "/":
      return "search";
  }
  return null;
}

export const SHORTCUT_HELP: Array<{ keys: string; label: string }> = [
  { keys: "Ctrl+N", label: "New mail" },
  { keys: "Ctrl+R", label: "Reply" },
  { keys: "Ctrl+Shift+R", label: "Reply all" },
  { keys: "Ctrl+Shift+F", label: "Forward" },
  { keys: "Delete", label: "Delete (permanent)" },
  { keys: "E", label: "Archive" },
  { keys: "Insert", label: "Flag / unflag" },
  { keys: "Ctrl+Q", label: "Mark as read" },
  { keys: "Ctrl+U", label: "Mark as unread" },
  { keys: "↑ / ↓", label: "Previous / next message" },
  { keys: "Enter", label: "Open" },
  { keys: "Esc", label: "Close" },
  { keys: "Ctrl+A", label: "Select all" },
  { keys: "/ or Ctrl+E", label: "Search" },
  { keys: "Alt+H", label: "Go to the ribbon" },
  { keys: "?", label: "Keyboard shortcuts" },
];

/** True when focus is in a field the user is typing into. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit"].includes(type);
  }
  return false;
}

// ── Selection ────────────────────────────────────────────────────────────

/** Keys between two keys (inclusive) in list order, for Shift-click. */
export function rangeKeys(order: string[], a: string, b: string): string[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return [b];
  const [lo, hi] = i < j ? [i, j] : [j, i];
  return order.slice(lo, hi + 1);
}

// ── Swipe ────────────────────────────────────────────────────────────────

export type SwipeOutcome = "archive" | "flag" | null;

/** Mobile swipe: right past the threshold archives, left flags. */
export function swipeOutcome(dx: number, width: number): SwipeOutcome {
  const threshold = Math.min(120, width * 0.3);
  if (dx >= threshold) return "archive";
  if (dx <= -threshold) return "flag";
  return null;
}
