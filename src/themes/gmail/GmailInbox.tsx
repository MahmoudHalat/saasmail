import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { RotateCw } from "lucide-react";
import {
  EMPTY_MAIL_ROW_STATE,
  fetchConversationEmails,
  fetchPerson,
  fetchPersonEmails,
  markEmailRead,
  type Email,
  type GroupedItem,
} from "@/lib/api";
import { itemKey, MAIL_PAGE_SIZE, useMailList } from "@/hooks/useMailList";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSession } from "@/lib/auth-client";
import { useBranding } from "@/lib/branding";
import { usePreferences } from "@/lib/preferences";
import { showToast } from "@/lib/toast";
import type { ComposePrefill } from "@/pages/ComposeModal";
import { cn } from "@/lib/utils";
import "./gmail.css";
import {
  buildListSearch,
  FOLDER_LABELS,
  folderQuery,
  isTypingTarget,
  labelName,
  openParam,
  parseListState,
  parseOpen,
  rangeLabel,
  shortcutFor,
} from "./lib";
import { useGmailShell, useGmailView, useIsMobile } from "./state";
import type { ConversationHandle, RowActions } from "./actions";
import {
  ListToolbar,
  MailRow,
  SkeletonRows,
  type SelectPreset,
} from "./DesktopList";
import {
  ComposeFab,
  MobileRows,
  MobileSearchBar,
  MobileSelectionBar,
  MobileSkeleton,
  PullIndicator,
} from "./MobileList";
import Conversation from "./Conversation";
import { EmptyState } from "./Empty";
import { ConfirmDialog, PickDateDialog } from "./ui";

type Patch = Partial<
  Pick<
    GroupedItem,
    "starred" | "pinned" | "unreadCount" | "archivedAt" | "snoozedUntil"
  >
>;

