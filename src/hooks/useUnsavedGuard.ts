import { useCallback, useEffect, useRef } from "react";

const MESSAGE = "You have unsaved changes. Leave without saving?";

/**
 * Warn before unsaved edits are lost: on reload or tab close (the
 * browser's own prompt), and on in-app links such as the rail (a
 * confirm). The app uses BrowserRouter, which has no navigation blocker,
 * so links are caught at the document in the capture phase.
 *
 * Returns `confirmLeave()` for the page's own Cancel/Back buttons, and
 * `release()` to call right before navigating away after a save.
 */
export function useUnsavedGuard(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const released = useRef(false);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current || released.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || released.current) return;
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (!a || a.getAttribute("target") === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#") || /^(mailto|tel):/.test(href)) return;
      if (!window.confirm(MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const confirmLeave = useCallback(
    () => !dirtyRef.current || released.current || window.confirm(MESSAGE),
    [],
  );
  const release = useCallback(() => {
    released.current = true;
  }, []);

  return { confirmLeave, release };
}
