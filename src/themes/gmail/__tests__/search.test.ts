import { describe, expect, it } from "vitest";
import {
  buildListSearch,
  folderQuery,
  parseListState,
  parseSearchQuery,
  pushRecent,
  resolveShortcut,
  stateToQuery,
  withinRange,
} from "../lib";

const labels = [
  { address: "support@acme.com", displayName: "Support" },
  { address: "billing@acme.com", displayName: null },
];

describe("parseSearchQuery", () => {
  it("keeps plain words as text and searches all mail", () => {
    const s = parseSearchQuery("quarterly report");
    expect(s.q).toBe("quarterly report");
    expect(s.folder).toBe("all");
  });

  it("maps Gmail operators to filters", () => {
    const s = parseSearchQuery(
      'from:ana@x.com is:unread has:attachment in:archive "exact words" invoice',
    );
    expect(s.from).toBe("ana@x.com");
    expect(s.unread).toBe(true);
    expect(s.attachment).toBe(true);
    expect(s.folder).toBe("archive");
    expect(s.q).toBe('"exact words" invoice');
  });

  it("understands quoted values and is:starred / is:snoozed / is:read", () => {
    expect(parseSearchQuery('from:"Ana Lopez"').from).toBe("Ana Lopez");
    expect(parseSearchQuery("is:starred").folder).toBe("starred");
    expect(parseSearchQuery("is:snoozed").folder).toBe("snoozed");
    expect(parseSearchQuery("is:read").read).toBe(true);
    expect(parseSearchQuery("in:anywhere").folder).toBe("all");
    expect(parseSearchQuery("in:sent").folder).toBe("sent");
    expect(parseSearchQuery("in:drafts").folder).toBe("drafts");
  });

  it("resolves label: by name or address", () => {
    expect(parseSearchQuery("label:support", labels).label).toBe(
      "support@acme.com",
    );
    expect(parseSearchQuery("label:billing", labels).label).toBe(
      "billing@acme.com",
    );
    expect(parseSearchQuery("label:other@x.com", labels).label).toBe(
      "other@x.com",
    );
  });

  it("reads category: and newer_than:/older_than:", () => {
    expect(parseSearchQuery("category:promotions").category).toBe("promotions");
    expect(parseSearchQuery("newer_than:7d").within).toBe("7d");
    expect(parseSearchQuery("older_than:1y").within).toBe("older1y");
  });

  it("leaves unknown operators in the text", () => {
    expect(parseSearchQuery("size:10m hello").q).toBe("size:10m hello");
    expect(parseSearchQuery("is:important").q).toBe("is:important");
  });

  it("round-trips through the search box text and the URL", () => {
    const text =
      "from:ana@x.com label:support is:unread has:attachment category:updates newer_than:1m report";
    const s = parseSearchQuery(text, labels);
    expect(stateToQuery(s, labels)).toBe(text);
    const again = parseListState(new URLSearchParams(buildListSearch(s)));
    expect(again).toEqual(s);
  });
});

describe("folderQuery with tabs", () => {
  it("adds the Primary category to the inbox only when tabs are on", () => {
    const inbox = parseListState(new URLSearchParams(""));
    expect(folderQuery(inbox, true).category).toBe("primary");
    expect(folderQuery(inbox, false).category).toBeUndefined();
    const promos = parseListState(new URLSearchParams("tab=promotions"));
    expect(folderQuery(promos, true)).toEqual({
      folder: "inbox",
      category: "promotions",
    });
    expect(
      folderQuery(parseListState(new URLSearchParams("folder=sent")), true)
        .category,
    ).toBeUndefined();
  });
});

describe("resolveShortcut", () => {
  it("handles g and * prefixes", () => {
    expect(resolveShortcut({ key: "g" })).toEqual({ prefix: "g" });
    expect(resolveShortcut({ key: "i" }, "g")).toEqual({ cmd: "goInbox" });
    expect(resolveShortcut({ key: "t" }, "g")).toEqual({ cmd: "goSent" });
    expect(resolveShortcut({ key: "*", shiftKey: true })).toEqual({
      prefix: "*",
    });
    expect(resolveShortcut({ key: "u" }, "*")).toEqual({
      cmd: "selectUnread",
    });
    expect(resolveShortcut({ key: "q" }, "g")).toEqual({});
  });
  it("maps the single keys", () => {
    expect(resolveShortcut({ key: "z" }).cmd).toBe("undo");
    expect(resolveShortcut({ key: "]" }).cmd).toBe("archiveOlder");
    expect(resolveShortcut({ key: "[" }).cmd).toBe("archiveNewer");
    expect(resolveShortcut({ key: ";" }).cmd).toBe("expandAll");
    expect(resolveShortcut({ key: ":", shiftKey: true }).cmd).toBe(
      "collapseAll",
    );
    expect(resolveShortcut({ key: "e", ctrlKey: true })).toEqual({});
  });
});

describe("misc", () => {
  it("computes date windows", () => {
    const now = new Date(2026, 9, 26);
    const t = Math.floor(now.getTime() / 1000);
    expect(withinRange("7d", now)).toEqual({
      after: t - 7 * 86400,
      before: null,
    });
    expect(withinRange("older1y", now)).toEqual({
      after: null,
      before: t - 365 * 86400,
    });
    expect(withinRange("", now)).toEqual({ after: null, before: null });
  });
  it("keeps recent searches unique and capped", () => {
    expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]);
    expect(pushRecent(["a"], "  ")).toEqual(["a"]);
    expect(pushRecent(["1", "2", "3"], "4", 3)).toEqual(["4", "1", "2"]);
  });
});
