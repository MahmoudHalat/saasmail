import { useCallback, useEffect, useRef, useState } from "react";
import {
  deletePerson,
  fetchGroupedPeople,
  fetchStats,
  markConversationsRead,
  markPeopleRead,
  updateMailState,
  type GroupedItem,
  type MailFolder,
  type MailItemRef,
  type Stats,
} from "@/lib/api";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import { onInboxRefresh } from "@/lib/inbox-events";
import { showToast } from "@/lib/toast";

/**
 * Inbox list data for the Gmail and Outlook layouts: one folder of grouped
 * rows (people and group conversations), paged, kept fresh by the realtime
 * socket, with optimistic star / pin / archive / snooze / read / delete.
 *
 * The default layout (InboxPage) predates this hook and keeps its own
 * state; new layouts should use this.
 */

export interface MailListQuery {
  folder: MailFolder;
  /** Inbox address to filter to (a Gmail "label" / Outlook folder). */
  recipient?: string;
  q?: string;
  unread?: boolean;
  drafts?: boolean;
  sequenced?: boolean;
}

export const MAIL_PAGE_SIZE = 50;

export function itemRef(item: GroupedItem): MailItemRef {
  return { type: item.type, id: item.id };
}

export function itemKey(item: Pick<GroupedItem, "type" | "id">): string {
  return `${item.type}:${item.id}`;
}

/** Display name for a row: the person, or the group's participants. */
export function itemTitle(item: GroupedItem): string {
  if (item.type === "person") return item.name || item.email;
  const names = item.participants.map((p) => p.name?.split(" ")[0] || p.email);
  return names.length > 0 ? names.join(", ") : item.inbox;
}

