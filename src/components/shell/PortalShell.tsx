import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Rail from "./Rail";
import TopBand from "./TopBand";
import CommandPalette from "./CommandPalette";
import { shellStore } from "./shellStore";

function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(q).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

/**
 * The default theme's frame: navy chrome (rail + top band) around one
 * rounded light "paper" panel that scrolls. Below 900px the rail becomes an
 * off-canvas drawer and the paper goes edge to edge.
 */
export default function PortalShell({
  children,
  onCompose,
}: {
  children: ReactNode;
  onCompose: () => void;
}) {
  const drawer = useMediaQuery("(max-width: 900px)");
  const [navOpen, setNavOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  // ⌘K / Ctrl+K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        shellStore.set({ cmdk: !shellStore.get().cmdk });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`pt-app${drawer && navOpen ? " nav-open" : ""}`}>
      <a
        href="#pt-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-text-primary"
      >
        Skip to content
      </a>
      <div className="pt-scrim" onClick={() => setNavOpen(false)} />
      <Rail drawer={drawer} />
      <div className="pt-col">
        <TopBand onMenu={() => setNavOpen(true)} onCompose={onCompose} />
        <main id="pt-main" className="pt-paper" tabIndex={-1}>
          <div className="pt-scroll" ref={scroller}>
            {children}
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
