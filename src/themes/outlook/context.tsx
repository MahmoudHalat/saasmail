import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ComposePrefill } from "@/pages/ComposeModal";

/**
 * State shared between the Outlook shell (suite header, settings flyout,
 * mobile drawer and tab bar) and the Outlook inbox (ribbon, folder pane,
 * list, reading pane). The shell provides it around every signed-in page.
 */

export type ReadingPanePos = "right" | "bottom" | "off";

interface LayoutPrefs {
  readingPane: ReadingPanePos;
  conversationView: boolean;
  folderPaneOpen: boolean;
  listWidth: number;
  /** "Spacious" vs "Cozy" (both map to the comfortable account density). */
  spacious: boolean;
}

const LAYOUT_KEY = "saasmail.outlook.layout";
const DEFAULT_LAYOUT: LayoutPrefs = {
  readingPane: "right",
  conversationView: true,
  folderPaneOpen: true,
  listWidth: 380,
  spacious: false,
};

function readLayout(): LayoutPrefs {
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const r = JSON.parse(raw) as Partial<LayoutPrefs>;
    return {
      readingPane: (["right", "bottom", "off"] as const).includes(
        r.readingPane as ReadingPanePos,
      )
        ? (r.readingPane as ReadingPanePos)
        : DEFAULT_LAYOUT.readingPane,
      conversationView:
        typeof r.conversationView === "boolean"
          ? r.conversationView
          : DEFAULT_LAYOUT.conversationView,
      folderPaneOpen:
        typeof r.folderPaneOpen === "boolean"
          ? r.folderPaneOpen
          : DEFAULT_LAYOUT.folderPaneOpen,
      listWidth:
        typeof r.listWidth === "number" &&
        r.listWidth >= 280 &&
        r.listWidth <= 720
          ? r.listWidth
          : DEFAULT_LAYOUT.listWidth,
      spacious: r.spacious === true,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export interface ComposeState {
  /** Bumps on every open so a fresh form mounts. */
  id: number;
  prefill: ComposePrefill | null;
}

interface OutlookContextValue extends LayoutPrefs {
  setLayout: (patch: Partial<LayoutPrefs>) => void;
  compose: ComposeState | null;
  openCompose: (prefill?: ComposePrefill | null) => void;
  closeCompose: () => void;
  /** The shared bottom-right tray, for flows the theme does not own. */
  openTrayCompose: (prefill?: ComposePrefill) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  mobileSearchOpen: boolean;
  setMobileSearchOpen: (open: boolean) => void;
  /** Mobile: the inbox hides the tab bar while a conversation is open. */
  hideTabBar: boolean;
  setHideTabBar: (hide: boolean) => void;
}

const OutlookContext = createContext<OutlookContextValue | null>(null);

export function OutlookProvider({
  children,
  onTrayCompose,
}: {
  children: ReactNode;
  onTrayCompose: (prefill?: ComposePrefill) => void;
}) {
  const [layout, setLayoutState] = useState<LayoutPrefs>(() =>
    typeof window === "undefined" ? DEFAULT_LAYOUT : readLayout(),
  );
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [hideTabBar, setHideTabBar] = useState(false);

  const setLayout = useCallback((patch: Partial<LayoutPrefs>) => {
    setLayoutState((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      /* storage disabled */
    }
  }, [layout]);

  const openCompose = useCallback((prefill?: ComposePrefill | null) => {
    setCompose((prev) => ({
      id: (prev?.id ?? 0) + 1,
      prefill: prefill ?? null,
    }));
  }, []);
  const closeCompose = useCallback(() => setCompose(null), []);

  const value = useMemo<OutlookContextValue>(
    () => ({
      ...layout,
      setLayout,
      compose,
      openCompose,
      closeCompose,
      openTrayCompose: onTrayCompose,
      settingsOpen,
      setSettingsOpen,
      shortcutsOpen,
      setShortcutsOpen,
      drawerOpen,
      setDrawerOpen,
      mobileSearchOpen,
      setMobileSearchOpen,
      hideTabBar,
      setHideTabBar,
    }),
    [
      layout,
      setLayout,
      compose,
      openCompose,
      closeCompose,
      onTrayCompose,
      settingsOpen,
      shortcutsOpen,
      drawerOpen,
      mobileSearchOpen,
      hideTabBar,
    ],
  );

  return (
    <OutlookContext.Provider value={value}>{children}</OutlookContext.Provider>
  );
}

export function useOutlook(): OutlookContextValue {
  const ctx = useContext(OutlookContext);
  if (!ctx) throw new Error("useOutlook must be used inside OutlookShell");
  return ctx;
}

/** Media query hook. */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export const useIsMobile = () => useMedia("(max-width: 767px)");
