/**
 * Pure helpers for the Outlook layout: folder mapping, date grouping, the
 * Focused / Other split, list time formatting, avatar colours and the
 * Outlook-on-the-web keyboard map. No React here so it stays unit-testable.
 */
import type { Email, GroupedItem, MailCategory, MailFolder } from "@/lib/api";

// ── Folders ──────────────────────────────────────────────────────────────

export type OlFolderId =
  | "inbox"
  | "drafts"
  | "sent"
  | "archive"
  | "snoozed"
  | "flagged"
  | "sequenced"
  | "unread"
  | "deleted";

export const FOLDER_IDS: OlFolderId[] = [
  "inbox",
  "drafts",
  "sent",
  "archive",
  "snoozed",
  "flagged",
  "sequenced",
  "unread",
  "deleted",
];

export const FOLDER_LABELS: Record<OlFolderId, string> = {
  inbox: "Inbox",
  drafts: "Drafts",
  sent: "Sent Items",
  archive: "Archive",
  snoozed: "Snoozed",
  flagged: "Flagged",
  sequenced: "Sequenced",
  unread: "Unread mail",
  deleted: "Deleted Items",
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
  unread?: boolean;
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
    case "unread":
      return { folder: "all", unread: true };
    case "deleted":
      // Delete is permanent here; the folder exists as a drop target.
      return { folder: "all" };
  }
}

// ── Favorites ────────────────────────────────────────────────────────────

/**
 * A favorite is a folder id, or `label:<inbox address>`. Defaults avoid
 * repeating the account's Inbox: Unread mail and Flagged are the two
 * search folders Outlook users add most, and they are not in the account
 * tree, so nothing appears twice until the user adds Inbox themselves.
 */
export const DEFAULT_FAVORITES = ["unread", "flagged"];

export function favoriteKey(folder: OlFolderId, label?: string): string {
  return label ? `label:${label}` : folder;
}

export function parseFavorite(
  key: string,
): { folder: OlFolderId; label?: string } | null {
  if (key.startsWith("label:")) return { folder: "inbox", label: key.slice(6) };
  return (FOLDER_IDS as string[]).includes(key)
    ? { folder: key as OlFolderId }
    : null;
}

// ── List filters and sort ────────────────────────────────────────────────

export type ListFilter =
  | "all"
  | "unread"
  | "flagged"
  | "tome"
  | "files"
  | "pinned";
export type ListSort =
  | "date"
  | "from"
  | "category"
  | "flag"
  | "unread"
  | "files";

export const FILTER_LABELS: Record<ListFilter, string> = {
  all: "All",
  unread: "Unread",
  flagged: "Flagged",
  tome: "To me",
  files: "Has files",
  pinned: "Pinned",
};

