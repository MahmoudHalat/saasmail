import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { MailCategory, Stats } from "@/lib/api";

/* ── Gmail-only view settings (this device) ────────────────────────── */

export type ReadingPane = "none" | "right" | "below";
/** Gmail's three densities; the account setting only has two, so
 *  "default" vs "comfortable" lives on this device. */
export type GmailDensity = "default" | "comfortable" | "compact";
export type InboxType = "default" | "unread" | "starred";
export type SwipeAction = "archive" | "delete" | "read" | "snooze" | "none";

const VIEW_KEY = "saasmail.gmail.view";

export interface ViewPrefs {
  readingPane: ReadingPane;
  density: Exclude<GmailDensity, "compact">;
  /** Primary / Promotions / Social / Updates tabs on the inbox. */
  tabs: boolean;
  inboxType: InboxType;
  swipeLeft: SwipeAction;
  swipeRight: SwipeAction;
}

export const DEFAULT_VIEW: ViewPrefs = {
  readingPane: "none",
  density: "default",
  tabs: true,
  inboxType: "default",
  swipeLeft: "archive",
  swipeRight: "archive",
};

const SWIPES: SwipeAction[] = ["archive", "delete", "read", "snooze", "none"];

function readView(): ViewPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(VIEW_KEY) ?? "{}");
    return {
      readingPane: ["right", "below"].includes(raw.readingPane)
        ? raw.readingPane
        : "none",
      density: raw.density === "comfortable" ? "comfortable" : "default",
      tabs: raw.tabs !== false,
      inboxType: ["unread", "starred"].includes(raw.inboxType)
        ? raw.inboxType
        : "default",
      swipeLeft: SWIPES.includes(raw.swipeLeft) ? raw.swipeLeft : "archive",
      swipeRight: SWIPES.includes(raw.swipeRight) ? raw.swipeRight : "archive",
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

const VIEW_EVENT = "saasmail:gmail-view";

/** Device-local Gmail view settings, shared across components via an event. */
export function useGmailView() {
  const [view, setView] = useState<ViewPrefs>(readView);
  useEffect(() => {
    const on = () => setView(readView());
    window.addEventListener(VIEW_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(VIEW_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  const update = useCallback((patch: Partial<ViewPrefs>) => {
    const next = { ...readView(), ...patch };
    try {
      window.localStorage.setItem(VIEW_KEY, JSON.stringify(next));
    } catch {
      /* storage off: still applies for this session via the event */
    }
    window.dispatchEvent(new Event(VIEW_EVENT));
    setView(next);
  }, []);
  return { ...view, update };
}

/* ── Recent searches ───────────────────────────────────────────────── */

const RECENT_KEY = "saasmail.gmail.recentSearches";

export function readRecentSearches(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeRecentSearches(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/* ── Media queries ─────────────────────────────────────────────────── */

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export const MOBILE_QUERY = "(max-width: 767px)";
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);

export function useOnline(): boolean {
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/* ── Shell <-> inbox context ───────────────────────────────────────── */

/** Counts the nav shows (Gmail shows Inbox unread, Drafts total, etc.). */
export interface NavCounts {
  /** Unread conversations in the inbox (Primary when tabs are on). */
  inboxUnread: number;
  drafts: number;
  outbox: number;
  /** Unread conversations per inbox tab. */
  categories: Partial<Record<MailCategory, number>>;
}

export interface GmailShellApi {
  /** Open the navigation drawer (mobile). */
  openDrawer: () => void;
  /** Open the account sheet (mobile). */
  openAccount: () => void;
  /** Open the quick settings panel. */
  openQuickSettings: () => void;
  /** Focus the top search box (desktop) or the mobile search bar. */
  focusSearch: () => void;
  /** The inbox shares fresh stats so the nav counts stay in step. */
  reportStats: (s: Stats) => void;
  /** Re-fetch nav counts (after actions). */
  refreshCounts: () => void;
  /** Show the keyboard shortcut help. */
  openShortcuts: () => void;
  /** True while the inbox page is mounted (it draws its own mobile bar). */
  setInboxMounted: (v: boolean) => void;
  stats: Stats | null;
  counts: NavCounts;
}

export const EMPTY_COUNTS: NavCounts = {
  inboxUnread: 0,
  drafts: 0,
  outbox: 0,
  categories: {},
};

export const GmailShellContext = createContext<GmailShellApi | null>(null);

const NOOP: GmailShellApi = {
  openDrawer: () => {},
  openAccount: () => {},
  openQuickSettings: () => {},
  focusSearch: () => {},
  reportStats: () => {},
  refreshCounts: () => {},
  openShortcuts: () => {},
  setInboxMounted: () => {},
  stats: null,
  counts: EMPTY_COUNTS,
};

export function useGmailShell(): GmailShellApi {
  return useContext(GmailShellContext) ?? NOOP;
}
