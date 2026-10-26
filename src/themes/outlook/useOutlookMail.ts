import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  EMPTY_MAIL_ROW_STATE,
  addBlock,
  fetchConversationEmails,
  fetchPerson,
  fetchPersonEmails,
  markEmailRead,
  updateMailState,
  type GroupedItem,
} from "@/lib/api";
import {
  itemKey,
  itemRef,
  itemTitle,
  useMailList,
  type MailListQuery,
} from "@/hooks/useMailList";
import { showToast } from "@/lib/toast";
import {
  FOLDER_LABELS,
  applyFilter,
  folderQuery,
  groupRows,
  parseFolder,
  rangeKeys,
  splitFocused,
  type ListFilter,
  type ListSort,
  type OlFolderId,
} from "./lib";
import { folderHref, type FolderTarget } from "./FolderList";

type Patch = {
  starred?: boolean;
  pinned?: boolean;
  archived?: boolean;
  snoozedUntil?: number | null;
};

export type FocusTab = "focused" | "other";

function parseOpen(
  raw: string | null,
): { type: "person" | "group"; id: string } | null {
  if (!raw) return null;
  const i = raw.indexOf(":");
  if (i < 0) return null;
  const type = raw.slice(0, i);
  const id = raw.slice(i + 1);
  if ((type !== "person" && type !== "group") || !id) return null;
  return { type, id };
}

/**
 * Everything the Outlook inbox needs, desktop and mobile alike: folder and
 * search state from the URL, the list (with "load more" accumulation and
 * client filters), selection, and mail actions with a one-step Undo.
 */
