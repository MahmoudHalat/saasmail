import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Stats } from "@/lib/api";

/* ── Gmail-only view settings (this device) ────────────────────────── */

export type ReadingPane = "none" | "right";
/** Gmail's three densities; the account setting only has two, so
 *  "default" vs "comfortable" lives on this device. */
export type GmailDensity = "default" | "comfortable" | "compact";

const VIEW_KEY = "saasmail.gmail.view";

interface ViewPrefs {
  readingPane: ReadingPane;
  density: Exclude<GmailDensity, "compact">;
}

function readView(): ViewPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(VIEW_KEY) ?? "{}");
    return {
      readingPane: raw.readingPane === "right" ? "right" : "none",
      density: raw.density === "comfortable" ? "comfortable" : "default",
    };
  } catch {
    return { readingPane: "none", density: "default" };
  }
}

const VIEW_EVENT = "saasmail:gmail-view";

/** Reading pane + density variant, shared across components via an event. */
export function useGmailView() {
  const [view, setView] = useState<ViewPrefs>(readView);
  useEffect(() => {
    const on = () => setView(readView());
    window.addEventListener(VIEW_EVENT, on);
    return () => window.removeEventListener(VIEW_EVENT, on);
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

/* ── Shell <-> inbox context ───────────────────────────────────────── */

export interface GmailShellApi {
  /** Open the navigation drawer (mobile). */
  openDrawer: () => void;
  /** Open the account sheet (mobile). */
  openAccount: () => void;
  /** Focus the top search box (desktop) or the mobile search bar. */
  focusSearch: () => void;
  /** The inbox shares fresh stats so the nav counts stay in step. */
  reportStats: (s: Stats) => void;
  /** Show the keyboard shortcut help. */
  openShortcuts: () => void;
  /** True while the inbox page is mounted (it draws its own mobile bar). */
  setInboxMounted: (v: boolean) => void;
  stats: Stats | null;
}

export const GmailShellContext = createContext<GmailShellApi | null>(null);

const NOOP: GmailShellApi = {
  openDrawer: () => {},
  openAccount: () => {},
  focusSearch: () => {},
  reportStats: () => {},
  openShortcuts: () => {},
  setInboxMounted: () => {},
  stats: null,
};

export function useGmailShell(): GmailShellApi {
  return useContext(GmailShellContext) ?? NOOP;
}