export function useMailList(query: MailListQuery) {
  const [items, setItems] = useState<GroupedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const reqId = useRef(0);

  const { folder, recipient, q, unread, drafts, sequenced } = query;

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const id = ++reqId.current;
      if (!opts?.silent) setLoading(true);
      try {
        const res = await fetchGroupedPeople({
          folder,
          recipient,
          q: q || undefined,
          unread,
          drafts,
          sequenced,
          page,
          limit: MAIL_PAGE_SIZE,
        });
        if (id !== reqId.current) return;
        setItems(res.data);
        setTotal(res.total);
        setError(null);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : "Could not load mail");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [folder, recipient, q, unread, drafts, sequenced, page],
  );

  const loadStats = useCallback(() => {
    fetchStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  // A new folder or filter starts at page 1.
  useEffect(() => {
    setPage(1);
  }, [folder, recipient, q, unread, drafts, sequenced]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refresh = useCallback(() => {
    void load({ silent: true });
    loadStats();
  }, [load, loadStats]);

  useRealtimeUpdates(refresh);
  useEffect(() => onInboxRefresh(refresh), [refresh]);

  /** Patch rows locally, then persist; on failure reload from the server. */
  const applyState = useCallback(
    async (
      targets: GroupedItem[],
      patch: {
        starred?: boolean;
        pinned?: boolean;
        archived?: boolean;
        snoozedUntil?: number | null;
      },
      opts?: {
        removeFromView?: boolean;
        /** Toast shown on success. */
        message?: string;
        /** Patch that reverses this one; adds an Undo button to the toast. */
        undo?: {
          starred?: boolean;
          pinned?: boolean;
          archived?: boolean;
          snoozedUntil?: number | null;
        };
      },
    ) => {
      if (targets.length === 0) return;
      const keys = new Set(targets.map(itemKey));
      const before = items;
      setItems((prev) => {
        const next = prev.map((it) =>
          keys.has(itemKey(it))
            ? {
                ...it,
                ...(patch.starred !== undefined && { starred: patch.starred }),
                ...(patch.pinned !== undefined && { pinned: patch.pinned }),
                ...(patch.archived !== undefined && {
                  archivedAt: patch.archived
                    ? Math.floor(Date.now() / 1000)
                    : null,
                }),
                ...(patch.snoozedUntil !== undefined && {
                  snoozedUntil: patch.snoozedUntil,
                }),
              }
            : it,
        );
        return opts?.removeFromView
          ? next.filter((it) => !keys.has(itemKey(it)))
          : next;
      });
      if (opts?.removeFromView) setTotal((t) => Math.max(0, t - keys.size));
      try {
        await updateMailState(targets.map(itemRef), patch);
        if (opts?.message) {
          const undo = opts.undo;
          showToast({
            kind: "info",
            message: opts.message,
            action: undo
              ? {
                  label: "Undo",
                  onClick: (dismiss) => {
                    dismiss();
                    updateMailState(targets.map(itemRef), undo)
                      .then(() => load({ silent: true }))
                      .catch(() => {});
                  },
                }
              : undefined,
          });
        }
      } catch (e) {
        setItems(before);
        showToast({
          kind: "error",
          message: e instanceof Error ? e.message : "Could not update mail",
        });
        void load({ silent: true });
      }
    },
    [items, load],
  );

  const inFolderAfter = (patch: {
    starred?: boolean;
    archived?: boolean;
    snoozedUntil?: number | null;
  }): boolean => {
    if (folder === "inbox")
      return !patch.archived && !(patch.snoozedUntil ?? null);
    if (folder === "archive") return patch.archived !== false;
    if (folder === "snoozed") return patch.snoozedUntil !== null;
    if (folder === "starred") return patch.starred !== false;
    return true;
  };

  const actions = {
    toggleStar: (targets: GroupedItem[], starred?: boolean) => {
      const value = starred ?? !targets.every((t) => t.starred);
      return applyState(
        targets,
        { starred: value },
        { removeFromView: folder === "starred" && !value },
      );
    },
    togglePin: (targets: GroupedItem[], pinned?: boolean) => {
      const value = pinned ?? !targets.every((t) => t.pinned);
      return applyState(targets, { pinned: value }).then(() =>
        folder === "inbox" ? load({ silent: true }) : undefined,
      );
    },
    archive: (targets: GroupedItem[]) =>
      applyState(
        targets,
        { archived: true },
        {
          removeFromView: !inFolderAfter({ archived: true }),
          message:
            targets.length === 1
              ? "Conversation archived"
              : `${targets.length} conversations archived`,
          undo: { archived: false },
        },
      ),
    unarchive: (targets: GroupedItem[]) =>
      applyState(
        targets,
        { archived: false },
        {
          removeFromView: folder === "archive",
          message: "Moved to Inbox",
          undo: { archived: true },
        },
      ),
    snooze: (targets: GroupedItem[], until: number) =>
      applyState(
        targets,
        { snoozedUntil: until },
        {
          removeFromView: !inFolderAfter({ snoozedUntil: until }),
          undo: { snoozedUntil: null },
          message: `Snoozed until ${new Date(until * 1000).toLocaleString(
            undefined,
            {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            },
          )}`,
        },
      ),
    unsnooze: (targets: GroupedItem[]) =>
      applyState(
        targets,
        { snoozedUntil: null },
        { removeFromView: folder === "snoozed", message: "Unsnoozed" },
      ),
    markRead: async (targets: GroupedItem[]) => {
      const people = targets
        .filter((t) => t.type === "person")
        .map((t) => t.id);
      const groups = targets.filter((t) => t.type === "group").map((t) => t.id);
      const keys = new Set(targets.map(itemKey));
      setItems((prev) =>
        prev.map((it) =>
          keys.has(itemKey(it)) ? { ...it, unreadCount: 0 } : it,
        ),
      );
      try {
        await Promise.all([
          people.length ? markPeopleRead(people) : null,
          groups.length ? markConversationsRead(groups) : null,
        ]);
        loadStats();
      } catch (e) {
        showToast({
          kind: "error",
          message: e instanceof Error ? e.message : "Could not mark read",
        });
        void load({ silent: true });
      }
    },
    /** Permanently delete people (and their mail). Groups are skipped. */
    deleteForever: async (targets: GroupedItem[]) => {
      const people = targets.filter((t) => t.type === "person");
      if (people.length === 0) return;
      const keys = new Set(people.map(itemKey));
      setItems((prev) => prev.filter((it) => !keys.has(itemKey(it))));
      try {
        await Promise.all(people.map((p) => deletePerson(p.id)));
        showToast({
          kind: "success",
          message:
            people.length === 1
              ? "Conversation deleted"
              : `${people.length} conversations deleted`,
        });
        loadStats();
      } catch (e) {
        showToast({
          kind: "error",
          message: e instanceof Error ? e.message : "Could not delete",
        });
        void load({ silent: true });
      }
    },
  };

  return {
    items,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / MAIL_PAGE_SIZE)),
    setPage,
    loading,
    error,
    stats,
    refresh,
    actions,
  };
}

/** Common snooze presets (unix seconds), Gmail/Outlook style. */
export function snoozePresets(now = new Date()): Array<{
  id: string;
  label: string;
  until: number;
}> {
  const at = (d: Date, h: number) => {
    const x = new Date(d);
    x.setHours(h, 0, 0, 0);
    return x;
  };
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const laterToday = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  laterToday.setMinutes(0, 0, 0);
  const tomorrow = at(addDays(now, 1), 8);
  const daysToSat = (6 - now.getDay() + 7) % 7 || 7;
  const weekend = at(addDays(now, daysToSat), 8);
  const daysToMon = (8 - now.getDay()) % 7 || 7;
  const nextWeek = at(addDays(now, daysToMon), 8);
  const sec = (d: Date) => Math.floor(d.getTime() / 1000);
  const presets = [
    { id: "later", label: "Later today", until: sec(laterToday) },
    { id: "tomorrow", label: "Tomorrow", until: sec(tomorrow) },
    { id: "weekend", label: "This weekend", until: sec(weekend) },
    { id: "next-week", label: "Next week", until: sec(nextWeek) },
  ];
  // "Later today" makes no sense late at night.
  return laterToday.getDate() === now.getDate()
    ? presets
    : presets.filter((p) => p.id !== "later");
}
