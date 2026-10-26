import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Ban,
  Check,
  ChevronDown,
  Clock,
  Forward,
  Inbox as InboxIcon,
  ListFilter as ListFilterIcon,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Pin,
  Reply,
  ReplyAll,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { fetchGroupedPeople, type Email, type GroupedItem } from "@/lib/api";
import { itemKey, itemTitle } from "@/hooks/useMailList";
import { usePreferences } from "@/lib/preferences";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useOutlook } from "./context";
import Conversation, { sendConversationCommand } from "./Conversation";
import ComposeForm from "./ComposeForm";
import InlineReply, { type ReplyMode } from "./InlineReply";
import {
  Menu,
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
import { EmptyFolder, ShimmerRows, rowSubject } from "./MessageList";
import { SnoozeDialog, SnoozeMenuItems } from "./Snooze";
import {
  FILTER_LABELS,
  formatMobileTime,
  swipeOutcome,
  type ListFilter,
} from "./lib";
import { useConversation, useIdentities } from "./useConversation";
import type { OutlookMail } from "./useOutlookMail";
import { Avatar, FlagGlyph, IconButton } from "./ui";

// ── Swipeable row ────────────────────────────────────────────────────────

function MobileRow({
  item,
  mail,
  selecting,
  selected,
  onLongPress,
}: {
  item: GroupedItem;
  mail: OutlookMail;
  selecting: boolean;
  selected: boolean;
  onLongPress: (item: GroupedItem) => void;
}) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [animating, setAnimating] = useState(false);
  const g = useRef<{
    x: number;
    y: number;
    id: number;
    mode: "idle" | "swipe" | "scroll";
    moved: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    long: boolean;
  } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const unread = item.unreadCount > 0;
  const title = itemTitle(item);
  const width = rowRef.current?.clientWidth ?? 390;
  const outcome = swipeOutcome(dx, width);

  const end = () => {
    const s = g.current;
    if (s?.timer) clearTimeout(s.timer);
    g.current = null;
  };

  function finishSwipe(finalDx: number) {
    const out = swipeOutcome(finalDx, width);
    setAnimating(true);
    if (out === "archive") {
      setLeaving(true);
      setDx(width);
      setTimeout(() => {
        mail.ops.archive([item]);
      }, 180);
      return;
    }
    setDx(0);
    setTimeout(() => setAnimating(false), 200);
    if (out === "flag") {
      const v = !item.starred;
      mail.ops.flag([item], v);
      showToast({
        kind: "info",
        message: v ? "Flagged" : "Flag removed",
        action: {
          label: "Undo",
          onClick: (dismiss) => {
            dismiss();
            mail.ops.flag([item], !v);
          },
        },
      });
    }
  }

  return (
    <div
      className={cn("ol-m-swipe", leaving && "ol-m-swipe-leaving")}
      data-testid="ol-m-row"
      data-key={itemKey(item)}
    >
      {dx !== 0 && (
        <div
          className={cn(
            "ol-m-swipe-bg",
            dx > 0 ? "ol-m-swipe-archive" : "ol-m-swipe-flag",
            outcome && "ol-m-swipe-armed",
          )}
          aria-hidden
        >
          {dx > 0 ? (
            <span className="flex items-center gap-2">
              <Archive size={22} /> Archive
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-2">
              {item.starred ? "Unflag" : "Flag"}
              <FlagGlyph size={22} filled />
            </span>
          )}
        </div>
      )}
      <div
        ref={rowRef}
        role="option"
        aria-selected={selected}
        tabIndex={0}
        className={cn(
          "ol-m-row",
          unread && "ol-m-row-unread",
          selected && "ol-m-row-selected",
          animating && "ol-m-row-animate",
        )}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          const s = {
            x: e.clientX,
            y: e.clientY,
            id: e.pointerId,
            mode: "idle" as const,
            moved: false,
            long: false,
            timer: null as ReturnType<typeof setTimeout> | null,
          };
          s.timer = setTimeout(() => {
            if (g.current && !g.current.moved) {
              g.current.long = true;
              suppressClick.current = true;
              navigator.vibrate?.(10);
              onLongPress(item);
            }
          }, 480);
          g.current = s;
          setAnimating(false);
        }}
        onPointerMove={(e) => {
          const s = g.current;
          if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (s.mode === "idle") {
            if (Math.abs(mx) > 8 || Math.abs(my) > 8) {
              s.moved = true;
              if (s.timer) clearTimeout(s.timer);
            }
            if (
              !selecting &&
              Math.abs(mx) > 12 &&
              Math.abs(mx) > Math.abs(my) * 1.3
            ) {
              s.mode = "swipe";
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            } else if (Math.abs(my) > 10) {
              s.mode = "scroll";
            }
          }
          if (s.mode === "swipe") {
            e.preventDefault();
            setDx(mx);
          }
        }}
        onPointerUp={(e) => {
          const s = g.current;
          if (!s) return;
          if (s.mode === "swipe") {
            suppressClick.current = true;
            finishSwipe(e.clientX - s.x);
          }
          end();
        }}
        onPointerCancel={() => {
          if (g.current?.mode === "swipe") {
            setAnimating(true);
            setDx(0);
          }
          end();
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (selecting) mail.toggleChecked(item);
          else mail.openItem(item);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") mail.openItem(item);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className={cn("ol-m-dot", unread && "ol-m-dot-on")} aria-hidden />
        <div className="relative shrink-0">
          {selecting ? (
            <span
              className={cn("ol-m-check", selected && "ol-m-check-on")}
              aria-hidden
            >
              {selected && <Check size={18} strokeWidth={3} />}
            </span>
          ) : (
            <Avatar name={title} seed={title} size={40} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[16px] text-text-primary",
                unread ? "font-semibold" : "font-normal",
              )}
            >
              {title}
            </span>
            <span
              className={cn(
                "shrink-0 text-[13px]",
                unread ? "font-semibold text-accent" : "text-text-secondary",
              )}
            >
              {formatMobileTime(item.lastEmailAt)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[14px]",
                unread
                  ? "font-semibold text-text-primary"
                  : "text-text-primary",
              )}
            >
              {rowSubject(item)}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-text-secondary">
              {item.hasAttachment > 0 && (
                <Paperclip size={14} aria-label="Has attachments" />
              )}
              {item.pinned && (
                <Pin size={14} className="fill-current" aria-label="Pinned" />
              )}
              {item.starred && (
                <span className="text-star" aria-label="Flagged">
                  <FlagGlyph size={14} filled />
                </span>
              )}
            </span>
          </div>
          <p className="ol-m-preview">{item.snippet || " "}</p>
        </div>
      </div>
    </div>
  );
}