function dedupe(list: GroupedItem[]): GroupedItem[] {
  const seen = new Set<string>();
  const out: GroupedItem[] = [];
  for (const it of list) {
    const k = itemKey(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

async function latestReceivedId(item: GroupedItem): Promise<string | null> {
  const emails: Email[] =
    item.type === "person"
      ? (await fetchPersonEmails(item.id, { limit: 50 })).emails
      : (await fetchConversationEmails(item.id)).emails;
  const received = emails
    .filter((e) => e.type === "received")
    .sort((a, b) => b.timestamp - a.timestamp);
  return received[0]?.id ?? null;
}

export default function GmailInbox() {
  const { onCompose } = useOutletContext<{
    onCompose: (prefill?: ComposePrefill) => void;
  }>();
  const shell = useGmailShell();
  const { setInboxMounted, reportStats, focusSearch, openShortcuts } = shell;
  const isMobile = useIsMobile();
  const view = useGmailView();
  const prefs = usePreferences();
  const { data: session } = useSession();
  const { brandName } = useBranding();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routeParams = useParams<{ inbox?: string; personId?: string }>();

  const state = parseListState(params);
  const fq = folderQuery(state);
  const serverQ = state.q || state.from;
  const clientFrom = state.q && state.from ? state.from.toLowerCase() : "";
  const list = useMailList({
    folder: fq.folder,
    recipient: state.label ?? undefined,
    q: serverQ || undefined,
    unread: state.unread || undefined,
    drafts: fq.drafts,
    sequenced: fq.sequenced,
  });
  const queryKey = `${fq.folder}|${state.label}|${serverQ}|${state.unread}|${fq.drafts}|${fq.sequenced}|${state.attachment}|${clientFrom}`;

  const pane = !isMobile && view.readingPane === "right";
  const density = prefs.density === "compact" ? "compact" : view.density;

  /* ── shell wiring ── */
  useEffect(() => {
    setInboxMounted(true);
    return () => setInboxMounted(false);
  }, [setInboxMounted]);
  useEffect(() => {
    if (list.stats) reportStats(list.stats);
  }, [list.stats, reportStats]);
  const stats = list.stats ?? shell.stats;
  const identities = stats?.senderIdentities ?? [];

  /* ── mobile infinite scroll: earlier pages kept here ── */
  const [earlier, setEarlier] = useState<GroupedItem[]>([]);
  useEffect(() => {
    setEarlier([]);
  }, [queryKey]);

  const filterClient = useCallback(
    (its: GroupedItem[]) =>
      its.filter((it) => {
        if (state.attachment && !(it.hasAttachment > 0)) return false;
        if (clientFrom) {
          const hay =
            it.type === "person"
              ? `${it.name ?? ""} ${it.email}`
              : it.participants
                  .map((p) => `${p.name ?? ""} ${p.email}`)
                  .join(" ");
          if (!hay.toLowerCase().includes(clientFrom)) return false;
        }
        return true;
      }),
    [state.attachment, clientFrom],
  );

  const displayed = useMemo(
    () =>
      filterClient(isMobile ? dedupe([...earlier, ...list.items]) : list.items),
    [filterClient, isMobile, earlier, list.items],
  );

  /* ── open conversation (URL) ── */
  const openRef =
    parseOpen(params.get("open")) ??
    (routeParams.personId
      ? { type: "person" as const, id: routeParams.personId }
      : null);
  const openKey = openRef ? `${openRef.type}:${openRef.id}` : null;
  const fromList = openKey
    ? (displayed.find((it) => itemKey(it) === openKey) ??
      list.items.find((it) => itemKey(it) === openKey) ??
      null)
    : null;
  const [fallback, setFallback] = useState<GroupedItem | null>(null);
  useEffect(() => {
    if (!openRef || fromList) return;
    if (fallback && itemKey(fallback) === openKey) return;
    let cancelled = false;
    (async () => {
      try {
        if (openRef.type === "person") {
          const p = await fetchPerson(openRef.id);
          if (cancelled) return;
          setFallback({
            ...EMPTY_MAIL_ROW_STATE,
            type: "person",
            id: p.id,
            email: p.email,
            name: p.name,
            lastEmailAt: p.lastEmailAt,
            unreadCount: p.unreadCount,
            totalCount: p.totalCount,
            recipientCount: 1,
            recipients: p.recipient ? [p.recipient] : [],
            hasAttachment: 0,
            latestSubject: p.latestSubject ?? null,
          });
        } else {
          const c = await fetchConversationEmails(openRef.id);
          if (cancelled) return;
          const last = c.emails.reduce<Email | null>(
            (a, e) => (!a || e.timestamp > a.timestamp ? e : a),
            null,
          );
          setFallback({
            ...EMPTY_MAIL_ROW_STATE,
            type: "group",
            id: c.conversation.id,
            inbox: c.conversation.inbox,
            participants: c.conversation.participants,
            ccParticipants: [],
            lastEmailAt: last?.timestamp ?? 0,
            unreadCount: c.emails.filter(
              (e) => e.type === "received" && e.isRead === 0,
            ).length,
            totalCount: c.emails.length,
            hasAttachment: 0,
            latestSubject: last?.subject ?? null,
          });
        }
      } catch {
        if (!cancelled) {
          showToast({ kind: "error", message: "Conversation not found" });
          navigate(`/${buildListSearch(state)}`, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, !!fromList]);
  const openItem =
    fromList ?? (fallback && itemKey(fallback) === openKey ? fallback : null);

  const listUrl = useCallback(
    (extra?: { open?: string }) => {
      const base = buildListSearch(state);
      if (!extra?.open) return `/${base}`;
      const p = new URLSearchParams(base);
      p.set("open", extra.open);
      return `/?${p.toString()}`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.toString()],
  );

  const open = useCallback(
    (item: GroupedItem, opts?: { replace?: boolean }) => {
      setFocusedKey(itemKey(item));
      navigate(listUrl({ open: openParam(item) }), { replace: opts?.replace });
    },
    [navigate, listUrl],
  );
  const back = useCallback(() => {
    navigate(listUrl());
  }, [navigate, listUrl]);

  /* ── selection & keyboard cursor ── */
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  // The row cursor only shows once the keyboard is used, like Gmail.
  const [kbdNav, setKbdNav] = useState(false);
  const anchorRef = useRef<number | null>(null);
  useEffect(() => {
    setSelectedKeys(new Set());
    anchorRef.current = null;
  }, [queryKey, list.page]);
  const selected = displayed.filter((it) => selectedKeys.has(itemKey(it)));
  const focusedIndex = Math.max(
    0,
    displayed.findIndex((it) => itemKey(it) === focusedKey),
  );
  const focused = displayed[focusedIndex] ?? null;

  const toggleSelect = useCallback(
    (item: GroupedItem, range = false) => {
      const idx = displayed.findIndex((it) => itemKey(it) === itemKey(item));
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        const k = itemKey(item);
        if (range && anchorRef.current !== null && idx >= 0) {
          const [a, b] = [anchorRef.current, idx].sort((x, y) => x - y);
          const on = !prev.has(k);
          for (let i = a; i <= b; i++) {
            const key = itemKey(displayed[i]);
            if (on) next.add(key);
            else next.delete(key);
          }
        } else if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      });
      anchorRef.current = idx;
    },
    [displayed],
  );

  const selectPreset = (p: SelectPreset) => {
    const pick = (f: (it: GroupedItem) => boolean) =>
      setSelectedKeys(new Set(displayed.filter(f).map(itemKey)));
    switch (p) {
      case "all":
        return pick(() => true);
      case "none":
        return setSelectedKeys(new Set());
      case "read":
        return pick((it) => it.unreadCount === 0);
      case "unread":
        return pick((it) => it.unreadCount > 0);
      case "starred":
        return pick((it) => it.starred);
      case "unstarred":
        return pick((it) => !it.starred);
    }
  };

  /* ── dialogs ── */
  const [confirm, setConfirm] = useState<{
    items: GroupedItem[];
    after?: () => void;
  } | null>(null);
  const [pick, setPick] = useState<{
    items: GroupedItem[];
    presets: boolean;
    after?: () => void;
  } | null>(null);

  /* ── actions ── */
  const patchLocal = (targets: GroupedItem[], patch: Patch | "remove") => {
    const keys = new Set(targets.map(itemKey));
    setEarlier((prev) =>
      patch === "remove"
        ? prev.filter((it) => !keys.has(itemKey(it)))
        : prev.map((it) =>
            keys.has(itemKey(it)) ? ({ ...it, ...patch } as GroupedItem) : it,
          ),
    );
    setFallback((f) =>
      f && keys.has(itemKey(f)) && patch !== "remove"
        ? ({ ...f, ...patch } as GroupedItem)
        : f,
    );
    if (patch === "remove") {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      });
    }
  };

  const leavesView = (patch: { archived?: boolean; snoozed?: boolean }) => {
    if (state.folder === "inbox") return true;
    if (state.folder === "archive" && patch.archived === false) return true;
    if (state.folder === "snoozed" && patch.snoozed === false) return true;
    return false;
  };

  const leaveIfOpen = (targets: GroupedItem[]) => {
    if (!openKey) return;
    if (targets.some((t) => itemKey(t) === openKey)) back();
  };

  const act: RowActions = {
    archive: (its) => {
      void list.actions.archive(its);
      patchLocal(
        its,
        leavesView({ archived: true })
          ? "remove"
          : { archivedAt: Math.floor(Date.now() / 1000) },
      );
      leaveIfOpen(its);
    },
    moveToInbox: (its) => {
      const archived = its.filter((i) => i.archivedAt);
      const snoozed = its.filter((i) => i.snoozedUntil);
      if (archived.length) void list.actions.unarchive(archived);
      if (snoozed.length) void list.actions.unsnooze(snoozed);
      if (!archived.length && !snoozed.length && state.folder === "archive")
        void list.actions.unarchive(its);
      patchLocal(
        its,
        state.folder === "archive" || state.folder === "snoozed"
          ? "remove"
          : { archivedAt: null, snoozedUntil: null },
      );
      if (state.folder === "archive" || state.folder === "snoozed")
        leaveIfOpen(its);
    },
    requestDelete: (its, after) => {
      if (!its.some((i) => i.type === "person")) {
        showToast({
          kind: "info",
          message:
            "Group conversations can't be deleted. Archive them instead.",
        });
        return;
      }
      setConfirm({ items: its, after });
    },
    markRead: (its) => {
      const unread = its.filter((i) => i.unreadCount > 0);
      if (!unread.length) return;
      void list.actions.markRead(unread);
      patchLocal(unread, { unreadCount: 0 });
    },
    markUnread: async (its) => {
      try {
        const ids = await Promise.all(its.map(latestReceivedId));
        await Promise.all(
          ids
            .filter((x): x is string => !!x)
            .map((id) => markEmailRead(id, false)),
        );
        patchLocal(its, { unreadCount: 1 });
        showToast({
          kind: "info",
          message:
            its.length === 1
              ? "Conversation marked as unread"
              : `${its.length} conversations marked as unread`,
        });
        list.refresh();
      } catch (e) {
        showToast({
          kind: "error",
          message: e instanceof Error ? e.message : "Could not mark unread",
        });
      }
    },
    snooze: (its, until) => {
      void list.actions.snooze(its, until);
      patchLocal(
        its,
        leavesView({ snoozed: true }) ? "remove" : { snoozedUntil: until },
      );
      leaveIfOpen(its);
    },
    pickSnooze: (its, after) =>
      setPick({ items: its, presets: isMobile, after }),
    star: (its, value) => {
      const v = value ?? !its.every((t) => t.starred);
      void list.actions.toggleStar(its, v);
      patchLocal(
        its,
        state.folder === "starred" && !v ? "remove" : { starred: v },
      );
    },
    pin: (its, value) => {
      const v = value ?? !its.every((t) => t.pinned);
      void list.actions.togglePin(its, v);
      patchLocal(its, { pinned: v });
      showToast({
        kind: "info",
        message: v
          ? its.length === 1
            ? "Pinned to the top of your inbox"
            : `${its.length} conversations pinned`
          : "Unpinned",
      });
    },
  };

  /* ── conversation navigation ── */
  const openIndex = openItem
    ? displayed.findIndex((it) => itemKey(it) === itemKey(openItem))
    : -1;
  const goAdjacent = (delta: number) => {
    const target = displayed[openIndex + delta];
    if (target) open(target, { replace: true });
  };

  const convHandle = useRef<ConversationHandle | null>(null);

  /* ── keyboard shortcuts ── */
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const keyState = useRef({
    displayed,
    focused,
    focusedIndex,
    openItem,
    selected,
    pane,
    kbdNav,
  });
  keyState.current = {
    displayed,
    focused,
    focusedIndex,
    openItem,
    selected,
    pane,
    kbdNav,
  };
  const actRef = useRef(act);
  actRef.current = act;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="menu"], [data-testid="gmail-quick-settings"], [data-testid="gmail-drawer"]',
        )
      )
        return;
      const s = keyState.current;
      const a = actRef.current;
      if (e.key === "Escape" && s.selected.length) {
        setSelectedKeys(new Set());
        return;
      }
      const cmd = shortcutFor(e);
      if (!cmd) return;
      const targets = s.openItem
        ? [s.openItem]
        : s.selected.length
          ? s.selected
          : s.focused
            ? [s.focused]
            : [];
      const moveFocus = (delta: number) => {
        const i = Math.min(
          s.displayed.length - 1,
          Math.max(
            0,
            (s.kbdNav || s.pane ? s.focusedIndex : delta > 0 ? -1 : 1) + delta,
          ),
        );
        const it = s.displayed[i];
        if (!it) return;
        setKbdNav(true);
        setFocusedKey(itemKey(it));
        if (s.pane) open(it, { replace: true });
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(
            `[data-key="${CSS.escape(itemKey(it))}"]`,
          );
          el?.scrollIntoView({ block: "nearest" });
          el?.focus({ preventScroll: true });
        });
      };
      let handled = true;
      switch (cmd) {
        case "compose":
          onCompose();
          break;
        case "search":
          if (isMobile) mobileSearchRef.current?.focus();
          else focusSearch();
          break;
        case "help":
          openShortcuts();
          break;
        case "next":
          if (s.openItem && !s.pane) goAdjacent(1);
          else moveFocus(1);
          break;
        case "prev":
          if (s.openItem && !s.pane) goAdjacent(-1);
          else moveFocus(-1);
          break;
        case "open":
          if (s.focused && !s.openItem) open(s.focused);
          else handled = false;
          break;
        case "back":
          if (s.openItem) back();
          break;
        case "select":
          if (s.focused) toggleSelect(s.focused);
          break;
        case "archive":
          if (targets.length) a.archive(targets);
          break;
        case "star":
          if (targets.length) a.star(targets);
          break;
        case "delete":
          if (targets.length) a.requestDelete(targets);
          break;
        case "markRead":
          if (targets.length) a.markRead(targets);
          break;
        case "markUnread":
          if (targets.length)
            void a.markUnread(targets).then(() => s.openItem && back());
          break;
        case "snooze":
          if (targets.length) setPick({ items: targets, presets: true });
          break;
        case "reply":
          convHandle.current?.reply();
          handled = !!s.openItem;
          break;
        case "replyAll":
          convHandle.current?.replyAll();
          handled = !!s.openItem;
          break;
        case "forward":
          convHandle.current?.forward();
          handled = !!s.openItem;
          break;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMobile,
    onCompose,
    focusSearch,
    openShortcuts,
    open,
    back,
    toggleSelect,
  ]);

  /* ── document title ── */
  const unreadTotal = stats?.unreadCount ?? 0;
  const folderName =
    state.q || state.from
      ? "Search results"
      : state.label
        ? labelName(
            state.label,
            identities.find((s) => s.email === state.label)?.displayName,
          )
        : FOLDER_LABELS[state.folder];
  useEffect(() => {
    const who = session?.user?.email ? ` - ${session.user.email}` : "";
    const count =
      state.folder === "inbox" && unreadTotal > 0 ? ` (${unreadTotal})` : "";
    document.title = `${folderName}${count}${who} - ${brandName}`;
  }, [folderName, unreadTotal, session?.user?.email, brandName, state.folder]);

  /* ── mobile: search, scroll, pull, infinite ── */
  const [mSearch, setMSearch] = useState(state.q);
  useEffect(() => setMSearch(state.q || state.from), [state.q, state.from]);
  const [fabExtended, setFabExtended] = useState(true);
  const lastScroll = useRef(0);
  const onListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    if (st > lastScroll.current + 6) setFabExtended(false);
    else if (st < lastScroll.current - 6 || st < 8) setFabExtended(true);
    lastScroll.current = st;
  };

  const doRefresh = useCallback(() => {
    setEarlier([]);
    if (list.page !== 1) list.setPage(1);
    else list.refresh();
    return new Promise<void>((r) => setTimeout(r, 700));
  }, [list]);

  const pull = usePullToRefresh<HTMLDivElement>({
    onRefresh:
      isMobile && !openItem && selectedKeys.size === 0 ? doRefresh : undefined,
  });

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMore = isMobile && list.loading && earlier.length > 0;
  useEffect(() => {
    if (!isMobile || openItem) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (list.loading || list.page >= list.pageCount) return;
        setEarlier((prev) => dedupe([...prev, ...list.items]));
        list.setPage(list.page + 1);
      },
      { root: pull.ref.current, rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isMobile, openItem, list, pull.ref]);

  /* ── shared bits ── */
  const showLabels = !state.label && labelsCount(stats) > 1;
  const initialLoading =
    list.loading && list.items.length === 0 && earlier.length === 0;

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!confirm}
        title={
          confirm && confirm.items.length > 1
            ? `Delete ${confirm.items.filter((i) => i.type === "person").length} conversations forever?`
            : "Delete forever?"
        }
        body={
          "This permanently deletes the conversation and every message and attachment in it. There is no trash, so this can't be undone." +
          (confirm?.items.some((i) => i.type === "group")
            ? " Group conversations in the selection are skipped."
            : "")
        }
        confirmLabel="Delete forever"
        onConfirm={() => {
          if (!confirm) return;
          const people = confirm.items.filter((i) => i.type === "person");
          void list.actions.deleteForever(people);
          patchLocal(people, "remove");
          leaveIfOpen(people);
          confirm.after?.();
        }}
        onClose={() => setConfirm(null)}
      />
      <PickDateDialog
        open={!!pick}
        presets={pick?.presets}
        onClose={() => setPick(null)}
        onPick={(until) => {
          if (!pick) return;
          act.snooze(pick.items, until);
          pick.after?.();
        }}
      />
    </>
  );

  const listBody = (narrow: boolean) => {
    if (list.error && list.items.length === 0)
      return (
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <p className="text-sm text-text-secondary">
            Couldn't load your mail. {list.error}
          </p>
          <button
            type="button"
            className="gm-pill-btn"
            onClick={() => list.refresh()}
          >
            <RotateCw size={18} /> Try again
          </button>
        </div>
      );
    if (initialLoading) return isMobile ? <MobileSkeleton /> : <SkeletonRows />;
    if (displayed.length === 0)
      return <EmptyState state={state} onCompose={() => onCompose()} />;
    if (isMobile)
      return (
        <MobileRows
          items={displayed}
          folder={state.folder}
          selectedKeys={selectedKeys}
          act={act}
          onOpen={open}
          onToggleSelect={(it) => toggleSelect(it)}
        />
      );
    return (
      <div role="grid" aria-label={folderName} aria-rowcount={displayed.length}>
        {displayed.map((it) => (
          <MailRow
            key={itemKey(it)}
            item={it}
            folder={state.folder}
            selected={selectedKeys.has(itemKey(it))}
            focused={
              (kbdNav && focused ? itemKey(focused) === itemKey(it) : false) ||
              (pane && openKey === itemKey(it))
            }
            showLabels={showLabels}
            identities={identities}
            act={act}
            onOpen={open}
            onToggleSelect={toggleSelect}
            onFocus={(x) => setFocusedKey(itemKey(x))}
            narrow={narrow}
          />
        ))}
      </div>
    );
  };

  const position =
    openItem && openIndex >= 0
      ? {
          index: (list.page - 1) * MAIL_PAGE_SIZE + openIndex + 1,
          total: list.total,
        }
      : undefined;

  const conversation = (mobile: boolean, inPane: boolean) =>
    openItem ? (
      <Conversation
        key={itemKey(openItem)}
        item={openItem}
        stats={stats}
        act={act}
        onBack={back}
        onCompose={onCompose}
        position={position}
        onPrev={openIndex > 0 ? () => goAdjacent(-1) : undefined}
        onNext={
          openIndex >= 0 && openIndex < displayed.length - 1
            ? () => goAdjacent(1)
            : undefined
        }
        mobile={mobile}
        pane={inPane}
        handleRef={convHandle}
        onChanged={list.refresh}
        focusMessageId={
          location.hash.startsWith("#m=") ? location.hash.slice(3) : null
        }
      />
    ) : null;

  /* ── mobile ── */
  if (isMobile) {
    if (openItem || openRef) {
      return (
        <div className="gm-m-screen flex min-h-0 flex-1 flex-col">
          {conversation(true, false) ?? (
            <div className="flex flex-1 items-center justify-center">
              <span className="gm-skel h-10 w-10 rounded-full" />
            </div>
          )}
          {dialogs}
        </div>
      );
    }
    const searching = !!(state.q || state.from);
    return (
      <div
        className="gm-m-screen relative flex min-h-0 flex-1 flex-col"
        data-testid="gmail-mobile-list"
      >
        <div className="flex-none pt-[calc(8px+env(safe-area-inset-top))]">
          {selected.length > 0 ? (
            <MobileSelectionBar
              selected={selected}
              folder={state.folder}
              act={act}
              onClear={() => setSelectedKeys(new Set())}
            />
          ) : (
            <div className="pb-1">
              <MobileSearchBar
                value={mSearch}
                onChange={setMSearch}
                inputRef={mobileSearchRef}
                searching={searching}
                onSubmit={() => {
                  const q = mSearch.trim();
                  navigate(
                    q ? `/${buildListSearch({ folder: "all", q })}` : "/",
                  );
                }}
                onClear={() => {
                  setMSearch("");
                  if (searching) navigate("/");
                }}
                onMenu={shell.openDrawer}
                onAccount={shell.openAccount}
              />
            </div>
          )}
        </div>
        <div
          ref={pull.ref}
          onScroll={onListScroll}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <PullIndicator
            distance={pull.pullDistance}
            refreshing={pull.refreshing}
            threshold={pull.threshold}
          />
          <div
            style={{
              transform: pull.pullDistance
                ? `translateY(${Math.min(pull.pullDistance, 90) * 0.5}px)`
                : undefined,
            }}
          >
            <p className="px-4 pb-1 pt-3 text-sm font-medium text-text-secondary">
              {folderName}
            </p>
            {listBody(false)}
            <div ref={sentinelRef} className="h-px" />
            {loadingMore && (
              <div className="flex justify-center py-4">
                <RotateCw size={20} className="animate-spin text-accent" />
              </div>
            )}
            {!list.loading &&
              list.page >= list.pageCount &&
              displayed.length > 8 && (
                <p className="py-6 text-center text-xs text-text-tertiary">
                  That's everything in {folderName}
                </p>
              )}
            <div className="h-24" />
          </div>
        </div>
        {selected.length === 0 && (
          <ComposeFab extended={fabExtended} onClick={() => onCompose()} />
        )}
        {dialogs}
      </div>
    );
  }

  /* ── desktop ── */
  const toolbar = (
    <ListToolbar
      items={displayed}
      selected={selected}
      folder={state.folder}
      act={act}
      onSelectPreset={selectPreset}
      onRefresh={() => list.refresh()}
      onMarkAllRead={() => act.markRead(displayed)}
      range={rangeLabel(list.page, MAIL_PAGE_SIZE, list.total)}
      canPrev={list.page > 1}
      canNext={list.page < list.pageCount}
      onPrev={() => list.setPage(list.page - 1)}
      onNext={() => list.setPage(list.page + 1)}
    />
  );

  const listPanel = (narrow: boolean) => (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {toolbar}
      <div
        ref={listScrollRef}
        className={cn(
          "gm-list min-h-0 flex-1 overflow-y-auto border-t border-border",
        )}
        data-density={density}
      >
        {listBody(narrow)}
        {displayed.length > 0 && (
          <p className="py-6 text-center text-xs text-text-tertiary">
            {list.total.toLocaleString()} conversation
            {list.total === 1 ? "" : "s"}
            {" · "}
            <button
              type="button"
              className="hover:underline"
              onClick={openShortcuts}
            >
              Keyboard shortcuts
            </button>
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-card"
      data-testid="gmail-inbox"
    >
      {pane ? (
        <>
          <div className="flex min-h-0 w-[46%] min-w-[380px] flex-none flex-col border-r border-border">
            {listPanel(true)}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {conversation(false, true) ?? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-tertiary">
                <span className="text-sm">No conversation selected</span>
              </div>
            )}
          </div>
        </>
      ) : openItem || openRef ? (
        (conversation(false, false) ?? (
          <div className="flex flex-1 items-center justify-center">
            <span className="gm-skel h-10 w-10 rounded-full" />
          </div>
        ))
      ) : (
        listPanel(false)
      )}
      {dialogs}
    </div>
  );
}

function labelsCount(
  stats: { senderIdentities?: unknown[]; recipients?: unknown[] } | null,
) {
  if (!stats) return 0;
  return Math.max(
    stats.senderIdentities?.length ?? 0,
    stats.recipients?.length ?? 0,
  );
}