export function useOutlookMail() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const routeParams = useParams<{ inbox?: string; personId?: string }>();

  const folder: OlFolderId = parseFolder(params.get("folder"));
  const label = params.get("label") || undefined;
  const q = params.get("q") || "";
  const scopeCurrent = params.get("scope") === "current";
  const openParam =
    parseOpen(params.get("open")) ??
    (routeParams.personId
      ? { type: "person" as const, id: routeParams.personId }
      : null);
  const openKey = openParam ? `${openParam.type}:${openParam.id}` : null;

  const [filter, setFilter] = useState<ListFilter>("all");
  const [sort, setSort] = useState<ListSort>("date");
  const [focusTab, setFocusTab] = useState<FocusTab>(() => {
    try {
      return window.sessionStorage.getItem("saasmail.outlook.focus") === "other"
        ? "other"
        : "focused";
    } catch {
      return "focused";
    }
  });
  useEffect(() => {
    try {
      window.sessionStorage.setItem("saasmail.outlook.focus", focusTab);
    } catch {
      /* ignore */
    }
  }, [focusTab]);

  const query: MailListQuery = useMemo(() => {
    const base =
      q && !scopeCurrent ? { folder: "all" as const } : folderQuery(folder);
    return {
      ...base,
      recipient: label,
      q: q || undefined,
      unread: filter === "unread" || undefined,
    };
  }, [folder, label, q, scopeCurrent, filter]);

  const list = useMailList(query);

  // ── "Load more": keep earlier pages, patched locally ──────────────────
  const [earlier, setEarlier] = useState<GroupedItem[]>([]);
  const queryKey = JSON.stringify(query);
  useEffect(() => setEarlier([]), [queryKey]);

  const allItems = useMemo(() => {
    const seen = new Set<string>();
    const out: GroupedItem[] = [];
    for (const it of [...earlier, ...list.items]) {
      const k = itemKey(it);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    return out;
  }, [earlier, list.items]);

  const hasMore = list.page < list.pageCount;
  const loadMore = useCallback(() => {
    if (list.loading || list.page >= list.pageCount) return;
    setEarlier(allItems);
    list.setPage(list.page + 1);
  }, [list, allItems]);

  const patchEarlier = useCallback(
    (
      targets: GroupedItem[],
      patch: Patch & { unreadCount?: number },
      remove: boolean,
    ) => {
      const keys = new Set(targets.map(itemKey));
      setEarlier((prev) => {
        const next = prev.map((it) =>
          keys.has(itemKey(it))
            ? {
                ...it,
                ...(patch.starred !== undefined && { starred: patch.starred }),
                ...(patch.pinned !== undefined && { pinned: patch.pinned }),
                ...(patch.unreadCount !== undefined && {
                  unreadCount: patch.unreadCount,
                }),
              }
            : it,
        );
        return remove ? next.filter((it) => !keys.has(itemKey(it))) : next;
      });
    },
    [],
  );

  // ── Filters, Focused/Other, grouping ──────────────────────────────────
  const showFocusTabs = folder === "inbox" && !q;
  const filtered = useMemo(
    () => applyFilter(allItems, filter),
    [allItems, filter],
  );
  const focusSplit = useMemo(() => splitFocused(filtered), [filtered]);
  const mobileItems = showFocusTabs
    ? focusTab === "focused"
      ? focusSplit.focused
      : focusSplit.other
    : filtered;

  const groups = useMemo(
    () => groupRows(filtered, sort, itemTitle, new Date(), folder === "inbox"),
    [filtered, sort, folder],
  );
  const order = useMemo(
    () => groups.flatMap((g) => g.items.map(itemKey)),
    [groups],
  );

  // ── Selection ─────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(openKey ? [openKey] : []),
  );
  const [checkMode, setCheckMode] = useState(false);
  const anchorRef = useRef<string | null>(openKey);

  useEffect(() => {
    if (openKey) {
      setSelected(new Set([openKey]));
      anchorRef.current = openKey;
    }
  }, [openKey]);

  // Drop selection on folder change.
  useEffect(() => {
    setSelected(new Set());
    setCheckMode(false);
  }, [folder, label, q]);

  const byKey = useMemo(() => {
    const m = new Map<string, GroupedItem>();
    for (const it of allItems) m.set(itemKey(it), it);
    return m;
  }, [allItems]);

  // Opened row that is not in the loaded list (deep link, search pick).
  const [fallback, setFallback] = useState<GroupedItem | null>(null);
  useEffect(() => {
    if (!openParam || byKey.has(openKey!)) return;
    if (fallback && itemKey(fallback) === openKey) return;
    let cancelled = false;
    if (openParam.type === "person") {
      fetchPerson(openParam.id)
        .then((p) => {
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
            recipients: [],
            hasAttachment: 0,
            latestSubject: p.latestSubject ?? null,
          });
        })
        .catch(() => {});
    } else {
      fetchConversationEmails(openParam.id)
        .then((c) => {
          if (cancelled) return;
          const last = c.emails[c.emails.length - 1];
          setFallback({
            ...EMPTY_MAIL_ROW_STATE,
            type: "group",
            id: c.conversation.id,
            inbox: c.conversation.inbox,
            participants: c.conversation.participants,
            ccParticipants: [],
            lastEmailAt: last?.timestamp ?? 0,
            unreadCount: 0,
            totalCount: c.emails.length,
            hasAttachment: 0,
            latestSubject: last?.subject ?? null,
          });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, byKey]);

  const openedItem: GroupedItem | null = openKey
    ? (byKey.get(openKey) ??
      (fallback && itemKey(fallback) === openKey ? fallback : null))
    : null;

  const selectedItems = useMemo(
    () =>
      [...selected]
        .map(
          (k) =>
            byKey.get(k) ??
            (openedItem && itemKey(openedItem) === k ? openedItem : null),
        )
        .filter((x): x is GroupedItem => !!x),
    [selected, byKey, openedItem],
  );
  /** Rows a toolbar action applies to. */
  const targets: GroupedItem[] =
    selectedItems.length > 0 ? selectedItems : openedItem ? [openedItem] : [];

  const setOpen = useCallback(
    (key: string | null, replace = false) => {
      const next = new URLSearchParams(params);
      if (key) next.set("open", key);
      else next.delete("open");
      // Leaving a /inbox/:inbox/:personId deep link: go back to "/".
      if (routeParams.personId) {
        navigate(`/?${next.toString()}`, { replace });
      } else {
        setParams(next, { replace });
      }
    },
    [params, setParams, navigate, routeParams.personId],
  );

  const openItem = useCallback(
    (item: GroupedItem | null, opts?: { replace?: boolean }) => {
      setOpen(item ? itemKey(item) : null, opts?.replace);
      if (!item) setSelected(new Set());
    },
    [setOpen],
  );

  /** Row click with Ctrl/Cmd (toggle) and Shift (range) multi-select. */
  const clickRow = useCallback(
    (
      item: GroupedItem,
      e: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
    ) => {
      const key = itemKey(item);
      if (e.shiftKey && anchorRef.current) {
        const keys = rangeKeys(order, anchorRef.current, key);
        setSelected(new Set(keys));
        if (keys.length > 1) setOpen(null, true);
        return;
      }
      if (e.ctrlKey || e.metaKey || checkMode) {
        const next = new Set(selected);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        anchorRef.current = key;
        setSelected(next);
        if (next.size === 1 && !checkMode) setOpen([...next][0], true);
        else if (openKey) setOpen(null, true);
        return;
      }
      anchorRef.current = key;
      openItem(item);
    },
    [order, selected, checkMode, setOpen, openItem, openKey],
  );

  const toggleChecked = useCallback(
    (item: GroupedItem) => {
      const key = itemKey(item);
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      anchorRef.current = key;
      setSelected(next);
      if (openKey) setOpen(null, true);
    },
    [selected, openKey, setOpen],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(order));
    if (openKey) setOpen(null, true);
  }, [order, openKey, setOpen]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setCheckMode(false);
    if (openKey) setOpen(null);
  }, [openKey, setOpen]);

  /** Move the open row up or down the list. */
  const step = useCallback(
    (dir: 1 | -1) => {
      if (order.length === 0) return;
      const cur = openKey ?? [...selected][0] ?? null;
      const i = cur ? order.indexOf(cur) : -1;
      const j = Math.max(0, Math.min(order.length - 1, i + dir));
      const it = byKey.get(order[j]);
      if (it) openItem(it, { replace: true });
    },
    [order, openKey, selected, byKey, openItem],
  );

  /** After a row leaves the view, open its neighbour (Outlook default). */
  const openNeighbour = useCallback(
    (gone: GroupedItem[]) => {
      if (!openKey) return;
      const goneKeys = new Set(gone.map(itemKey));
      if (!goneKeys.has(openKey)) return;
      const i = order.indexOf(openKey);
      const rest = order.filter((k) => !goneKeys.has(k));
      const nextKey = rest[Math.min(i, rest.length - 1)] ?? null;
      const it = nextKey ? byKey.get(nextKey) : null;
      openItem(it ?? null, { replace: true });
    },
    [openKey, order, byKey, openItem],
  );

  // ── Undo (last mail-state action) ─────────────────────────────────────
  const [undoEntry, setUndoEntry] = useState<{
    label: string;
    run: () => Promise<unknown>;
  } | null>(null);
  const remember = (labelText: string, items: GroupedItem[], inverse: Patch) =>
    setUndoEntry({
      label: labelText,
      run: () => updateMailState(items.map(itemRef), inverse),
    });

  const undo = useCallback(async () => {
    if (!undoEntry) return;
    const entry = undoEntry;
    setUndoEntry(null);
    try {
      await entry.run();
      showToast({ kind: "info", message: `Undone: ${entry.label}` });
    } finally {
      setEarlier([]);
      list.refresh();
    }
  }, [undoEntry, list]);

  // ── Actions ───────────────────────────────────────────────────────────
  const removesOnArchive = folder !== "archive" && !(q && !scopeCurrent);

  const ops = {
    archive: (items: GroupedItem[]) => {
      if (!items.length) return;
      openNeighbour(items);
      patchEarlier(items, { archived: true }, removesOnArchive);
      remember("Archive", items, { archived: false });
      void list.actions.archive(items);
    },
    moveToInbox: (items: GroupedItem[]) => {
      if (!items.length) return;
      if (folder === "archive" || folder === "snoozed") openNeighbour(items);
      patchEarlier(items, {}, folder === "archive" || folder === "snoozed");
      const wasSnoozed = items.filter((i) => i.snoozedUntil);
      remember("Move to Inbox", items, { archived: true });
      void list.actions.unarchive(items);
      if (wasSnoozed.length) void list.actions.unsnooze(wasSnoozed);
    },
    flag: (items: GroupedItem[], value?: boolean) => {
      if (!items.length) return;
      const v = value ?? !items.every((i) => i.starred);
      const remove = folder === "flagged" && !v;
      if (remove) openNeighbour(items);
      patchEarlier(items, { starred: v }, remove);
      remember(v ? "Flag" : "Unflag", items, { starred: !v });
      void list.actions.toggleStar(items, v);
    },
    pin: (items: GroupedItem[], value?: boolean) => {
      if (!items.length) return;
      const v = value ?? !items.every((i) => i.pinned);
      patchEarlier(items, { pinned: v }, false);
      remember(v ? "Pin" : "Unpin", items, { pinned: !v });
      void list.actions.togglePin(items, v);
    },
    snooze: (items: GroupedItem[], until: number) => {
      if (!items.length) return;
      if (folder !== "snoozed") openNeighbour(items);
      patchEarlier(items, { snoozedUntil: until }, folder !== "snoozed");
      remember("Snooze", items, { snoozedUntil: null });
      void list.actions.snooze(items, until);
    },
    markRead: (items: GroupedItem[]) => {
      const unread = items.filter((i) => i.unreadCount > 0);
      if (!unread.length) return;
      patchEarlier(unread, { unreadCount: 0 }, false);
      setUndoEntry(null);
      void list.actions.markRead(unread);
    },
    markUnread: async (items: GroupedItem[]) => {
      if (!items.length) return;
      setUndoEntry(null);
      patchEarlier(items, { unreadCount: 1 }, false);
      try {
        await Promise.all(
          items.map(async (it) => {
            const emails =
              it.type === "person"
                ? (await fetchPersonEmails(it.id, { limit: 25 })).emails
                : [...(await fetchConversationEmails(it.id)).emails].reverse();
            const latest = emails.find((e) => e.type === "received");
            if (latest) await markEmailRead(latest.id, false);
          }),
        );
      } catch (e) {
        showToast({
          kind: "error",
          message: e instanceof Error ? e.message : "Could not mark unread",
        });
      }
      list.refresh();
    },
    toggleRead: (items: GroupedItem[]) => {
      if (items.some((i) => i.unreadCount > 0)) ops.markRead(items);
      else void ops.markUnread(items);
    },
    delete: async (items: GroupedItem[]) => {
      const people = items.filter((i) => i.type === "person");
      if (people.length === 0) {
        showToast({
          kind: "warning",
          message: "Group conversations can't be deleted",
          description: "Archive them instead.",
        });
        return;
      }
      const ok = window.confirm(
        people.length === 1
          ? `Permanently delete the conversation with ${itemTitle(people[0])}? This can't be undone.`
          : `Permanently delete ${people.length} conversations? This can't be undone.`,
      );
      if (!ok) return;
      openNeighbour(people);
      patchEarlier(people, {}, true);
      setUndoEntry(null);
      await list.actions.deleteForever(people);
    },
    block: async (item: GroupedItem) => {
      if (item.type !== "person") {
        showToast({
          kind: "warning",
          message: "Open a single person's mail to block a sender",
        });
        return;
      }
      if (
        !window.confirm(
          `Block ${item.email}? New mail from this sender will be dropped.`,
        )
      )
        return;
      try {
        await addBlock({ type: "email", value: item.email });
        showToast({ kind: "success", message: `Blocked ${item.email}` });
        openNeighbour([item]);
        setEarlier([]);
        list.refresh();
      } catch {
        showToast({
          kind: "error",
          message: "Couldn't block",
          description: "This address may be one of your own.",
        });
      }
    },
    markAllRead: () => ops.markRead(allItems),
  };

  const goFolder = useCallback(
    (t: FolderTarget) => navigate(folderHref(t)),
    [navigate],
  );

  const folderTitle = q
    ? "Search results"
    : label
      ? label
      : FOLDER_LABELS[folder];

  return {
    folder,
    label,
    q,
    scopeCurrent,
    folderTitle,
    filter,
    setFilter,
    sort,
    setSort,
    focusTab,
    setFocusTab,
    showFocusTabs,
    focusSplit,
    list,
    allItems,
    filtered,
    mobileItems,
    groups,
    order,
    hasMore,
    loadMore,
    selected,
    selectedItems,
    setSelected,
    checkMode,
    setCheckMode,
    openKey,
    openedItem,
    targets,
    openItem,
    clickRow,
    toggleChecked,
    selectAll,
    clearSelection,
    step,
    ops,
    undo,
    canUndo: !!undoEntry,
    goFolder,
  };
}

export type OutlookMail = ReturnType<typeof useOutlookMail>;