export const SORT_LABELS: Record<ListSort, string> = {
  date: "Date",
  from: "From",
  category: "Category",
  flag: "Flag status",
  unread: "Unread",
  files: "Has attachments",
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
    case "tome":
      // Mail addressed to us one-to-one (not group threads we are on).
      return items.filter((i) => i.type === "person");
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
  const byDate = (xs: T[]) =>
    [...xs].sort((a, b) => b.lastEmailAt - a.lastEmailAt);
  const twoWay = (yes: string, no: string, test: (i: T) => boolean) => {
    const a = byDate(items.filter(test));
    const b = byDate(items.filter((i) => !test(i)));
    if (a.length) out.push({ label: yes, items: a });
    if (b.length) out.push({ label: no, items: b });
    return out;
  };
  if (sort === "unread")
    return twoWay("Unread", "Read", (i) => i.unreadCount > 0);
  if (sort === "flag")
    return twoWay("Flagged", "Not flagged", (i) => i.starred);
  if (sort === "files")
    return twoWay(
      "Has attachments",
      "No attachments",
      (i) => i.hasAttachment > 0,
    );
  if (sort === "category") {
    for (const c of ["primary", "updates", "social", "promotions"] as const) {
      const xs = byDate(items.filter((i) => (i.category ?? "primary") === c));
      if (xs.length) out.push({ label: CATEGORY_LABELS[c], items: xs });
    }
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

export const CATEGORY_LABELS: Record<MailCategory, string> = {
  primary: "Primary",
  promotions: "Promotions",
  social: "Social",
  updates: "Updates",
};

/**
 * Focused = the primary category, plus anything pinned or flagged.
 * Other = promotions, social and updates.
 */
export function isFocused(item: GroupedItem): boolean {
  return (
    (item.category ?? "primary") === "primary" || item.starred || item.pinned
  );
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
  | "first"
  | "last"
  | "open"
  | "close"
  | "help"
  | "search"
  | "selectAll"
  | "ribbon"
  | "undo"
  | "move"
  | "panes";

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * Outlook on the web keyboard map (the "Outlook.com / Outlook" set), plus the
 * single-key Q / U read toggles OWA accepts.
 */
export function commandForKey(e: KeyLike): OlCommand | null {
  const mod = !!(e.ctrlKey || e.metaKey);
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && e.shiftKey) {
    if (k === "r") return "replyAll";
    if (k === "f") return "forward";
    if (k === "v") return "move";
    return null;
  }
  if (mod) {
    switch (k) {
      case "n":
        return "newMail";
      case "r":
        return "reply";
      case "q":
        return "markRead";
      case "u":
        return "markUnread";
      case "a":
        return "selectAll";
      case "e":
        return "search";
      case "z":
        return "undo";
      case ".":
        return "next";
      case ",":
        return "prev";
    }
    return null;
  }
  if (e.altKey) return k === "h" ? "ribbon" : null;
  if (e.shiftKey && k === "Delete") return "delete";
  switch (k) {
    case "Delete":
      return "delete";
    case "e":
      return "archive";
    case "Insert":
      return "flag";
    case "q":
      return "markRead";
    case "u":
      return "markUnread";
    case "n":
      return "newMail";
    case "r":
      return e.shiftKey ? "replyAll" : "reply";
    case "f":
      return "forward";
    case "ArrowDown":
      return "next";
    case "ArrowUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "Enter":
      return "open";
    case "Escape":
      return "close";
    case "?":
      return "help";
    case "/":
      return "search";
    case "F6":
      return "panes";
  }
  return null;
}

export const SHORTCUT_HELP: Array<{
  group: string;
  keys: string;
  label: string;
}> = [
  { group: "Mail", keys: "Ctrl+N or N", label: "New mail" },
  { group: "Mail", keys: "Ctrl+R or R", label: "Reply" },
  { group: "Mail", keys: "Ctrl+Shift+R", label: "Reply all" },
  { group: "Mail", keys: "Ctrl+Shift+F or F", label: "Forward" },
  { group: "Mail", keys: "Delete / Shift+Delete", label: "Delete (permanent)" },
  { group: "Mail", keys: "E", label: "Archive" },
  { group: "Mail", keys: "Ctrl+Shift+V", label: "Move to folder" },
  { group: "Mail", keys: "Insert", label: "Flag / unflag" },
  { group: "Mail", keys: "Ctrl+Q or Q", label: "Mark as read" },
  { group: "Mail", keys: "Ctrl+U or U", label: "Mark as unread" },
  { group: "Mail", keys: "Ctrl+Z", label: "Undo" },
  { group: "Navigate", keys: "↑ / ↓", label: "Previous / next message" },
  {
    group: "Navigate",
    keys: "Ctrl+, / Ctrl+.",
    label: "Previous / next message",
  },
  { group: "Navigate", keys: "Home / End", label: "First / last message" },
  { group: "Navigate", keys: "Enter", label: "Open" },
  { group: "Navigate", keys: "Esc", label: "Close" },
  { group: "Navigate", keys: "F6", label: "Move between panes" },
  { group: "Navigate", keys: "Ctrl+A", label: "Select all" },
  { group: "Navigate", keys: "/ or Ctrl+E", label: "Search" },
  { group: "Navigate", keys: "Alt+H", label: "Go to the ribbon" },
  { group: "Navigate", keys: "?", label: "Keyboard shortcuts" },
];

/** True when focus is in a field the user is typing into. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || typeof (el as HTMLElement).tagName !== "string") return false;
  const h = el as HTMLElement;
  if (h.isContentEditable) return true;
  const tag = h.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (h as HTMLInputElement).type;
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

export type SwipeAction =
  | "archive"
  | "delete"
  | "flag"
  | "read"
  | "snooze"
  | "move"
  | "none";

export const SWIPE_LABELS: Record<SwipeAction, string> = {
  archive: "Archive",
  delete: "Delete",
  flag: "Flag",
  read: "Mark as read/unread",
  snooze: "Snooze",
  move: "Move to folder",
  none: "None",
};

export type SwipeOutcome = "right" | "left" | null;

/** Which side's action a swipe of `dx` px triggers (null = snap back). */
export function swipeOutcome(dx: number, width: number): SwipeOutcome {
  const threshold = Math.min(120, width * 0.3);
  if (dx >= threshold) return "right";
  if (dx <= -threshold) return "left";
  return null;
}

// ── Search query syntax ─────────────────────────────────────────────────

export interface ParsedQuery {
  /** Free text left after the keywords. */
  text: string;
  from?: string;
  to?: string;
  hasAttachment?: boolean;
  unread?: boolean;
  flagged?: boolean;
  folder?: OlFolderId;
  /** received:>=YYYY-MM-DD style bounds, unix seconds. */
  after?: number;
  before?: number;
}

const FOLDER_ALIASES: Record<string, OlFolderId> = {
  inbox: "inbox",
  sent: "sent",
  sentitems: "sent",
  drafts: "drafts",
  archive: "archive",
  snoozed: "snoozed",
  flagged: "flagged",
  sequenced: "sequenced",
};

const YES = new Set(["yes", "true", "1"]);
const NO = new Set(["no", "false", "0"]);

/**
 * Parse Outlook search keywords: from:, to:, hasattachments:yes|no,
 * isread:yes|no, isflagged:yes|no, folder:<name>, received:<date>,
 * received>=<date>, received<=<date>. Quoted values are allowed.
 */
export function parseSearchQuery(raw: string): ParsedQuery {
  const out: ParsedQuery = { text: "" };
  const rest: string[] = [];
  const re = /(\w+)(:|>=|<=|>|<)("[^"]*"|\S+)|"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (!m[1]) {
      rest.push(m[0]);
      continue;
    }
    const key = m[1].toLowerCase();
    const op = m[2];
    const val = m[3].replace(/^"|"$/g, "");
    const lv = val.toLowerCase();
    const day = (v: string) => {
      const t = Date.parse(v);
      return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
    };
    switch (key) {
      case "from":
        out.from = val;
        break;
      case "to":
        out.to = val;
        break;
      case "hasattachments":
      case "hasattachment":
        if (YES.has(lv)) out.hasAttachment = true;
        else if (NO.has(lv)) out.hasAttachment = false;
        break;
      case "isread":
        if (YES.has(lv)) out.unread = false;
        else if (NO.has(lv)) out.unread = true;
        break;
      case "isflagged":
        if (YES.has(lv)) out.flagged = true;
        else if (NO.has(lv)) out.flagged = false;
        break;
      case "folder":
        if (FOLDER_ALIASES[lv.replace(/\s+/g, "")])
          out.folder = FOLDER_ALIASES[lv.replace(/\s+/g, "")];
        break;
      case "received": {
        const t = day(val);
        if (t === undefined) break;
        if (op === ">=" || op === ">") out.after = t;
        else if (op === "<=" || op === "<") out.before = t + 86400;
        else {
          out.after = t;
          out.before = t + 86400;
        }
        break;
      }
      default:
        rest.push(m[0]);
    }
  }
  out.text = rest.join(" ").trim();
  return out;
}

/** Rebuild a query string from refiner values (inverse of the parser). */
export function buildSearchQuery(p: ParsedQuery): string {
  const q = (v: string) => (/\s/.test(v) ? `"${v}"` : v);
  const parts: string[] = [];
  if (p.from) parts.push(`from:${q(p.from)}`);
  if (p.to) parts.push(`to:${q(p.to)}`);
  if (p.hasAttachment !== undefined)
    parts.push(`hasattachments:${p.hasAttachment ? "yes" : "no"}`);
  if (p.unread !== undefined) parts.push(`isread:${p.unread ? "no" : "yes"}`);
  if (p.flagged !== undefined)
    parts.push(`isflagged:${p.flagged ? "yes" : "no"}`);
  if (p.folder) parts.push(`folder:${p.folder}`);
  if (p.after !== undefined) {
    const d = new Date(p.after * 1000).toISOString().slice(0, 10);
    parts.push(`received>=${d}`);
  }
  if (p.text) parts.push(p.text);
  return parts.join(" ");
}

// ── Sweep ────────────────────────────────────────────────────────────────

/** Sender address(es) of a row (the person, or a group's participants). */
export function senderAddresses(item: GroupedItem): string[] {
  return item.type === "person"
    ? [item.email.toLowerCase()]
    : item.participants.map((p) => p.email.toLowerCase());
}

/**
 * Rows Sweep acts on: every row whose sender is `sender` (an address, or a
 * bare domain such as "@example.com").
 */
export function sweepSelection<T extends GroupedItem>(
  items: T[],
  sender: string,
): T[] {
  const s = sender.trim().toLowerCase();
  if (!s) return [];
  const domain = s.startsWith("@") ? s : null;
  return items.filter((it) =>
    senderAddresses(it).some((a) => (domain ? a.endsWith(domain) : a === s)),
  );
}

// ── Group conversation titles ────────────────────────────────────────────

/** "Vera Wayne; Bob Brown" — participants then Cc'd people, de-duplicated. */
export function groupParticipants(
  item: Extract<GroupedItem, { type: "group" }>,
): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const p of [...item.participants, ...(item.ccParticipants ?? [])]) {
    const k = p.email.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    names.push(p.name || p.email);
  }
  return names.join("; ") || item.inbox;
}

// ── Flag with a reminder (Outlook's Flag ▸ Today / Tomorrow / …) ─────────

export function flagReminder(
  when: "today" | "tomorrow" | "thisweek" | "nextweek",
  now: Date = new Date(),
): number | null {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  };
  switch (when) {
    case "today":
      return null; // flag only: due today, stays in the inbox
    case "tomorrow":
      return at(1, 8);
    case "thisweek": {
      // Outlook's "This week" is due Friday; remind Thursday morning.
      const toThu = (4 - now.getDay() + 7) % 7 || 7;
      return toThu >= 5 ? at(1, 8) : at(toThu, 8);
    }
    case "nextweek": {
      const toMon = (8 - now.getDay()) % 7 || 7;
      return at(toMon, 8);
    }
  }
}
