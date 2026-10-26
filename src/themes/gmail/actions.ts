import type { GroupedItem } from "@/lib/api";

/** Row-level mail actions the list, rows, menus and conversation share. */
export interface RowActions {
  archive: (items: GroupedItem[]) => void;
  /** Gmail's Mute: here, archive (new mail still un-archives). */
  mute: (items: GroupedItem[]) => void;
  /** Back to the inbox: un-archive and/or un-snooze. */
  moveToInbox: (items: GroupedItem[]) => void;
  /** Asks for confirmation, then deletes for good. */
  requestDelete: (items: GroupedItem[], after?: () => void) => void;
  markRead: (items: GroupedItem[]) => void;
  markUnread: (items: GroupedItem[]) => Promise<void>;
  snooze: (items: GroupedItem[], until: number) => void;
  /** Opens the snooze picker for these rows. */
  pickSnooze: (items: GroupedItem[], after?: () => void) => void;
  star: (items: GroupedItem[], value?: boolean) => void;
  pin: (items: GroupedItem[], value?: boolean) => void;
  /** Open the conversation and start a reply / reply all / forward. */
  respond: (item: GroupedItem, how: "reply" | "replyAll" | "forward") => void;
  /** Search for everything from this row's sender. */
  findFrom: (item: GroupedItem) => void;
  /** Open the conversation in a new browser tab. */
  openInNewWindow: (item: GroupedItem) => void;
  /** Filter the list to a label (inbox address). */
  showLabel: (address: string) => void;
}

/** Imperative hooks the keyboard handler calls on the open conversation. */
export interface ConversationHandle {
  reply: () => void;
  replyAll: () => void;
  forward: () => void;
  expandAll: () => void;
  collapseAll: () => void;
  nextMessage: () => void;
  prevMessage: () => void;
}

export function inInboxView(item: GroupedItem) {
  return !item.archivedAt && !item.snoozedUntil;
}

export function senderEmail(item: GroupedItem): string {
  return item.type === "person"
    ? item.email
    : (item.participants[0]?.email ?? "");
}