// ── Full-screen search ───────────────────────────────────────────────────

function MobileSearch({ mail }: { mail: OutlookMail }) {
  const o = useOutlook();
  const navigate = useNavigate();
  const [q, setQ] = useState(mail.q);
  const [hits, setHits] = useState<GroupedItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(
      () =>
        fetchGroupedPeople({
          folder: q.trim() ? "all" : "inbox",
          q: q.trim() || undefined,
          limit: 12,
        })
          .then((r) => !cancelled && setHits(r.data))
          .catch(() => {}),
      q.trim() ? 200 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="ol-m-sheet ol-m-search" role="dialog" aria-label="Search">
      <form
        className="ol-m-search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          o.setMobileSearchOpen(false);
          navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/");
        }}
      >
        <div className="ol-m-search-field">
          <Search size={18} aria-hidden className="text-text-secondary" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search mail and people"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-text-primary outline-none placeholder:text-text-secondary"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => setQ("")}
              className="text-text-secondary"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="ol-link text-[16px]"
          onClick={() => o.setMobileSearchOpen(false)}
        >
          Cancel
        </button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="ol-m-section-label">
          {q.trim() ? "Top results" : "Recent"}
        </div>
        {hits.map((h) => (
          <button
            key={itemKey(h)}
            type="button"
            className="ol-m-hit"
            onClick={() => {
              o.setMobileSearchOpen(false);
              navigate(`/?open=${h.type}:${encodeURIComponent(h.id)}`);
            }}
          >
            <Avatar name={itemTitle(h)} seed={itemTitle(h)} size={40} />
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[16px] text-text-primary">
                {itemTitle(h)}
              </span>
              <span className="block truncate text-[14px] text-text-secondary">
                {rowSubject(h)}
              </span>
            </span>
          </button>
        ))}
        {q.trim() && (
          <button
            type="submit"
            form=""
            className="ol-m-hit"
            onClick={() => {
              o.setMobileSearchOpen(false);
              navigate(`/?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <span className="flex h-10 w-10 items-center justify-center text-accent">
              <Search size={20} />
            </span>
            <span className="text-[16px] text-accent">
              See all results for “{q.trim()}”
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Full-screen conversation ─────────────────────────────────────────────

function MobileConversation({
  mail,
  item,
  onSnoozeCustom,
}: {
  mail: OutlookMail;
  item: GroupedItem;
  onSnoozeCustom: () => void;
}) {
  const o = useOutlook();
  const conv = useConversation(item, mail.label);
  const [replyState, setReplyState] = useState<{
    email: Email;
    mode: ReplyMode;
  } | null>(null);
  const { senderIdentities } = useIdentities();
  const subject = conv.emails[0]?.subject?.trim() || rowSubject(item);
  const unread = item.unreadCount > 0;
  const counterpart =
    item.type === "person"
      ? item.name
        ? `${item.name} <${item.email}>`
        : item.email
      : item.participants.map((p) => p.name || p.email).join(", ");
  const inbox =
    item.type === "person" ? (mail.label ?? item.recipients[0]) : item.inbox;
  const inboxName =
    senderIdentities.find((s) => s.email === inbox)?.displayName || inbox;

  useEffect(() => {
    if (item.unreadCount > 0) mail.ops.markRead([item]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.type, item.id]);

  const back = () => mail.openItem(null);

  return (
    <div className="ol-m-conv">
      <header className="ol-m-conv-head">
        <IconButton label="Back" size="lg" onClick={back}>
          <ArrowLeft size={22} />
        </IconButton>
        <div className="flex-1" />
        <IconButton
          label="Archive"
          size="lg"
          onClick={() => mail.ops.archive([item])}
        >
          <Archive size={21} />
        </IconButton>
        <IconButton
          label="Delete"
          size="lg"
          onClick={() => void mail.ops.delete([item])}
        >
          <Trash2 size={21} />
        </IconButton>
        <Menu>
          <MenuTrigger asChild>
            <IconButton label="More actions" size="lg">
              <MoreHorizontal size={22} />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="end" className="ol-menu-touch">
            <MenuItem
              icon={<FlagGlyph size={18} filled={item.starred} />}
              onSelect={() => mail.ops.flag([item])}
            >
              {item.starred ? "Unflag" : "Flag"}
            </MenuItem>
            <MenuItem
              icon={<Pin size={18} />}
              onSelect={() => mail.ops.pin([item])}
            >
              {item.pinned ? "Unpin" : "Pin"}
            </MenuItem>
            <MenuItem
              icon={unread ? <MailOpen size={18} /> : <Mail size={18} />}
              onSelect={() => {
                mail.ops.toggleRead([item]);
                if (!unread) back();
              }}
            >
              {unread ? "Mark as read" : "Mark as unread"}
            </MenuItem>
            <MenuSub>
              <MenuSubTrigger icon={<Clock size={18} />}>Snooze</MenuSubTrigger>
              <MenuSubContent className="ol-menu-touch">
                <SnoozeMenuItems
                  onPick={(u) => mail.ops.snooze([item], u)}
                  onCustom={onSnoozeCustom}
                />
              </MenuSubContent>
            </MenuSub>
            {(mail.folder === "archive" || item.snoozedUntil) && (
              <MenuItem
                icon={<InboxIcon size={18} />}
                onSelect={() => mail.ops.moveToInbox([item])}
              >
                Move to Inbox
              </MenuItem>
            )}
            {item.type === "person" && (
              <>
                <MenuSeparator />
                <MenuItem
                  icon={<Ban size={18} />}
                  onSelect={() => void mail.ops.block(item)}
                >
                  Block sender
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pb-2 pt-1">
          <h1 className="text-[22px] font-semibold leading-tight text-text-primary">
            {subject}
          </h1>
          {inbox && (
            <span className="ol-cat mt-2 inline-flex">{inboxName}</span>
          )}
        </div>
        <Conversation
          item={item}
          emails={conv.emails}
          setEmails={conv.setEmails}
          loading={conv.loading}
          error={conv.error}
          reload={() => void conv.reload(true)}
          conversationView={o.conversationView}
          onCompose={(p) => o.openCompose(p)}
          onBlock={() => void mail.ops.block(item)}
          variant="mobile"
          replyState={null}
          setReplyState={setReplyState}
        />
      </div>
      <div className="ol-m-replybar">
        <button
          type="button"
          className="ol-m-reply-pill"
          onClick={() => sendConversationCommand("reply")}
          disabled={conv.emails.length === 0}
        >
          <Reply size={18} aria-hidden /> Reply
        </button>
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              label="More reply options"
              size="lg"
              disabled={conv.emails.length === 0}
            >
              <ChevronDown size={20} />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="end" side="top" className="ol-menu-touch">
            <MenuItem
              icon={<ReplyAll size={18} />}
              onSelect={() => sendConversationCommand("replyAll")}
            >
              Reply all
            </MenuItem>
            <MenuItem
              icon={<Forward size={18} />}
              onSelect={() => sendConversationCommand("forward")}
            >
              Forward
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      {replyState && (
        <InlineReply
          key={`${replyState.email.id}:${replyState.mode}`}
          email={replyState.email}
          mode={replyState.mode}
          counterpart={counterpart}
          onClose={() => setReplyState(null)}
          onSent={() => void conv.reload(true)}
          variant="mobile"
        />
      )}
    </div>
  );
}

// ── Mobile mail ─────────────────────────────────────────────────────────

export default function MobileMail({ mail }: { mail: OutlookMail }) {
  const o = useOutlook();
  const { data: session } = useSession();
  const { density } = usePreferences();
  const { senderIdentities } = useIdentities();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const userName = session?.user?.name || session?.user?.email || "";
  const navigate = useNavigate();

  const item = mail.openedItem;
  const open = !!mail.openKey;
  const composing = !!o.compose;

  useEffect(() => {
    o.setHideTabBar(open || composing || selecting);
    return () => o.setHideTabBar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, composing, selecting]);

  useEffect(() => {
    if (selecting && mail.selected.size === 0) setSelecting(false);
  }, [selecting, mail.selected.size]);

  // Leaving selection mode clears it.
  const exitSelect = () => {
    setSelecting(false);
    mail.setSelected(new Set());
  };

  const pull = usePullToRefresh<HTMLDivElement>({
    onRefresh: () =>
      new Promise<void>((resolve) => {
        mail.list.refresh();
        setTimeout(resolve, 700);
      }),
  });

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !mail.hasMore) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) mail.loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [mail.hasMore, mail.loadMore, mail]);

  const title = mail.label
    ? senderIdentities.find((s) => s.email === mail.label)?.displayName ||
      mail.label
    : mail.folderTitle;
  const rows = mail.mobileItems;
  const selectedItems = useMemo(
    () => rows.filter((r) => mail.selected.has(itemKey(r))),
    [rows, mail.selected],
  );
  const anyUnread = selectedItems.some((i) => i.unreadCount > 0);
  const otherUnread = mail.focusSplit.other.filter(
    (i) => i.unreadCount > 0,
  ).length;

  const act = (fn: () => void) => {
    fn();
    exitSelect();
  };

  return (
    <div className={cn("ol-m-mail", density === "compact" && "ol-compact")}>
      {selecting ? (
        <header className="ol-m-header ol-m-header-select">
          <IconButton label="Cancel selection" size="lg" onClick={exitSelect}>
            <X size={22} />
          </IconButton>
          <h1 className="ol-m-title">{mail.selected.size} selected</h1>
          <button
            type="button"
            className="ol-link px-2 text-[15px]"
            onClick={() => mail.setSelected(new Set(rows.map(itemKey)))}
          >
            Select all
          </button>
        </header>
      ) : (
        <header className="ol-m-header">
          <button
            type="button"
            className="ol-m-avatar-btn"
            aria-label="Open folders and settings"
            onClick={() => o.setDrawerOpen(true)}
          >
            <Avatar name={userName} seed={userName} size={32} />
          </button>
          <h1 className="ol-m-title">{title}</h1>
          <IconButton
            label="Search"
            size="lg"
            className="ol-m-header-btn"
            onClick={() => o.setMobileSearchOpen(true)}
          >
            <Search size={22} />
          </IconButton>
        </header>
      )}

      <div className="ol-m-toolbar">
        {mail.q ? (
          <button
            type="button"
            className="ol-filter-chip"
            onClick={() => navigate("/")}
            aria-label="Clear search"
          >
            “{mail.q}” ×
          </button>
        ) : mail.showFocusTabs ? (
          <div className="ol-m-seg" role="tablist" aria-label="Focused inbox">
            {(["focused", "other"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={mail.focusTab === t}
                className={cn(
                  "ol-m-seg-btn",
                  mail.focusTab === t && "ol-m-seg-on",
                )}
                onClick={() => mail.setFocusTab(t)}
              >
                {t === "focused" ? "Focused" : "Other"}
                {t === "other" &&
                  otherUnread > 0 &&
                  mail.focusTab !== "other" && (
                    <span
                      className="ol-m-seg-dot"
                      aria-label={`${otherUnread} unread`}
                    />
                  )}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "ol-m-filter",
                mail.filter !== "all" && "ol-m-filter-on",
              )}
              aria-label={`Filter: ${FILTER_LABELS[mail.filter]}`}
            >
              <ListFilterIcon size={18} aria-hidden />
              {mail.filter === "all"
                ? "Filter"
                : mail.filter === "files"
                  ? "Attachments"
                  : FILTER_LABELS[mail.filter]}
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="ol-menu-touch">
            <MenuRadioGroup
              value={mail.filter}
              onValueChange={(v) => mail.setFilter(v as ListFilter)}
            >
              <MenuRadioItem value="all">All</MenuRadioItem>
              <MenuRadioItem value="unread">Unread</MenuRadioItem>
              <MenuRadioItem value="flagged">Flagged</MenuRadioItem>
              <MenuRadioItem value="files">Attachments</MenuRadioItem>
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
      </div>

      <div
        ref={pull.ref}
        className="ol-m-scroll"
        role="listbox"
        aria-label={title}
        aria-multiselectable={selecting}
      >
        {(pull.pullDistance > 0 || pull.refreshing) && (
          <div
            className="ol-m-ptr"
            style={{ height: pull.refreshing ? 48 : pull.pullDistance }}
          >
            <span
              className={cn(
                "ol-m-ptr-spin",
                pull.refreshing && "ol-m-ptr-spinning",
              )}
              style={{
                transform: `rotate(${pull.pullDistance * 3}deg)`,
                opacity: Math.min(1, pull.pullDistance / pull.threshold),
              }}
            />
          </div>
        )}
        {mail.list.loading && mail.allItems.length === 0 ? (
          <ShimmerRows mobile count={9} />
        ) : mail.list.error ? (
          <div className="ol-empty">
            <p className="text-[15px] text-text-secondary">{mail.list.error}</p>
            <button
              type="button"
              className="ol-btn-outline"
              onClick={mail.list.refresh}
            >
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyFolder
            title={
              mail.showFocusTabs && mail.focusTab === "other" ? "Other" : title
            }
            q={mail.q}
          />
        ) : (
          rows.map((it) => (
            <MobileRow
              key={itemKey(it)}
              item={it}
              mail={mail}
              selecting={selecting}
              selected={mail.selected.has(itemKey(it))}
              onLongPress={(row) => {
                setSelecting(true);
                mail.setSelected(new Set([itemKey(row)]));
              }}
            />
          ))
        )}
        {mail.hasMore && (
          <div ref={sentinel} className="flex justify-center py-4">
            <span
              className="ol-m-ptr-spin ol-m-ptr-spinning"
              aria-label="Loading more"
            />
          </div>
        )}
        <div className="h-24" aria-hidden />
      </div>

      {!selecting && !open && !composing && (
        <button
          type="button"
          className="ol-fab"
          aria-label="New mail"
          onClick={() => o.openCompose(null)}
          data-testid="ol-fab"
        >
          <PenLine size={24} />
        </button>
      )}

      {selecting && (
        <nav className="ol-m-actionbar" aria-label="Selection actions">
          <button
            type="button"
            disabled={!selectedItems.length}
            onClick={() => act(() => mail.ops.archive(selectedItems))}
          >
            <Archive size={22} aria-hidden />
            Archive
          </button>
          <button
            type="button"
            disabled={!selectedItems.length}
            onClick={() => act(() => void mail.ops.delete(selectedItems))}
          >
            <Trash2 size={22} aria-hidden />
            Delete
          </button>
          <button
            type="button"
            disabled={!selectedItems.length}
            onClick={() => act(() => mail.ops.toggleRead(selectedItems))}
          >
            {anyUnread ? (
              <MailOpen size={22} aria-hidden />
            ) : (
              <Mail size={22} aria-hidden />
            )}
            {anyUnread ? "Read" : "Unread"}
          </button>
          <button
            type="button"
            disabled={!selectedItems.length}
            onClick={() => act(() => mail.ops.flag(selectedItems))}
          >
            <FlagGlyph size={22} />
            Flag
          </button>
          <Menu>
            <MenuTrigger asChild>
              <button type="button" disabled={!selectedItems.length}>
                <MoreHorizontal size={22} aria-hidden />
                More
              </button>
            </MenuTrigger>
            <MenuContent side="top" align="end" className="ol-menu-touch">
              <MenuItem
                icon={<Pin size={18} />}
                onSelect={() => act(() => mail.ops.pin(selectedItems))}
              >
                Pin
              </MenuItem>
              <MenuSub>
                <MenuSubTrigger icon={<Clock size={18} />}>
                  Snooze
                </MenuSubTrigger>
                <MenuSubContent className="ol-menu-touch">
                  <SnoozeMenuItems
                    onPick={(u) => act(() => mail.ops.snooze(selectedItems, u))}
                    onCustom={() => setSnoozeOpen(true)}
                  />
                </MenuSubContent>
              </MenuSub>
              <MenuItem
                icon={<InboxIcon size={18} />}
                onSelect={() => act(() => mail.ops.moveToInbox(selectedItems))}
              >
                Move to Inbox
              </MenuItem>
            </MenuContent>
          </Menu>
        </nav>
      )}

      {open && item && (
        <MobileConversation
          mail={mail}
          item={item}
          onSnoozeCustom={() => setSnoozeOpen(true)}
        />
      )}
      {open && !item && (
        <div className="ol-m-conv">
          <header className="ol-m-conv-head">
            <IconButton
              label="Back"
              size="lg"
              onClick={() => mail.openItem(null)}
            >
              <ArrowLeft size={22} />
            </IconButton>
          </header>
          <ShimmerRows mobile count={3} />
        </div>
      )}
      {o.mobileSearchOpen && <MobileSearch mail={mail} />}
      {o.compose && (
        <ComposeForm
          key={o.compose.id}
          prefill={o.compose.prefill}
          onClose={o.closeCompose}
          variant="mobile"
        />
      )}
      <SnoozeDialog
        open={snoozeOpen}
        onOpenChange={setSnoozeOpen}
        onPick={(u) => {
          const t = selecting ? selectedItems : item ? [item] : [];
          mail.ops.snooze(t, u);
          exitSelect();
        }}
      />
    </div>
  );
}
