import type { GroupedItem } from "@/lib/api";

/** Row-level mail actions the list, rows and conversation share. */
export interface RowActions {
  archive: (items: GroupedItem[]) => void;
  /** Back to the inbox: un-archive and/or un-snooze. */
  moveToInbox: (items: GroupedItem[]) => void;
  /** Asks for confirmation, then deletes for good. */
  requestDelete: (items: GroupedItem[], after?: () => void) => void;
  markRead: (items: GroupedItem[]) => void;
  markUnread: (items: GroupedItem[]) => Promise<void>;
  snooze: (items: GroupedItem[], until: number) => void;
  /** Opens the "Pick date & time" dialog for these rows. */
  pickSnooze: (items: GroupedItem[], after?: () => void) => void;
  star: (items: GroupedItem[], value?: boolean) => void;
  pin: (items: GroupedItem[], value?: boolean) => void;
}

/** Imperative hooks the keyboard handler calls on the open conversation. */
export interface ConversationHandle {
  reply: () => void;
  replyAll: () => void;
  forward: () => void;
}

export function inInboxView(item: GroupedItem) {
  return !item.archivedAt && !item.snoozedUntil;
}
