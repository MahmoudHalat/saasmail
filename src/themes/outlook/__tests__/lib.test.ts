import { describe, expect, it } from "vitest";
import type { GroupedItem } from "@/lib/api";
import {
  applyFilter,
  commandForKey,
  dateBucket,
  folderQuery,
  forwardSubject,
  groupRows,
  initials,
  parseFolder,
  rangeKeys,
  splitFocused,
  swipeOutcome,
} from "../lib";

// Thu 22 Oct 2026, 14:00 local.
const NOW = new Date(2026, 9, 22, 14, 0, 0);
const sec = (d: Date) => Math.floor(d.getTime() / 1000);
const at = (y: number, m: number, d: number, h = 9) =>
  sec(new Date(y, m, d, h));

function row(id: string, patch: Partial<GroupedItem> = {}): GroupedItem {
  return {
    type: "person",
    id,
    email: `${id}@x.test`,
    name: id,
    lastEmailAt: sec(NOW),
    unreadCount: 0,
    totalCount: 1,
    recipientCount: 1,
    recipients: [],
    hasAttachment: 0,
    starred: false,
    pinned: false,
    archivedAt: null,
    snoozedUntil: null,
    hasSent: false,
    latestSubject: null,
    snippet: null,
    ...patch,
  } as GroupedItem;
}

describe("dateBucket", () => {
  it("buckets like Outlook", () => {
    expect(dateBucket(at(2026, 9, 22, 8), NOW)).toBe("Today");
    expect(dateBucket(at(2026, 9, 21, 23), NOW)).toBe("Yesterday");
    // Week starts Sunday 18 Oct.
    expect(dateBucket(at(2026, 9, 18), NOW)).toBe("This week");
    expect(dateBucket(at(2026, 9, 17), NOW)).toBe("Last week");
    expect(dateBucket(at(2026, 9, 11), NOW)).toBe("Last week");
    expect(dateBucket(at(2026, 9, 10), NOW)).toBe("Earlier this month");
    expect(dateBucket(at(2026, 9, 3), NOW)).toBe("Earlier this month");
    expect(dateBucket(at(2026, 8, 3), NOW)).toBe("Last month");
    expect(dateBucket(at(2026, 6, 3), NOW)).toBe("Older");
  });
});

describe("groupRows", () => {
  it("puts pinned rows first, then date buckets", () => {
    const items = [
      row("a", { lastEmailAt: at(2026, 9, 22) }),
      row("b", { lastEmailAt: at(2026, 9, 1), pinned: true }),
      row("c", { lastEmailAt: at(2026, 9, 21) }),
      row("d", { lastEmailAt: at(2026, 9, 22, 7) }),
    ];
    const groups = groupRows(items, "date", (i) => i.id, NOW);
    expect(groups.map((g) => g.label)).toEqual([
      "Pinned",
      "Today",
      "Yesterday",
    ]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["a", "d"]);
  });

  it("groups by letter for From sort and by state for Unread sort", () => {
    const items = [row("zed"), row("amy", { unreadCount: 2 }), row("Al")];
    expect(
      groupRows(items, "from", (i) => i.id, NOW).map((g) => [
        g.label,
        g.items.length,
      ]),
    ).toEqual([
      ["A", 2],
      ["Z", 1],
    ]);
    expect(
      groupRows(items, "unread", (i) => i.id, NOW).map((g) => g.label),
    ).toEqual(["Unread", "Read"]);
  });
});

describe("splitFocused", () => {
  it("treats replied, flagged and pinned rows as Focused", () => {
    const { focused, other } = splitFocused([
      row("replied", { hasSent: true }),
      row("flagged", { starred: true }),
      row("pinned", { pinned: true }),
      row("cold"),
    ]);
    expect(focused.map((i) => i.id)).toEqual(["replied", "flagged", "pinned"]);
    expect(other.map((i) => i.id)).toEqual(["cold"]);
  });
});

describe("filters and folders", () => {
  it("filters rows client-side", () => {
    const items = [
      row("a", { unreadCount: 1 }),
      row("b", { hasAttachment: 1 }),
      row("c", { starred: true }),
    ];
    expect(applyFilter(items, "unread").map((i) => i.id)).toEqual(["a"]);
    expect(applyFilter(items, "files").map((i) => i.id)).toEqual(["b"]);
    expect(applyFilter(items, "flagged").map((i) => i.id)).toEqual(["c"]);
    expect(applyFilter(items, "all")).toHaveLength(3);
  });

  it("maps Outlook folders to server queries", () => {
    expect(parseFolder("nope")).toBe("inbox");
    expect(folderQuery("flagged")).toEqual({ folder: "starred" });
    expect(folderQuery("drafts")).toEqual({ folder: "all", drafts: true });
    expect(folderQuery("sent")).toEqual({ folder: "sent" });
  });
});

describe("commandForKey", () => {
  it("maps the Outlook web shortcut set", () => {
    expect(commandForKey({ key: "n", ctrlKey: true })).toBe("newMail");
    expect(commandForKey({ key: "r", metaKey: true })).toBe("reply");
    expect(commandForKey({ key: "R", ctrlKey: true, shiftKey: true })).toBe(
      "replyAll",
    );
    expect(commandForKey({ key: "F", ctrlKey: true, shiftKey: true })).toBe(
      "forward",
    );
    expect(commandForKey({ key: "q", ctrlKey: true })).toBe("markRead");
    expect(commandForKey({ key: "u", ctrlKey: true })).toBe("markUnread");
    expect(commandForKey({ key: "Delete" })).toBe("delete");
    expect(commandForKey({ key: "e" })).toBe("archive");
    expect(commandForKey({ key: "Insert" })).toBe("flag");
    expect(commandForKey({ key: "ArrowDown" })).toBe("next");
    expect(commandForKey({ key: "?", shiftKey: true })).toBe("help");
    expect(commandForKey({ key: "x" })).toBeNull();
    expect(commandForKey({ key: "z", ctrlKey: true })).toBeNull();
  });
});

describe("misc helpers", () => {
  it("builds initials", () => {
    expect(initials("Vera Wayne")).toBe("VW");
    expect(initials("vera.wayne@piedpiper.ai")).toBe("VW");
    expect(initials("bob")).toBe("B");
    expect(initials("")).toBe("?");
  });

  it("builds a forward subject without stacking prefixes", () => {
    expect(forwardSubject("Re: Fwd: Quote")).toBe("Fwd: Quote");
  });

  it("computes shift-click ranges in either direction", () => {
    const order = ["a", "b", "c", "d"];
    expect(rangeKeys(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeKeys(order, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("decides swipe outcomes past a threshold", () => {
    expect(swipeOutcome(150, 390)).toBe("archive");
    expect(swipeOutcome(-150, 390)).toBe("flag");
    expect(swipeOutcome(40, 390)).toBeNull();
  });
});
