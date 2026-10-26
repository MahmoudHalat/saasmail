import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import { usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { useMedia, useOutlook } from "./context";
import FolderList from "./FolderList";
import MessageList from "./MessageList";
import ReadingPane from "./ReadingPane";
import Ribbon from "./Ribbon";
import { SnoozeDialog } from "./Snooze";
import { commandForKey, isTypingTarget } from "./lib";
import { sendConversationCommand } from "./Conversation";
import type { OutlookMail } from "./useOutlookMail";

/** Outlook on the web keyboard shortcuts for the mail module. */
function useShortcuts(mail: OutlookMail) {
  const o = useOutlook();
  const ref = useRef({ mail, o });
  ref.current = { mail, o };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { mail, o } = ref.current;
      if (e.defaultPrevented) return;
      const cmd = commandForKey(e);
      if (!cmd) return;
      const typing = isTypingTarget(e.target);
      // Ctrl+N and Esc still work from fields; everything else waits.
      if (typing && cmd !== "newMail") return;
      if (
        document.querySelector("[role=dialog],[role=menu]") &&
        cmd !== "close"
      )
        return;
      const t = mail.targets;
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      switch (cmd) {
        case "newMail":
          return run(() => o.openCompose(null));
        case "reply":
        case "replyAll":
        case "forward":
          if (!mail.openedItem) return;
          return run(() => sendConversationCommand(cmd));
        case "delete":
          if (t.length) run(() => void mail.ops.delete(t));
          return;
        case "archive":
          if (t.length) run(() => mail.ops.archive(t));
          return;
        case "flag":
          if (t.length) run(() => mail.ops.flag(t));
          return;
        case "markRead":
          if (t.length) run(() => mail.ops.markRead(t));
          return;
        case "markUnread":
          if (t.length) run(() => void mail.ops.markUnread(t));
          return;
        case "next":
          return run(() => mail.step(1));
        case "prev":
          return run(() => mail.step(-1));
        case "open": {
          // Enter on a focused row opens it.
          const el = document.activeElement as HTMLElement | null;
          const key = el?.dataset?.key;
          const it = key
            ? mail.allItems.find((i) => `${i.type}:${i.id}` === key)
            : null;
          if (it) run(() => mail.openItem(it));
          return;
        }
        case "close":
          if (o.settingsOpen) return run(() => o.setSettingsOpen(false));
          if (o.compose) return run(() => o.closeCompose());
          if (mail.openKey || mail.selected.size)
            return run(() => mail.clearSelection());
          return;
        case "help":
          return run(() => o.setShortcutsOpen(true));
        case "search":
          return run(() => window.dispatchEvent(new Event("ol:focus-search")));
        case "selectAll":
          return run(() => mail.selectAll());
        case "ribbon":
          return run(() =>
            document
              .querySelector<HTMLElement>("[data-ribbon-tab=home]")
              ?.focus(),
          );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Splitter({
  onDrag,
  orientation,
}: {
  onDrag: (delta: number, done: boolean) => void;
  orientation: "vertical" | "horizontal";
}) {
  const start = useRef<number | null>(null);
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label="Resize message list"
      tabIndex={0}
      className={cn(
        "ol-splitter",
        orientation === "horizontal" && "ol-splitter-h",
      )}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start.current = orientation === "vertical" ? e.clientX : e.clientY;
      }}
      onPointerMove={(e) => {
        if (start.current === null) return;
        const p = orientation === "vertical" ? e.clientX : e.clientY;
        onDrag(p - start.current, false);
      }}
      onPointerUp={(e) => {
        if (start.current === null) return;
        const p = orientation === "vertical" ? e.clientX : e.clientY;
        onDrag(p - start.current, true);
        start.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") onDrag(-16, true);
        if (e.key === "ArrowRight" || e.key === "ArrowDown") onDrag(16, true);
      }}
    />
  );
}

export default function DesktopMail({ mail }: { mail: OutlookMail }) {
  const o = useOutlook();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { density } = usePreferences();
  const narrow = useMedia("(max-width: 1023px)");
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [dragW, setDragW] = useState<number | null>(null);
  const [bottomH, setBottomH] = useState(320);

  useShortcuts(mail);

  const onDrag = useCallback(
    (delta: number, done: boolean) => {
      const w = Math.max(300, Math.min(720, o.listWidth + delta));
      if (done) {
        setDragW(null);
        o.setLayout({ listWidth: w });
      } else setDragW(w);
    },
    [o],
  );

  const pane = o.readingPane;
  const listWidth = dragW ?? o.listWidth;
  const showList = !(
    pane === "off" &&
    (mail.openedItem || o.compose || mail.selected.size > 1)
  );
  const showReading =
    pane !== "off" ||
    !!mail.openedItem ||
    !!o.compose ||
    mail.selected.size > 1;
  const folderOverlay = narrow && o.folderPaneOpen;

  return (
    <div
      className={cn(
        "ol-mail",
        density === "compact" && "ol-compact",
        o.spacious && density !== "compact" && "ol-spacious",
      )}
    >
      <Ribbon
        mail={mail}
        onNewMail={() => o.openCompose(null)}
        onSnoozeCustom={() => setSnoozeOpen(true)}
      />
      <div className="ol-mail-body">
        {o.folderPaneOpen && (
          <>
            {folderOverlay && (
              <div
                className="ol-folder-scrim"
                onClick={() => o.setLayout({ folderPaneOpen: false })}
                aria-hidden
              />
            )}
            <aside
              className={cn(
                "ol-folder-pane",
                folderOverlay && "ol-folder-pane-over",
              )}
            >
              <FolderList
                stats={mail.list.stats}
                accountEmail={session?.user?.email ?? ""}
                current={{ folder: mail.folder, label: mail.label }}
                onSelect={(t) => {
                  mail.goFolder(t);
                  if (narrow) o.setLayout({ folderPaneOpen: false });
                }}
                onOutbox={() => navigate("/outbox")}
              />
            </aside>
          </>
        )}
        <div
          className={cn(
            "ol-panes",
            pane === "bottom" ? "flex-col" : "flex-row",
          )}
        >
          {showList && (
            <div
              className="ol-list-wrap"
              style={
                pane === "right"
                  ? { width: listWidth }
                  : pane === "bottom"
                    ? { height: bottomH }
                    : { flex: 1 }
              }
            >
              <MessageList mail={mail} />
            </div>
          )}
          {showList && pane === "right" && (
            <Splitter orientation="vertical" onDrag={onDrag} />
          )}
          {showList && pane === "bottom" && (
            <Splitter
              orientation="horizontal"
              onDrag={(d, done) => {
                if (done)
                  setBottomH((h) => Math.max(160, Math.min(640, h + d)));
              }}
            />
          )}
          {showReading && (
            <ReadingPane
              mail={mail}
              onSnoozeCustom={() => setSnoozeOpen(true)}
              onBack={
                pane === "off"
                  ? () => {
                      if (o.compose) o.closeCompose();
                      mail.clearSelection();
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
      <SnoozeDialog
        open={snoozeOpen}
        onOpenChange={setSnoozeOpen}
        onPick={(u) => mail.ops.snooze(mail.targets, u)}
      />
    </div>
  );
}
