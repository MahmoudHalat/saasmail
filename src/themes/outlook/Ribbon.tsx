import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  Ban,
  ChevronDown,
  Clock,
  Columns2,
  Forward,
  Inbox as InboxIcon,
  Keyboard,
  LayoutList,
  MailCheck,
  MailOpen,
  Menu as MenuIcon,
  MessagesSquare,
  MoreHorizontal,
  Palette,
  Pin,
  Reply,
  ReplyAll,
  Rows3,
  Settings,
  ShieldAlert,
  SquarePen,
  Trash2,
  Undo2,
  FolderInput,
  Mail,
} from "lucide-react";
import { usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { useOutlook } from "./context";
import type { OutlookMail } from "./useOutlookMail";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "./Menu";
import { SnoozeMenuItems } from "./Snooze";
import { sendConversationCommand } from "./Conversation";
import { FlagGlyph } from "./ui";

type Tab = "home" | "view" | "help";

interface RibbonItem {
  id: string;
  width: number;
  /** Rendered inline in the ribbon. */
  node: ReactNode;
  /** Rendered inside the overflow "…" menu when there is no room. */
  menu: ReactNode;
  separatorBefore?: boolean;
}

function RBtn({
  icon,
  label,
  onClick,
  disabled,
  pressed,
  hideLabel,
  title,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  hideLabel?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={cn("ol-rbtn", pressed && "ol-rbtn-on")}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={hideLabel ? label : undefined}
      title={title ?? label}
    >
      <span className="ol-rbtn-icon" aria-hidden>
        {icon}
      </span>
      {!hideLabel && <span>{label}</span>}
    </button>
  );
}

/** Ribbon button with a dropdown (chevron) menu. */
function RMenuBtn({
  icon,
  label,
  disabled,
  children,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Menu>
      <MenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="ol-rbtn"
          disabled={disabled}
          title={label}
        >
          <span className="ol-rbtn-icon" aria-hidden>
            {icon}
          </span>
          <span>{label}</span>
          <ChevronDown size={12} className="opacity-70" aria-hidden />
        </button>
      </MenuTrigger>
      <MenuContent align="start">{children}</MenuContent>
    </Menu>
  );
}

export default function Ribbon({
  mail,
  onNewMail,
  onSnoozeCustom,
}: {
  mail: OutlookMail;
  onNewMail: () => void;
  onSnoozeCustom: () => void;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const o = useOutlook();
  const { colorMode, density, setPreferences } = usePreferences();
  const t = mail.targets;
  const none = t.length === 0;
  const single = t.length === 1 && !!mail.openedItem;
  const allFlagged = !none && t.every((i) => i.starred);
  const allPinned = !none && t.every((i) => i.pinned);
  const anyUnread = t.some((i) => i.unreadCount > 0);
  const personTarget = t.length === 1 && t[0].type === "person" ? t[0] : null;

  const readingPaneMenu = (
    <MenuRadioGroup
      value={o.readingPane}
      onValueChange={(v) =>
        o.setLayout({ readingPane: v as typeof o.readingPane })
      }
    >
      <MenuRadioItem value="right">Show on the right</MenuRadioItem>
      <MenuRadioItem value="bottom">Show on the bottom</MenuRadioItem>
      <MenuRadioItem value="off">Hide</MenuRadioItem>
    </MenuRadioGroup>
  );
  const densityValue =
    density === "compact" ? "compact" : o.spacious ? "spacious" : "cozy";
  const densityMenu = (
    <MenuRadioGroup
      value={densityValue}
      onValueChange={(v) => {
        o.setLayout({ spacious: v === "spacious" });
        void setPreferences({
          density: v === "compact" ? "compact" : "comfortable",
        });
      }}
    >
      <MenuRadioItem value="spacious">Spacious</MenuRadioItem>
      <MenuRadioItem value="cozy">Cozy</MenuRadioItem>
      <MenuRadioItem value="compact">Compact</MenuRadioItem>
    </MenuRadioGroup>
  );
  const themeMenu = (
    <MenuRadioGroup
      value={colorMode}
      onValueChange={(v) =>
        void setPreferences({ colorMode: v as typeof colorMode })
      }
    >
      <MenuRadioItem value="light">Light</MenuRadioItem>
      <MenuRadioItem value="dark">Dark</MenuRadioItem>
      <MenuRadioItem value="system">Use system setting</MenuRadioItem>
    </MenuRadioGroup>
  );

  const home: RibbonItem[] = [
    {
      id: "delete",
      width: 82,
      separatorBefore: true,
      node: (
        <RBtn
          icon={<Trash2 size={18} />}
          label="Delete"
          disabled={none}
          onClick={() => void mail.ops.delete(t)}
        />
      ),
      menu: (
        <MenuItem
          icon={<Trash2 size={16} />}
          disabled={none}
          onSelect={() => void mail.ops.delete(t)}
        >
          Delete
        </MenuItem>
      ),
    },
    {
      id: "archive",
      width: 86,
      node: (
        <RBtn
          icon={<Archive size={18} />}
          label="Archive"
          disabled={none}
          onClick={() => mail.ops.archive(t)}
        />
      ),
      menu: (
        <MenuItem
          icon={<Archive size={16} />}
          disabled={none}
          onSelect={() => mail.ops.archive(t)}
        >
          Archive
        </MenuItem>
      ),
    },
    {
      id: "report",
      width: 92,
      node: (
        <RMenuBtn
          icon={<ShieldAlert size={18} />}
          label="Report"
          disabled={!personTarget}
        >
          <MenuItem
            icon={<Ban size={16} />}
            onSelect={() => personTarget && void mail.ops.block(personTarget)}
          >
            Block sender
          </MenuItem>
        </RMenuBtn>
      ),
      menu: (
        <MenuItem
          icon={<Ban size={16} />}
          disabled={!personTarget}
          onSelect={() => personTarget && void mail.ops.block(personTarget)}
        >
          Block sender
        </MenuItem>
      ),
    },
    {
      id: "move",
      width: 100,
      node: (
        <RMenuBtn
          icon={<FolderInput size={18} />}
          label="Move to"
          disabled={none}
        >
          <MenuItem
            icon={<InboxIcon size={16} />}
            onSelect={() => mail.ops.moveToInbox(t)}
          >
            Inbox
          </MenuItem>
          <MenuItem
            icon={<Archive size={16} />}
            onSelect={() => mail.ops.archive(t)}
          >
            Archive
          </MenuItem>
        </RMenuBtn>
      ),
      menu: (
        <MenuSub>
          <MenuSubTrigger icon={<FolderInput size={16} />}>
            Move to
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuItem
              icon={<InboxIcon size={16} />}
              disabled={none}
              onSelect={() => mail.ops.moveToInbox(t)}
            >
              Inbox
            </MenuItem>
            <MenuItem
              icon={<Archive size={16} />}
              disabled={none}
              onSelect={() => mail.ops.archive(t)}
            >
              Archive
            </MenuItem>
          </MenuSubContent>
        </MenuSub>
      ),
    },
    {
      id: "reply",
      width: 76,
      separatorBefore: true,
      node: (
        <RBtn
          icon={<Reply size={18} />}
          label="Reply"
          disabled={!single}
          onClick={() => sendConversationCommand("reply")}
        />
      ),
      menu: (
        <MenuItem
          icon={<Reply size={16} />}
          disabled={!single}
          onSelect={() => sendConversationCommand("reply")}
        >
          Reply
        </MenuItem>
      ),
    },
    {
      id: "replyAll",
      width: 94,
      node: (
        <RBtn
          icon={<ReplyAll size={18} />}
          label="Reply all"
          disabled={!single}
          onClick={() => sendConversationCommand("replyAll")}
        />
      ),
      menu: (
        <MenuItem
          icon={<ReplyAll size={16} />}
          disabled={!single}
          onSelect={() => sendConversationCommand("replyAll")}
        >
          Reply all
        </MenuItem>
      ),
    },
    {
      id: "forward",
      width: 90,
      node: (
        <RBtn
          icon={<Forward size={18} />}
          label="Forward"
          disabled={!single}
          onClick={() => sendConversationCommand("forward")}
        />
      ),
      menu: (
        <MenuItem
          icon={<Forward size={16} />}
          disabled={!single}
          onSelect={() => sendConversationCommand("forward")}
        >
          Forward
        </MenuItem>
      ),
    },
    {
      id: "read",
      width: 116,
      separatorBefore: true,
      node: (
        <RBtn
          icon={anyUnread ? <MailOpen size={18} /> : <Mail size={18} />}
          label={anyUnread ? "Read" : "Unread"}
          title={
            anyUnread ? "Mark as read (Ctrl+Q)" : "Mark as unread (Ctrl+U)"
          }
          disabled={none}
          onClick={() => mail.ops.toggleRead(t)}
        />
      ),
      menu: (
        <MenuItem
          icon={anyUnread ? <MailOpen size={16} /> : <Mail size={16} />}
          disabled={none}
          onSelect={() => mail.ops.toggleRead(t)}
        >
          {anyUnread ? "Mark as read" : "Mark as unread"}
        </MenuItem>
      ),
    },
    {
      id: "flag",
      width: 72,
      node: (
        <RBtn
          icon={<FlagGlyph size={18} filled={allFlagged} />}
          label={allFlagged ? "Unflag" : "Flag"}
          pressed={allFlagged}
          disabled={none}
          onClick={() => mail.ops.flag(t)}
        />
      ),
      menu: (
        <MenuItem
          icon={<FlagGlyph size={16} filled={allFlagged} />}
          disabled={none}
          onSelect={() => mail.ops.flag(t)}
        >
          {allFlagged ? "Unflag" : "Flag"}
        </MenuItem>
      ),
    },
    {
      id: "pin",
      width: 64,
      node: (
        <RBtn
          icon={
            <Pin size={18} className={allPinned ? "fill-current" : undefined} />
          }
          label={allPinned ? "Unpin" : "Pin"}
          pressed={allPinned}
          disabled={none}
          onClick={() => mail.ops.pin(t)}
        />
      ),
      menu: (
        <MenuItem
          icon={<Pin size={16} />}
          disabled={none}
          onSelect={() => mail.ops.pin(t)}
        >
          {allPinned ? "Unpin" : "Pin"}
        </MenuItem>
      ),
    },
    {
      id: "snooze",
      width: 96,
      node: (
        <RMenuBtn icon={<Clock size={18} />} label="Snooze" disabled={none}>
          <SnoozeMenuItems
            onPick={(u) => mail.ops.snooze(t, u)}
            onCustom={onSnoozeCustom}
          />
        </RMenuBtn>
      ),
      menu: (
        <MenuSub>
          <MenuSubTrigger icon={<Clock size={16} />}>Snooze</MenuSubTrigger>
          <MenuSubContent>
            <SnoozeMenuItems
              onPick={(u) => mail.ops.snooze(t, u)}
              onCustom={onSnoozeCustom}
            />
          </MenuSubContent>
        </MenuSub>
      ),
    },
    {
      id: "undo",
      width: 70,
      separatorBefore: true,
      node: (
        <RBtn
          icon={<Undo2 size={18} />}
          label="Undo"
          disabled={!mail.canUndo}
          onClick={() => void mail.undo()}
        />
      ),
      menu: (
        <MenuItem
          icon={<Undo2 size={16} />}
          disabled={!mail.canUndo}
          onSelect={() => void mail.undo()}
        >
          Undo
        </MenuItem>
      ),
    },
    {
      id: "allread",
      width: 140,
      node: (
        <RBtn
          icon={<MailCheck size={18} />}
          label="Mark all as read"
          onClick={() => mail.ops.markAllRead()}
        />
      ),
      menu: (
        <MenuItem
          icon={<MailCheck size={16} />}
          onSelect={() => mail.ops.markAllRead()}
        >
          Mark all as read
        </MenuItem>
      ),
    },
  ];

  const view: RibbonItem[] = [
    {
      id: "layout",
      width: 150,
      node: (
        <RMenuBtn icon={<Columns2 size={18} />} label="Reading pane">
          {readingPaneMenu}
        </RMenuBtn>
      ),
      menu: (
        <MenuSub>
          <MenuSubTrigger icon={<Columns2 size={16} />}>
            Reading pane
          </MenuSubTrigger>
          <MenuSubContent>{readingPaneMenu}</MenuSubContent>
        </MenuSub>
      ),
    },
    {
      id: "density",
      width: 104,
      node: (
        <RMenuBtn icon={<Rows3 size={18} />} label="Density">
          {densityMenu}
        </RMenuBtn>
      ),
      menu: (
        <MenuSub>
          <MenuSubTrigger icon={<Rows3 size={16} />}>Density</MenuSubTrigger>
          <MenuSubContent>{densityMenu}</MenuSubContent>
        </MenuSub>
      ),
    },
    {
      id: "theme",
      width: 96,
      node: (
        <RMenuBtn icon={<Palette size={18} />} label="Theme">
          {themeMenu}
        </RMenuBtn>
      ),
      menu: (
        <MenuSub>
          <MenuSubTrigger icon={<Palette size={16} />}>Theme</MenuSubTrigger>
          <MenuSubContent>{themeMenu}</MenuSubContent>
        </MenuSub>
      ),
    },
    {
      id: "conv",
      width: 150,
      node: (
        <RBtn
          icon={<MessagesSquare size={18} />}
          label="Conversation view"
          pressed={o.conversationView}
          onClick={() => o.setLayout({ conversationView: !o.conversationView })}
        />
      ),
      menu: (
        <MenuCheckboxItem
          checked={o.conversationView}
          onCheckedChange={(v) => o.setLayout({ conversationView: !!v })}
        >
          Conversation view
        </MenuCheckboxItem>
      ),
    },
    {
      id: "folderpane",
      width: 120,
      node: (
        <RBtn
          icon={<LayoutList size={18} />}
          label="Folder pane"
          pressed={o.folderPaneOpen}
          onClick={() => o.setLayout({ folderPaneOpen: !o.folderPaneOpen })}
        />
      ),
      menu: (
        <MenuCheckboxItem
          checked={o.folderPaneOpen}
          onCheckedChange={(v) => o.setLayout({ folderPaneOpen: !!v })}
        >
          Folder pane
        </MenuCheckboxItem>
      ),
    },
  ];

  const help: RibbonItem[] = [
    {
      id: "shortcuts",
      width: 160,
      node: (
        <RBtn
          icon={<Keyboard size={18} />}
          label="Keyboard shortcuts"
          onClick={() => o.setShortcutsOpen(true)}
        />
      ),
      menu: (
        <MenuItem
          icon={<Keyboard size={16} />}
          onSelect={() => o.setShortcutsOpen(true)}
        >
          Keyboard shortcuts
        </MenuItem>
      ),
    },
    {
      id: "settings",
      width: 96,
      node: (
        <RBtn
          icon={<Settings size={18} />}
          label="Settings"
          onClick={() => o.setSettingsOpen(true)}
        />
      ),
      menu: (
        <MenuItem
          icon={<Settings size={16} />}
          onSelect={() => o.setSettingsOpen(true)}
        >
          Settings
        </MenuItem>
      ),
    },
  ];

  const items = tab === "home" ? home : tab === "view" ? view : help;

  // Fit as many items as there is room for; the rest go in "…".
  const barRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(2000);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom(el.clientWidth));
    ro.observe(el);
    setRoom(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const newMailWidth = tab === "home" ? 132 : 0;
  let used = newMailWidth + 44;
  let fit = 0;
  for (const it of items) {
    const w = it.width + (it.separatorBefore ? 9 : 0);
    if (used + w > room) break;
    used += w;
    fit++;
  }
  const shown = items.slice(0, fit);
  const overflow = items.slice(fit);

  return (
    <div className="ol-ribbon" role="toolbar" aria-label="Ribbon">
      <div className="ol-ribbon-tabs" role="tablist">
        <button
          type="button"
          className="ol-icon-btn ol-icon-btn-sm mr-1"
          aria-label={
            o.folderPaneOpen ? "Hide navigation pane" : "Show navigation pane"
          }
          title={
            o.folderPaneOpen ? "Hide navigation pane" : "Show navigation pane"
          }
          aria-expanded={o.folderPaneOpen}
          onClick={() => o.setLayout({ folderPaneOpen: !o.folderPaneOpen })}
        >
          <MenuIcon size={18} />
        </button>
        {(["home", "view", "help"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn("ol-ribbon-tab", tab === id && "ol-ribbon-tab-on")}
            onClick={() => setTab(id)}
            data-ribbon-tab={id}
          >
            {id === "home" ? "Home" : id === "view" ? "View" : "Help"}
          </button>
        ))}
      </div>
      <div ref={barRef} className="ol-ribbon-bar">
        {tab === "home" && (
          <div className="ol-split">
            <button
              type="button"
              className="ol-split-main"
              onClick={onNewMail}
              title="New mail (Ctrl+N)"
              data-testid="ol-new-mail"
            >
              <SquarePen size={18} aria-hidden />
              New mail
            </button>
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="ol-split-chev"
                  aria-label="More new items"
                >
                  <ChevronDown size={14} />
                </button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuItem icon={<Mail size={16} />} onSelect={onNewMail}>
                  Mail
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        )}
        {shown.map((it) => (
          <span key={it.id} className="contents">
            {it.separatorBefore && (
              <span className="ol-ribbon-sep" aria-hidden />
            )}
            {it.node}
          </span>
        ))}
        {overflow.length > 0 && (
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="ol-rbtn"
                aria-label="More commands"
                title="More commands"
              >
                <MoreHorizontal size={18} />
              </button>
            </MenuTrigger>
            <MenuContent align="end">
              {overflow.map((it, i) => (
                <span key={it.id} className="contents">
                  {it.separatorBefore && i > 0 && <MenuSeparator />}
                  {it.menu}
                </span>
              ))}
            </MenuContent>
          </Menu>
        )}
      </div>
    </div>
  );
}
